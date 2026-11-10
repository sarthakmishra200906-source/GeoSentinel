import User from '../models/User.js'
import GuidelineDocument from '../models/GuidelineDocument.js'

const mobilityKeywords = ['wheelchair', 'pwd', 'mobility assistance']

export async function handleUserChat(request, response, next) {
  try {
    const { message } = request.body || {}
    if (typeof message !== 'string' || !message.trim()) {
      response.status(400).json({ success: false, message: 'Message is required' })
      return
    }

    const user = await User.findById(request.user._id)
    if (!user) {
      response.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const normalizedMessage = message.toLowerCase()
    const needsMobilityAssistance = mobilityKeywords.some((keyword) =>
      normalizedMessage.includes(keyword),
    )

    const currentMemorySummary =
      user.memorySummary || 'New user, no prior emergency chat history.'
    if (needsMobilityAssistance && !currentMemorySummary.includes('Needs mobility assistance.')) {
      user.memorySummary = `${currentMemorySummary} Needs mobility assistance.`.trim()
      await user.save()
    }

    const terms = normalizedMessage.split(/\W+/).filter((term) => term.length > 2)
    const documents = await GuidelineDocument.find({ status: 'approved' }).select('title officialUrl issuingAuthority chunks').lean()
    const matches = documents
      .flatMap((document) =>
        document.chunks
          .map((chunk) => ({ document, chunk, score: terms.reduce((score, term) => score + (chunk.text.toLowerCase().includes(term) ? 1 : 0), 0) })),
      )
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)

    const aiResponse = matches.length
      ? `I found approved government guidance relevant to your question. Review the cited passages below; an LLM may use only this context.`
      : 'I could not find approved government guidance supporting an answer to that question.'

    response.status(200).json({
      success: true,
      data: {
        userMessage: message.trim(),
        aiResponse,
        currentMemorySummary: user.memorySummary || currentMemorySummary,
        grounded: matches.length > 0,
        status: matches.length > 0 ? 'GROUNDED_CONTEXT' : 'NO_SUPPORT',
        sources: matches.map(({ document, chunk }) => ({
          title: document.title,
          issuingAuthority: document.issuingAuthority,
          officialUrl: document.officialUrl,
          section: chunk.section,
          context: chunk.text,
        })),
      },
    })
  } catch (error) {
    next(error)
  }
}
