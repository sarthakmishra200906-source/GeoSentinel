import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { handleUserChat } from '../controllers/chatController.js'
import { optionalAuth } from '../middleware/optionalAuth.js'

const router = Router()
// Shared public IPs (campus Wi-Fi, relief camps) can represent thousands of
// people. Keep abuse protection, but make the budget deploy-configurable and
// large enough that a normal whole-day class does not hit 429s.
const configuredChatLimit = Number(process.env.CHAT_RATE_LIMIT)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number.isFinite(configuredChatLimit) && configuredChatLimit > 0 ? configuredChatLimit : 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please try again later.' },
})

router.post('/message', chatLimiter, optionalAuth, handleUserChat)

export default router
