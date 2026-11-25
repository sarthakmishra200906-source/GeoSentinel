import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import twilio from 'twilio'
import User from '../models/User.js'
import AdminVerification from '../models/AdminVerification.js'

// Local-only OTP codes, used when Twilio Verify is not configured.
const devPhoneCodes = new Map()
const DEV_CODE_TTL_MS = 10 * 60 * 1000

function createToken(user, tokenType = 'access', expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured')
    error.statusCode = 500
    throw error
  }

  return jwt.sign({ userId: user._id.toString(), role: user.role, tokenType }, process.env.JWT_SECRET, {
    expiresIn,
  })
}

function phoneVerificationToken(user) {
  return createToken(user, 'phone-verification', '10m')
}

function publicUser(user) {
  const result = user.toObject ? user.toObject() : { ...user }
  delete result.password
  delete result.googleId
  delete result.isBootstrapAdmin
  delete result.phoneVerificationPhone
  delete result.phoneVerificationLastSentAt
  delete result.passwordResetTokenHash
  delete result.passwordResetExpiresAt
  return result
}

function normalizePhone(phone) {
  const normalized = String(phone || '').trim().replace(/[\s()-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    const error = new Error('Phone number must use international E.164 format, for example +919876543210')
    error.statusCode = 400
    throw error
  }
  return normalized
}

function authResult(user, phoneToVerify = '') {
  if (user.isPhoneVerified === false) {
    return {
      status: 'phone_verification_required',
      verificationToken: phoneVerificationToken(user),
      phoneToVerify,
      user: publicUser(user),
    }
  }
  if (user.isApproved === false) {
    return { status: 'pending_approval', user: publicUser(user) }
  }
  return { status: 'authenticated', token: createToken(user), user: publicUser(user) }
}

function twilioVerifyService() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) return null
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).verify.v2.services(TWILIO_VERIFY_SERVICE_SID)
}

function devPhoneVerificationEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.PHONE_VERIFICATION_DEV_MODE === 'true'
}

function storeDevPhoneCode(userId, phone) {
  const code = String(crypto.randomInt(100000, 1000000))
  devPhoneCodes.set(String(userId), { code, phone, expiresAt: Date.now() + DEV_CODE_TTL_MS })
  return code
}

function checkDevPhoneCode(userId, phone, code) {
  const entry = devPhoneCodes.get(String(userId))
  if (!entry || entry.expiresAt < Date.now()) {
    devPhoneCodes.delete(String(userId))
    return false
  }
  if (entry.phone !== phone || entry.code !== code) return false
  devPhoneCodes.delete(String(userId))
  return true
}

async function ensureAdminVerification(user, reference) {
  if (typeof reference !== 'string' || !reference.trim() || reference.trim().length > 120) {
    const error = new Error('governmentIdReference is required and must be at most 120 characters')
    error.statusCode = 400
    throw error
  }
  await AdminVerification.findOneAndUpdate(
    { user: user._id },
    {
      $set: { governmentIdReference: reference.trim(), status: 'pending', reviewedBy: null, reviewedAt: null, reviewNote: '' },
      $setOnInsert: { user: user._id },
    },
    { upsert: true, new: true, runValidators: true },
  )
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
    if (process.env.ALLOW_PASSWORD_REGISTRATION === 'false') {
      response.status(403).json({
        code: 'REGISTRATION_DISABLED',
        error: 'New account registration is disabled on this server',
      })
      return
    }

    const body = request.body || {}
    if (
      typeof body.name !== 'string' ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      body.password.length < 8
    ) {
      response.status(400).json({ error: 'name, email, and a password of at least 8 characters are required' })
      return
    }

    const requestedRole = body.accountType === 'admin' ? 'admin' : 'user'
    if (
      requestedRole === 'admin' &&
      (typeof body.governmentIdReference !== 'string' ||
        !body.governmentIdReference.trim() ||
        body.governmentIdReference.trim().length > 120)
    ) {
      response.status(400).json({ error: 'governmentIdReference is required and must be at most 120 characters' })
      return
    }
    const phone = normalizePhone(body.phone)
    const user = await User.create({
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phoneVerificationPhone: phone,
      age: body.age === undefined || body.age === '' ? undefined : Number(body.age),
      gender: ['Male', 'Female', 'Other'].includes(body.gender) ? body.gender : 'Other',
      address: typeof body.address === 'string' ? body.address.trim() : '',
      role: 'user',
      isEmailVerified: true,
      isPhoneVerified: false,
      isApproved: false,
      password: await bcrypt.hash(body.password, 12),
    })
    if (requestedRole === 'admin') await ensureAdminVerification(user, body.governmentIdReference)
    response.status(201).json({
      ...authResult(user, phone),
      adminVerification: requestedRole === 'admin' ? 'pending' : null,
    })
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'value'
      response.status(409).json({ error: `${field} is already registered` })
      return
    }
    next(error)
  }
}

export async function login(request, response, next) {
  try {
    const { identifier, password } = request.body || {}
    if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
      response.status(400).json({ error: 'identifier and password are required' })
      return
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase().trim() }, { phone: identifier.trim() }],
    }).select('+password +phoneVerificationPhone')

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      response.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (user.role !== 'admin') {
      response.status(403).json({ error: 'Only administrators can sign in' })
      return
    }

    response.json(authResult(user, user.phoneVerificationPhone || ''))
  } catch (error) {
    next(error)
  }
}

export async function sendPhoneOtp(request, response, next) {
  const service = twilioVerifyService()
  const devMode = !service && devPhoneVerificationEnabled()
  if (!service && !devMode) {
    response.status(503).json({ error: 'Phone verification is not configured on the server' })
    return
  }
  let phone
  try {
    phone = request.body?.phone
      ? normalizePhone(request.body.phone)
      : request.user.phoneVerificationPhone
    if (!phone) {
      response.status(400).json({ error: 'An international-format phone number is required' })
      return
    }
    if (request.user.isPhoneVerified !== false) {
      response.status(409).json({ error: 'This account does not require phone verification' })
      return
    }
    const conflictingUser = await User.findOne({ phone, _id: { $ne: request.user._id } }).select('_id')
    if (conflictingUser) {
      response.status(409).json({ error: 'That phone number is already registered' })
      return
    }
    if (
      request.user.phoneVerificationLastSentAt &&
      Date.now() - request.user.phoneVerificationLastSentAt.getTime() < 60_000
    ) {
      response.status(429).json({ error: 'Wait one minute before requesting another code' })
      return
    }

    request.user.phoneVerificationPhone = phone
    request.user.phoneVerificationLastSentAt = new Date()
    await request.user.save()
  } catch (error) {
    if (error.code === 11000) {
      response.status(409).json({ error: 'That phone number is already registered' })
      return
    }
    next(error)
    return
  }
  if (devMode) {
    response.json({
      message: 'Local development code generated (no SMS was sent)',
      devCode: storeDevPhoneCode(request.user._id, phone),
    })
    return
  }
  try {
    await service.verifications.create({ to: phone, channel: 'sms' })
    response.json({ message: 'Verification code sent' })
  } catch (error) {
    console.error('Twilio Verify could not send a code', { code: error.code || 'unknown' })
    response.status(502).json({ error: 'SMS verification service is unavailable' })
  }
}

export async function verifyPhoneOtp(request, response, next) {
  const service = twilioVerifyService()
  const devMode = !service && devPhoneVerificationEnabled()
  if (!service && !devMode) {
    response.status(503).json({ error: 'Phone verification is not configured on the server' })
    return
  }
  const code = String(request.body?.code || '').trim()
  const phone = request.user.phoneVerificationPhone
  if (!phone || !/^\d{4,10}$/.test(code)) {
    response.status(400).json({ error: 'A valid verification code is required' })
    return
  }
  if (devMode) {
    if (!checkDevPhoneCode(request.user._id, phone, code)) {
      response.status(400).json({ error: 'The verification code is invalid or expired' })
      return
    }
  } else {
    let check
    try {
      check = await service.verificationChecks.create({ to: phone, code })
    } catch (error) {
      console.error('Twilio Verify could not verify a code', { code: error.code || 'unknown' })
      response.status(502).json({ error: 'SMS verification service is unavailable' })
      return
    }
    if (check.status !== 'approved') {
      response.status(400).json({ error: 'The verification code is invalid or expired' })
      return
    }
  }
  try {
    request.user.phone = phone
    request.user.isPhoneVerified = true
    request.user.phoneVerificationPhone = undefined
    request.user.phoneVerificationLastSentAt = undefined
    await request.user.save()
    response.json(authResult(request.user))
  } catch (error) {
    if (error.code === 11000) {
      response.status(409).json({ error: 'That phone number is already registered' })
      return
    }
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
