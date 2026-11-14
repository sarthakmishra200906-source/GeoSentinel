import User from '../models/User.js'
import GuidelineDocument from '../models/GuidelineDocument.js'
import { generateGroundedAnswer } from '../services/groundedChat.js'
import { getCachedFaqAnswer } from '../services/faqCache.js'

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
          answer: cachedAnswer.answer,
          aiResponse: cachedAnswer.answer,
          currentMemorySummary: request.user.memorySummary || 'New user, no prior emergency chat history.',
          grounded: true,
          status: 'GROUNDED',
          warnings: ['Answered from the built-in basic safety cache; no database or LLM call was made.'],
          sources: [cachedAnswer.source],
        },
      })
      return
    }
    const user = await User.findById(request.user._id)
    if (!user) {
      response.status(404).json({ success: false, message: 'User not found' })
      return
    }
    const needsMobilityAssistance = mobilityKeywords.some((keyword) =>
      normalizedMessage.includes(keyword),
    )

    const currentMemorySummary =
      user.memorySummary || 'New user, no prior emergency chat history.'
    if (needsMobilityAssistance && !currentMemorySummary.includes('Needs mobility assistance.')) {
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
    const matches = promptInjectionPattern.test(message) || !phraseSupported
      ? []
      : documents
      .flatMap((document) =>
        document.chunks
          .map((chunk) => {
            const chunkText = chunk.text.toLowerCase()
            const termScore = terms.reduce((score, term) => score + (chunkText.includes(term) ? 1 : 0), 0)
            const phraseScore = phrase.length > 12 && chunkText.includes(phrase) ? 3 : 0
            return { document, chunk, score: termScore + phraseScore }
          }),
      )
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)

    const generated = matches.length
      ? await generateGroundedAnswer({ question: message.trim(), matches })
      : {
          status: 'NO_SUPPORT',
          answer: 'I could not find approved government guidance supporting an answer to that question.',
          warning: null,
        }
    const modelRefused = typeof generated.answer === 'string' && /\bNO_SUPPORT\b/i.test(generated.answer)
    const responseStatus = modelRefused ? 'NO_SUPPORT' : generated.status

    response.status(200).json({
      success: true,
      data: {
        userMessage: message.trim(),
        answer: generated.answer,
        aiResponse: generated.answer,
        currentMemorySummary: user.memorySummary || currentMemorySummary,
        grounded: responseStatus === 'GROUNDED',
        status: responseStatus,
        provider: generated.provider || null,
        model: generated.model || null,
        warnings: generated.warning ? [generated.warning] : [],
        sources: matches.map(({ document, chunk }) => ({
          documentId: document._id,
          title: document.title,
          issuingAuthority: document.issuingAuthority,
          officialUrl: document.officialUrl,
          section: chunk.section,
          page: chunk.page,
          context: chunk.text,
        })),
      },
    })
  } catch (error) {
    next(error)
  }
}
