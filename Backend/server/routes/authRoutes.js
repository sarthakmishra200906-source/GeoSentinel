import { Router } from 'express'
import { getCurrentUser, login, register, requestPasswordReset, resetPassword } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/request-password-reset', requestPasswordReset)
router.post('/reset-password', resetPassword)
router.get('/me', requireAuth, getCurrentUser)

export default router
