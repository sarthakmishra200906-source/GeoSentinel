import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export async function requireAuth(request, response, next) {
  try {
    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET is not configured')
      error.statusCode = 500
      next(error)
      return
    }

    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      response.status(401).json({ error: 'Authorization token is required' })
      return
    }

    const token = authorization.slice(7)
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.tokenType && payload.tokenType !== 'access') {
      response.status(401).json({ error: 'A full access token is required' })
      return
    }
    const user = await User.findById(payload.userId).lean()

    if (!user) {
      response.status(401).json({ error: 'User account no longer exists' })
      return
    }

    if (user.isPhoneVerified === false) {
      response.status(403).json({ code: 'PHONE_VERIFICATION_REQUIRED', error: 'Phone verification is required' })
      return
    }
    if (user.isApproved === false) {
      response.status(403).json({ code: 'ACCOUNT_PENDING_APPROVAL', error: 'Account approval is pending' })
      return
    }

    request.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      response.status(401).json({ error: 'Invalid or expired authorization token' })
      return
    }
    next(error)
  }
}

export async function requirePhoneVerification(request, response, next) {
  try {
    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET is not configured')
      error.statusCode = 500
      next(error)
      return
    }
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      response.status(401).json({ error: 'Phone-verification token is required' })
      return
    }
    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET)
    if (payload.tokenType !== 'phone-verification') {
      response.status(401).json({ error: 'A phone-verification token is required' })
      return
    }
    const user = await User.findById(payload.userId).select('+phoneVerificationPhone +phoneVerificationLastSentAt')
    if (!user || user.isPhoneVerified !== false) {
      response.status(401).json({ error: 'Phone-verification session is invalid or expired' })
      return
    }
    request.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      response.status(401).json({ error: 'Invalid or expired phone-verification token' })
      return
    }
    next(error)
  }
}
