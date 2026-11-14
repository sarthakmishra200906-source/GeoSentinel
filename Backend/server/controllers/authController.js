import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
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

function passwordResetTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })
}

export async function register(request, response, next) {
  try {
    const body = request.body || {}
    if (typeof body.password !== 'string' || !body.password) {
      response.status(400).json({ error: 'password is required' })
      return
    }

    const requestedRole = body.accountType === 'admin' ? 'admin' : 'user'
    const directAdminAccess = requestedRole === 'admin' && process.env.ALLOW_ADMIN_REGISTRATION === 'true'
    if (requestedRole === 'admin' && !directAdminAccess && typeof body.governmentIdReference !== 'string') {
      response.status(400).json({ error: 'governmentIdReference is required for admin verification' })
      return
    }

    const user = await User.create({
      ...body,
      role: directAdminAccess ? 'admin' : 'user',
      password: await bcrypt.hash(body.password, 12),
    })
    if (requestedRole === 'admin' && !directAdminAccess) {
      await AdminVerification.create({
        user: user._id,
        governmentIdReference: body.governmentIdReference,
      })
    }
    const token = createToken(user)
    response.status(201).json({
      token,
      user: publicUser(user),
      adminVerification: directAdminAccess ? 'approved-local' : requestedRole === 'admin' ? 'pending' : null,
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

export async function requestPasswordReset(request, response, next) {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase()
    if (!email) {
      response.status(400).json({ error: 'A Gmail address is required' })
      return
    }
    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt')
    const generic = { message: 'If that email is registered, password-reset instructions have been prepared.' }
    if (!user) {
      response.json(generic)
      return
    }
    const transport = passwordResetTransport()
    if (!transport && (process.env.NODE_ENV === 'production' || process.env.PASSWORD_RESET_DEV_MODE !== 'true')) {
      response.status(503).json({ error: 'Password reset email service is not configured' })
      return
    }
    const token = crypto.randomBytes(32).toString('hex')
    user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex')
    user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await user.save()
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173/GeoSentinel/'}?resetToken=${token}`
    if (transport) {
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'GeoSentinel password reset',
        text: `Reset your GeoSentinel password within 15 minutes: ${resetUrl}`,
      })
    } else if (process.env.NODE_ENV === 'production' || process.env.PASSWORD_RESET_DEV_MODE !== 'true') {
      response.status(503).json({ error: 'Password reset email service is not configured' })
      return
    } else {
      response.json({ ...generic, devResetToken: token })
      return
    }
    response.json(generic)
  } catch (error) {
    next(error)
  }
}

export async function resetPassword(request, response, next) {
  try {
    const token = String(request.body?.token || '')
    const password = String(request.body?.password || '')
    if (!token || password.length < 8) {
      response.status(400).json({ error: 'A valid reset token and password of at least 8 characters are required' })
      return
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const user = await User.findOne({
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+password +passwordResetTokenHash +passwordResetExpiresAt')
    if (!user) {
      response.status(400).json({ error: 'The reset link is invalid or expired' })
      return
    }
    user.password = await bcrypt.hash(password, 12)
    user.passwordResetTokenHash = null
    user.passwordResetExpiresAt = null
    await user.save()
    response.json({ message: 'Password reset successfully. You can now log in.' })
  } catch (error) {
    next(error)
  }
}
