import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export async function optionalAuth(request, response, next) {
  try {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      next()
      return
    }

    if (!process.env.JWT_SECRET) {
      const error = new Error('JWT_SECRET is not configured')
      error.statusCode = 500
      next(error)
      return
    }

    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET)
    request.user = await User.findById(payload.userId).lean()
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      response.status(401).json({ error: 'Invalid or expired authorization token' })
      return
    }
    next(error)
  }
}
