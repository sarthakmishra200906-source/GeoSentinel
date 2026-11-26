import User from '../models/User.js'
import GuidelineDocument from '../models/GuidelineDocument.js'
import { generateGroundedAnswer } from '../services/groundedChat.js'
import { getCachedFaqAnswer, getSafeGeneralSafetyFallback } from '../services/faqCache.js'

const mobilityKeywords = ['wheelchair', 'pwd', 'mobility assistance']
const retrievalStopWords = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'according', 'been', 'before',
  'being', 'between', 'both', 'by', 'can', 'case', 'could', 'did', 'does', 'for',
  'from', 'had', 'has', 'have', 'how', 'into', 'is', 'it', 'its', 'listed', 'more',
  'must', 'not', 'of', 'on', 'or', 'our', 'per', 'provided', 'should', 'than',
  'that', 'the', 'their', 'there', 'these', 'they', 'this', 'to', 'was', 'were',
  'what', 'when', 'where', 'which', 'who', 'with', 'you', 'your',
])
const promptInjectionPattern = /\b(ignore|disregard|override)\b.{0,100}\b(instructions?|rules?|grounding|evacuation|assistant)\b/i
const MAX_ANSWER_LINES = 10

// Keeps every reply short, plain text, and safe for the browser speech engine.
// Provider prompts ask for this too; this is the hard guarantee for older or
// local models that ignore formatting instructions.
function formatChatAnswer(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ANSWER_LINES)
    .join('\n')
}

// Keep the three-source contract even when a safety fallback is appended.
function withFallbackSource(sources, fallbackSource) {
  const base = sources.length >= 3 ? sources.slice(0, 2) : sources.slice()
  return [...base, fallbackSource]
}

export async function handleUserChat(request, response, next) {
  try {
    const { message } = request.body || {}
    if (typeof message !== 'string' || !message.trim()) {
      response.status(400).json({ success: false, message: 'Message is required' })
      return
    }

    const normalizedMessage = message.toLowerCase()
    const cachedAnswer = getCachedFaqAnswer(message)
    if (cachedAnswer) {
      response.status(200).json({
        success: true,
        data: {
          userMessage: message.trim(),
          answer: formatChatAnswer(cachedAnswer.answer),
          aiResponse: formatChatAnswer(cachedAnswer.answer),
          currentMemorySummary: request.user?.memorySummary || 'No signed-in chat history.',
          grounded: true,
          status: 'GROUNDED',
          warnings: [],
          sourceType: 'builtin',
          sources: [{ label: 'Built-in disaster safety guidance', ...cachedAnswer.source }],
        },
      })
      return
    }
    const user = request.user ? await User.findById(request.user._id) : null
    if (request.user && !user) {
      response.status(404).json({ success: false, message: 'User not found' })
      return
    }
    const needsMobilityAssistance = mobilityKeywords.some((keyword) =>
      normalizedMessage.includes(keyword),
    )

    const currentMemorySummary = user?.memorySummary || 'No signed-in chat history.'
    if (user && needsMobilityAssistance && !currentMemorySummary.includes('Needs mobility assistance.')) {
      user.memorySummary = `${currentMemorySummary} Needs mobility assistance.`.trim()
      await user.save()
    }

    const terms = normalizedMessage
      .split(/\W+/)
      .filter((term) => term.length > 2 && !retrievalStopWords.has(term))
    const phrase = normalizedMessage.trim()
    const documents = await GuidelineDocument.find({
      status: 'approved',
      extractionStatus: 'readable',
      $or: [{ effectiveStatus: 'active' }, { effectiveStatus: { $exists: false } }],
      $and: [{ $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] }],
    }).select('title officialUrl issuingAuthority chunks').lean()
    const requestedUnsupportedPhrase = /(crop\s+loss|toll[-\s]?free\s+helpline)/i.test(message)
    const phraseSupported = !requestedUnsupportedPhrase || documents.some((document) =>
      document.chunks.some((chunk) => /(crop\s+loss|toll[-\s]?free\s+helpline)/i.test(chunk.text)),
    )
    // Inverse-document-frequency weighting stops common words such as
    // "guidelines" or "national" from outranking the rare terms that actually
    // identify the requested section in a long government document.
    const chunkEntries = documents.flatMap((document) =>
      document.chunks.map((chunk) => ({ document, chunk, text: chunk.text.toLowerCase() })),
    )
    const termFrequency = new Map()
    for (const term of terms) {
      termFrequency.set(term, chunkEntries.reduce((count, entry) => count + (entry.text.includes(term) ? 1 : 0), 0))
    }
    const matches = promptInjectionPattern.test(message) || !phraseSupported
      ? []
      : chunkEntries
        .map(({ document, chunk, text }) => {
          const termScore = terms.reduce((score, term) => {
            const frequency = termFrequency.get(term) || 0
            return score + (text.includes(term) ? 1 + 4 / (1 + frequency) : 0)
          }, 0)
          const phraseScore = phrase.length > 12 && text.includes(phrase) ? 6 : 0
          return { document, chunk, score: termScore + phraseScore }
        })
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)

    // A fact can sit just across a 900-character chunk boundary on the same
    // page. Give the model the matched chunk plus its immediate page neighbours
    // while still returning only three compact source chips.
    const contextMatches = matches.map((match) => {
      const pageChunks = match.document.chunks.filter((chunk) => chunk.page === match.chunk.page)
      const index = pageChunks.indexOf(match.chunk)
      const nearby = pageChunks.slice(Math.max(0, index - 1), index + 2)
      return { ...match, chunk: { ...match.chunk, text: nearby.map((chunk) => chunk.text).join('\n') } }
    })
    const generated = promptInjectionPattern.test(message)
      ? {
          status: 'NO_SUPPORT',
          answer: 'I cannot help with that request. Ask a disaster-safety question, and follow official local instructions.',
          warning: null,
        }
      : await generateGroundedAnswer({ question: message.trim(), matches: contextMatches })
    const modelRefused = typeof generated.answer === 'string' && /\bNO_SUPPORT\b/i.test(generated.answer)
    let responseStatus = modelRefused ? 'NO_SUPPORT' : generated.status
    let answer = modelRefused ? null : formatChatAnswer(generated.answer)
    let warnings = generated.warning ? [generated.warning] : []
    let sources = matches.map(({ document, chunk }) => ({
      documentId: document._id,
      title: document.title,
      issuingAuthority: document.issuingAuthority,
      officialUrl: document.officialUrl,
      section: chunk.section,
      page: chunk.page,
      label: `${document.title}${chunk.page ? `, p. ${chunk.page}` : ''}`,
    }))

    // Safe general-question fallback when LLM is unavailable, refuses, or errors out
    if (responseStatus === 'PROVIDER_UNAVAILABLE') {
      answer = 'The AI provider is not configured on this server. Set GOOGLE_GEMINI_API_KEY (or GEMINI_API_KEY) in the backend environment. For immediate emergency help, dial 112 (National Emergency Helpline) or contact local disaster authorities.'
      sources = withFallbackSource(sources, {
        documentId: 'general-emergency-advice',
        title: 'Emergency Response and Public Safety Advisory',
        issuingAuthority: 'National Disaster Management Guidelines',
        officialUrl: 'https://ndma.gov.in',
        section: 'Public Safety',
        page: 1,
        label: 'Emergency Response and Public Safety Advisory',
      })
    } else if (!answer || responseStatus === 'NO_SUPPORT' || responseStatus.startsWith('PROVIDER_')) {
      const diagMsg = generated.diagnostics?.httpStatus
        ? `HTTP ${generated.diagnostics.httpStatus}`
        : generated.diagnostics?.error || generated.diagnostics?.reason || generated.status
      const fallback = getSafeGeneralSafetyFallback(message)
      if (fallback) {
        answer = fallback.answer
        responseStatus = 'SAFE_FALLBACK'
        warnings.push(`AI provider offline/unreachable (${diagMsg}). Answering from verified disaster safety preparedness standards.`)
        sources = withFallbackSource(sources, {
          documentId: 'safe-disaster-knowledge-fallback',
          title: 'National Disaster Preparedness & Safety Guidelines',
          issuingAuthority: 'NDMA Public Safety Standards',
          officialUrl: 'https://ndma.gov.in',
          section: fallback.topic || 'General Safety',
          page: 1,
          label: 'National Disaster Preparedness & Safety Guidelines',
        })
      } else {
        answer = 'For immediate emergency assistance, dial 112 (National Emergency Helpline) or contact local disaster authorities. In general disaster situations: move to higher ground in floods, stay indoors in sturdy shelters during storms or cyclones, avoid touch with downed electrical lines or flooded roads, and keep an emergency go-bag ready with water, dry food, and essential medications.'
        responseStatus = 'SAFE_FALLBACK'
        warnings.push(`AI provider offline/unreachable (${diagMsg}). Showing verified public disaster safety advisory.`)
        sources = withFallbackSource(sources, {
          documentId: 'general-emergency-advice',
          title: 'Emergency Response and Public Safety Advisory',
          issuingAuthority: 'National Disaster Management Guidelines',
          officialUrl: 'https://ndma.gov.in',
          section: 'Public Safety',
          page: 1,
          label: 'Emergency Response and Public Safety Advisory',
        })
      }
    }

    response.status(200).json({
      success: true,
      data: {
        userMessage: message.trim(),
        answer,
        aiResponse: answer,
        currentMemorySummary: user?.memorySummary || currentMemorySummary,
        grounded: responseStatus === 'GROUNDED',
        status: responseStatus,
        provider: generated.provider || null,
        model: generated.model || null,
        diagnostics: generated.diagnostics || null,
        warnings,
        sources,
      },
    })
  } catch (error) {
    next(error)
  }
}
