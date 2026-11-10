import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import AdminVerification from '../models/AdminVerification.js'

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured')
    error.statusCode = 500
    throw error
  }

  return jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

function publicUser(user) {
  const result = user.toObject()
  delete result.password
  return result
}

export async function register(request, response, next) {
  try {
    const body = request.body || {}
    if (typeof body.password !== 'string' || !body.password) {
      response.status(400).json({ error: 'password is required' })
      return
    }

    const requestedRole = body.accountType === 'admin' ? 'admin' : 'user'
    if (requestedRole === 'admin' && typeof body.governmentIdReference !== 'string') {
      response.status(400).json({ error: 'governmentIdReference is required for admin verification' })
      return
    }

    const user = await User.create({
      ...body,
      role: requestedRole === 'admin' ? 'user' : 'user',
      password: await bcrypt.hash(body.password, 12),
    })
    if (requestedRole === 'admin') {
      await AdminVerification.create({
        user: user._id,
        governmentIdReference: body.governmentIdReference,
      })
    }
    const token = createToken(user)
    response.status(201).json({
      token,
      user: publicUser(user),
      adminVerification: requestedRole === 'admin' ? 'pending' : null,
    })
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0]
      response.status(409).json({ error: `${field} is already registered` })
      return
    }
    next(error)
  }
}

export async function login(request, response, next) {
  try {
    const { identifier, password } = request.body
    if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
      response.status(400).json({ error: 'identifier and password are required' })
      return
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase().trim() }, { phone: identifier.trim() }],
    }).select('+password')

    if (!user || !(await bcrypt.compare(password, user.password))) {
      response.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const token = createToken(user)
    response.json({ token, user: publicUser(user) })
  } catch (error) {
    next(error)
  }
}

export async function getCurrentUser(request, response) {
  response.json({ user: request.user })
}
