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
    const user = await User.findById(payload.userId).lean()

    if (!user) {
      response.status(401).json({ error: 'User account no longer exists' })
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
