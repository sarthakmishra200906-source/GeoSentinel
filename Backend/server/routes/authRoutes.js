import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  getCurrentUser,
  googleLogin,
  login,
  register,
  requestPasswordReset,
  resetPassword,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '../controllers/authController.js'
import { requireAuth, requirePhoneVerification } from '../middleware/auth.js'

const router = Router()
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: 'Too many authentication attempts. Try again later.' }),
})
const phoneVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ error: 'Too many verification attempts. Try again later.' }),
})

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.post('/google', authLimiter, googleLogin)
router.post('/phone/send-otp', phoneVerificationLimiter, requirePhoneVerification, sendPhoneOtp)
router.post('/phone/verify-otp', phoneVerificationLimiter, requirePhoneVerification, verifyPhoneOtp)
router.post('/request-password-reset', authLimiter, requestPasswordReset)
router.post('/reset-password', authLimiter, resetPassword)
router.get('/me', requireAuth, getCurrentUser)

export default router
