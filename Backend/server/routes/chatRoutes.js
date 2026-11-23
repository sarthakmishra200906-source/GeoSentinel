import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { handleUserChat } from '../controllers/chatController.js'
import { optionalAuth } from '../middleware/optionalAuth.js'

const router = Router()
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please try again later.' },
})

router.post('/message', chatLimiter, optionalAuth, handleUserChat)

export default router
