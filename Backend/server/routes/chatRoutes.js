import { Router } from 'express'
import { handleUserChat } from '../controllers/chatController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/message', requireAuth, handleUserChat)

export default router
