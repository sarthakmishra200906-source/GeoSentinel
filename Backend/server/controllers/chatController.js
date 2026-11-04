import User from '../models/User.js'

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

    const aiResponse = `Received your update: "${message.trim()}". Emergency profile updated.`

    response.status(200).json({
      success: true,
      data: {
        userMessage: message.trim(),
        aiResponse,
        currentMemorySummary: user.memorySummary || currentMemorySummary,
      },
    })
  } catch (error) {
    next(error)
  }
}
