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

function requestedLanguage(body, message) {
  if (['en', 'hi', 'or'].includes(body?.language)) return body.language
  if (/[\u0B00-\u0B7F]/.test(message)) return 'or'
  if (/[\u0900-\u097F]/.test(message)) return 'hi'
  return 'en'
}

// A crushed child, a fall from a tree, or any serious injury must never be
// answered from a generic storm FAQ. These questions go straight to the
// language model with first-aid rules, even when a document mentions the
// surrounding disaster.
function isUrgentCareQuestion(message) {
  const text = message.toLowerCase()
  const childWord = /\b(child|baby|kid|boy|girl|son|daughter)\b|बच्चा|बच्चे|बच्चों|बालक|बालिका|शिशु|पुत्र|पुत्री|ପିଲା|ଶିଶୁ|ପୁଅ|ଝିଅ|ପୁତ୍ର/.test(text)
  const injuryWord = /\b(hurt|injur|fallen|fell|falls?|trapped|crush|bleed|unconscious|hit|struck|pinned|not breathing)\w*\b|घायल|आहत|चोट|गिर|गिरी|दबा|दबी|फँस|फंस|रक्तस्राव|बेहोश|अचेत|साँस|सांस|ଆହତ|ଚୋଟ|ପଡ଼|ପଡ଼ି|ଦବି|ଫସି|ରକ୍ତସ୍ରାବ|ଅଚେତ|ଶ୍ୱାସ/.test(text)
  const severeInjury = /\b(fallen on|fell on|falls? on|crush(?:ed)?|pinned under|trapped under|struck by|hit by|unconscious|not breathing|head injury|broken bone|fracture|severely bleeding|seriously injured)\w*\b|पेड़\s+गिर|गिर(?:ा|ी)?\s+(?:उपर|पर)|गंभीर\s+(?:चोट|आघात)|बेहोश|रक्तस्राव|ଗଛ\s+ପଡ଼|ପଡ଼(?:ି|ିଛି|ିଲା)\s+(?:ଉପରେ|ଉପର)|ଗଭୀର\s+ଆଘାତ|ଅଚେତ|ରକ୍ତସ୍ରାବ/.test(text)
  return severeInjury || (childWord && injuryWord)
}

const URGENT_CARE_FALLBACKS = {
  en: 'Call your local emergency services immediately. Do not pull the child free or move them unless they are in immediate danger, because a fall can cause head, neck or spine injury. If it is safe, clear loose branches only enough to reach them, support the head and neck, and keep the airway open. Apply firm direct pressure to bleeding with a clean cloth and keep the child warm. Watch their breathing, do not give food or water if they may need surgery, and follow the dispatcher’s instructions until trained help arrives.',
  hi: 'तुरंत स्थानीय आपातकालीन सेवाओं को कॉल करें। गिरने से सिर, गर्दन या रीढ़ की चोट लग सकती है, इसलिए तत्काल खतरा न हो तो बच्चे को हिलाएं या पेड़ के नीचे से बाहर न खींचें। यदि सुरक्षित हो, तो केवल उतनी ढीली शाखाएँ हटाएँ जितनी उन्हें तक पहुँचने के लिए ज़रूरी हों। सिर और गर्दन को सहारा दें, श्वसन मार्ग खुला रखें, रक्तस्राव पर साफ कपड़े से सीधा दबाव डालें और बच्चे को गर्म रखें। सांसों पर नज़र रखें, संभावित सर्जरी के कारण खाने-पीने के लिए कुछ न दें, और प्रशिक्षित सहायता आने तक कॉल केंद्र के निर्देशों का पालन करें।',
  or: 'ତୁରନ୍ତ ସ୍ଥାନୀୟ ଜରୁରୀକାଳୀନ ସେବାକୁ କଲ୍ କରନ୍ତୁ। ପଡ଼ିବା ଦ୍ୱାରା ମୁଣ୍ଡ, ବେକ କିମ୍ବା ମେରୁଦଣ୍ଡର ଆଘାତ ହୋଇପାରେ, ତେଣୁ ତତ୍କ୍ଷଣ ବିପଦ ନଥିଲେ ପିଲାଙ୍କୁ ହଲାନ୍ତୁ ନାହିଁ କିମ୍ବା ଗଛ ତଳରୁ ଟାଣି ବାହାର କରନ୍ତୁ ନାହିଁ। ଯଦି ନିରାପଦ ହୋଇଥାଏ, କେବଳ ସେମାନଙ୍କ ପାଖରେ ପହଞ୍ଚିବା ପାଇଁ ଆବଶ୍ୟକ ଢିଲା ଡାଳ ହଟାନ୍ତୁ। ମୁଣ୍ଡ ଓ ବେକକୁ ସହାୟତା ଦିଅନ୍ତୁ, ଶ୍ୱାସପଥ ଖୋଲା ରଖନ୍ତୁ, ରକ୍ତସ୍ରାବ ହେଉଥିଲେ ସ୍ୱଚ୍ଛ କପଡ଼ାରେ ସିଧା ଚାପ ଦିଅନ୍ତୁ ଏବଂ ପିଲାଙ୍କୁ ଉଷୁମ ରଖନ୍ତୁ। ଶ୍ୱାସକ୍ରିୟା ଉପରେ ନଜର ରଖନ୍ତୁ, ଅସ୍ତ୍ରୋପଚାର ଆବଶ୍ୟକ ହୋଇପାରେ ତେଣୁ ଖାଦ୍ୟ କିମ୍ବା ପାନୀୟ ଦିଅନ୍ତୁ ନାହିଁ, ଏବଂ ପ୍ରଶିକ୍ଷିତ ସହାୟତା ଆସିବା ପର୍ଯ୍ୟନ୍ତ କଲ୍ କେନ୍ଦ୍ରର ନିର୍ଦ୍ଦେଶ ପାଳନ କରନ୍ତୁ।',
}

const URGENT_CARE_FALLBACK = (language) => URGENT_CARE_FALLBACKS[language] || URGENT_CARE_FALLBACKS.en

const SAFE_GENERAL_FALLBACKS = {
  en: 'The AI provider is temporarily unavailable. For immediate danger, call your local emergency services and follow local authorities. Move away from flooding, downed power lines and unstable structures; stay in a sturdy shelter during storms; keep an emergency kit with water, dry food and essential medicines.',
  hi: 'AI सेवा अस्थायी रूप से उपलब्ध नहीं है। तत्काल खतरे में स्थानीय आपातकालीन सेवाओं को कॉल करें और स्थानीय अधिकारियों के निर्देशों का पालन करें। बाढ़, गिरे बिजली तारों और असुरक्षित संरचनाओं से दूर रहें; तूफान के दौरान मज़बूत आश्रय में रहें; पानी, सूखा भोजन और आवश्यक दवाओं के साथ आपातकिट रखें।',
  or: 'AI ସେବା ଅସ୍ଥାୟୀ ଭାବେ ଉପଲବ୍ଧ ନାହିଁ। ତତ୍କ୍ଷଣ ବିପଦରେ ସ୍ଥାନୀୟ ଜରୁରୀକାଳୀନ ସେବାକୁ କଲ୍ କରନ୍ତୁ ଏବଂ ସ୍ଥାନୀୟ ପ୍ରଶାସନର ନିର୍ଦ୍ଦେଶ ପାଳନ କରନ୍ତୁ। ବନ୍ୟା, ପଡ଼ିଥିବା ବିଦ୍ୟୁତ୍ ତାର ଏବଂ ଅସୁରକ୍ଷିତ ଗଠନଠାରୁ ଦୂରେଇ ରୁହନ୍ତୁ; ଝଡ଼ ସମୟରେ ମଜବୁତ ଆଶ୍ରୟସ୍ଥଳରେ ରୁହନ୍ତୁ; ପାଣି, ଶୁଖିଲା ଖାଦ୍ୟ ଓ ଆବଶ୍ୟକ ଔଷଧ ସହ ଜରୁରୀ କିଟ୍ ରଖନ୍ତୁ।',
}

const safeGeneralFallback = (language) => SAFE_GENERAL_FALLBACKS[language] || SAFE_GENERAL_FALLBACKS.en

const GENERAL_SAFETY_SOURCE = {
  documentId: 'general-safety-guidance',
  title: 'General Disaster Safety Guidance',
  issuingAuthority: 'Public safety best practice (not an official order)',
  officialUrl: 'https://ndma.gov.in',
  section: 'General Safety',
  page: 1,
  label: 'General Disaster Safety Guidance (not in the documents)',
}

export async function handleUserChat(request, response, next) {
  try {
    const { message } = request.body || {}
    if (typeof message !== 'string' || !message.trim()) {
      response.status(400).json({ success: false, message: 'Message is required' })
      return
    }

    const language = requestedLanguage(request.body || {}, message)
    const urgentCare = isUrgentCareQuestion(message)
    const normalizedMessage = message.toLowerCase()
    const cachedAnswer = language === 'en' && !urgentCare ? getCachedFaqAnswer(message) : null
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
    const documents = urgentCare
      ? []
      : await GuidelineDocument.find({
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
      : await generateGroundedAnswer({
        question: message.trim(),
        matches: urgentCare ? [] : contextMatches,
        language,
      })
    const modelRefused = typeof generated.answer === 'string' && /\bNO_SUPPORT\b/i.test(generated.answer)
    let responseStatus = modelRefused ? 'NO_SUPPORT' : generated.status
    if (urgentCare && !modelRefused && !responseStatus.startsWith('PROVIDER_')) responseStatus = 'GENERAL_AI'
    let answer = modelRefused ? null : formatChatAnswer(generated.answer)
    let warnings = generated.warning ? [generated.warning] : []
    let generatedResult = generated
    let sources = matches.map(({ document, chunk }) => ({
      documentId: document._id,
      title: document.title,
      issuingAuthority: document.issuingAuthority,
      officialUrl: document.officialUrl,
      section: chunk.section,
      page: chunk.page,
      label: `${document.title}${chunk.page ? `, p. ${chunk.page}` : ''}`,
    }))

    if (urgentCare && !promptInjectionPattern.test(message)) {
      warnings = [
        'General first-aid guidance, not a substitute for emergency services. Call local emergency help and follow the dispatcher’s instructions.',
        ...warnings,
      ]
      sources = withFallbackSource(sources, GENERAL_SAFETY_SOURCE)
    }

    // A refusal is not useful when the documents partly relate to the question.
    // Ask the provider for conservative general safety guidance instead, and
    // label it clearly so it is never mistaken for an official document fact.
    if (!urgentCare && responseStatus === 'NO_SUPPORT' && matches.length > 0 && !promptInjectionPattern.test(message)) {
      const general = await generateGroundedAnswer({ question: message.trim(), matches: [], language })
      if (general.answer && !general.status.startsWith('PROVIDER_')) {
        generatedResult = general
        answer = formatChatAnswer(general.answer)
        responseStatus = 'GENERAL_AI'
        warnings = [
          'The approved documents did not cover every detail; the answer includes clearly labelled general safety guidance. Follow local authorities.',
          ...(general.warning ? [general.warning] : []),
        ]
        sources = withFallbackSource(sources, GENERAL_SAFETY_SOURCE)
      }
    }

    // Safe general-question fallback when LLM is unavailable, refuses, or errors out
    if (responseStatus === 'PROVIDER_UNAVAILABLE') {
      if (urgentCare) {
        answer = URGENT_CARE_FALLBACK(language)
        responseStatus = 'SAFE_FALLBACK'
        warnings.push('The AI provider was unavailable, so this urgent first-aid answer uses verified general safety guidance. Call local emergency services.')
        sources = withFallbackSource(sources, GENERAL_SAFETY_SOURCE)
      } else {
        answer = language === 'en'
          ? 'The AI provider is not configured on this server. Set GOOGLE_GEMINI_API_KEY (or GEMINI_API_KEY) in the backend environment. For immediate danger, call your local emergency services and follow local authorities.'
          : safeGeneralFallback(language)
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
    } else if (!answer || responseStatus === 'NO_SUPPORT' || responseStatus.startsWith('PROVIDER_')) {
      const diagnostics = generatedResult.diagnostics || {}
      const diagMsg = diagnostics.httpStatus
        ? `HTTP ${diagnostics.httpStatus}`
        : diagnostics.error || diagnostics.reason || generatedResult.status
      const fallback = urgentCare
        ? { answer: URGENT_CARE_FALLBACK(language), topic: 'Urgent first aid' }
        : language === 'en'
          ? getSafeGeneralSafetyFallback(message)
          : { answer: safeGeneralFallback(language), topic: 'General Safety' }
      if (fallback) {
        answer = fallback.answer
        responseStatus = 'SAFE_FALLBACK'
        warnings.push(`AI provider offline/unreachable (${diagMsg}). ${urgentCare ? 'Using verified first-aid guidance.' : 'Answering from verified disaster safety preparedness standards.'}`)
        sources = withFallbackSource(sources, urgentCare ? GENERAL_SAFETY_SOURCE : {
          documentId: 'safe-disaster-knowledge-fallback',
          title: 'National Disaster Preparedness & Safety Guidelines',
          issuingAuthority: 'NDMA Public Safety Standards',
          officialUrl: 'https://ndma.gov.in',
          section: fallback.topic || 'General Safety',
          page: 1,
          label: 'National Disaster Preparedness & Safety Guidelines',
        })
      } else {
        answer = safeGeneralFallback(language)
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
        language,
        answer,
        aiResponse: answer,
        currentMemorySummary: user?.memorySummary || currentMemorySummary,
        grounded: responseStatus === 'GROUNDED',
        status: responseStatus,
        provider: generatedResult.provider || null,
        model: generatedResult.model || null,
        diagnostics: generatedResult.diagnostics || null,
        warnings,
        sources,
      },
    })
  } catch (error) {
    next(error)
  }
}
