import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { login, register, googleLogin, sendPhoneOtp } from '../controllers/authController.js'
import { requireAuth, requirePhoneVerification } from '../middleware/auth.js'
import { bootstrapAdmin } from '../services/bootstrapAdmin.js'

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('password registration ignores client-supplied roles and requires phone verification', async () => {
  const originalCreate = User.create
  const originalNodeEnv = process.env.NODE_ENV
  const originalPasswordRegistration = process.env.ALLOW_PASSWORD_REGISTRATION
  const originalJwtSecret = process.env.JWT_SECRET
  let createdUser
  const id = { toString: () => 'test-user-id' }

  process.env.NODE_ENV = 'development'
  process.env.ALLOW_PASSWORD_REGISTRATION = 'true'
  process.env.JWT_SECRET = 'test-secret'
  User.create = async (data) => {
    createdUser = data
    return {
      ...data,
      _id: id,
      toObject() {
        return { ...this }
      },
    }
  }

  try {
    const response = responseRecorder()
    await register(
      {
        body: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '+1 (202) 555-0123',
          password: 'not-a-production-password',
          role: 'admin',
          isApproved: true,
          isPhoneVerified: true,
          isEmailVerified: true,
        },
      },
      response,
      (error) => { throw error },
    )

    assert.equal(response.statusCode, 201)
    assert.equal(response.body.status, 'phone_verification_required')
    assert.equal(response.body.token, undefined)
    assert.equal(response.body.user.password, undefined)
    assert.equal(createdUser.role, 'user')
    assert.equal(createdUser.isApproved, false)
    assert.equal(createdUser.isPhoneVerified, false)
    assert.equal(createdUser.isEmailVerified, true)
    assert.equal(createdUser.phoneVerificationPhone, '+12025550123')
  } finally {
    User.create = originalCreate
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalPasswordRegistration === undefined) delete process.env.ALLOW_PASSWORD_REGISTRATION
    else process.env.ALLOW_PASSWORD_REGISTRATION = originalPasswordRegistration
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  }
})

test('production password registration cannot bypass verified Google sign-in', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalPasswordRegistration = process.env.ALLOW_PASSWORD_REGISTRATION
  process.env.NODE_ENV = 'production'
  process.env.ALLOW_PASSWORD_REGISTRATION = 'true'
  try {
    const response = responseRecorder()
    await register({ body: {} }, response, (error) => { throw error })
    assert.equal(response.statusCode, 403)
    assert.equal(response.body.code, 'GOOGLE_SIGN_IN_REQUIRED')
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalPasswordRegistration === undefined) delete process.env.ALLOW_PASSWORD_REGISTRATION
    else process.env.ALLOW_PASSWORD_REGISTRATION = originalPasswordRegistration
  }
})

test('Google-only accounts receive generic invalid credentials for password login', async () => {
  const originalFindOne = User.findOne
  User.findOne = () => ({ select: async () => ({ password: undefined }) })
  try {
    const response = responseRecorder()
    await login(
      { body: { identifier: 'google-user@example.com', password: 'anything' } },
      response,
      (error) => { throw error },
    )
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.body, { error: 'Invalid credentials' })
  } finally {
    User.findOne = originalFindOne
  }
})

test('ordinary accounts cannot use the administrator sign-in endpoint', async () => {
  const originalFindOne = User.findOne
  const password = await bcrypt.hash('correct-password', 4)
  User.findOne = () => ({
    select: async () => ({ password, role: 'user' }),
  })
  try {
    const response = responseRecorder()
    await login(
      { body: { identifier: 'user@example.com', password: 'correct-password' } },
      response,
      (error) => { throw error },
    )
    assert.equal(response.statusCode, 403)
    assert.equal(response.body.error, 'Only administrators can sign in')
  } finally {
    User.findOne = originalFindOne
  }
})

test('ordinary accounts cannot sign in through Google authentication', async () => {
  const originalFindOne = User.findOne
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({ email: 'user@example.com', email_verified: true, sub: 'google-user-id' }),
  })
  User.findOne = () => ({
    select: async () => ({ role: 'user', googleId: 'google-user-id' }),
  })

  try {
    const response = responseRecorder()
    await googleLogin({ body: { credential: 'verified-test-credential' } }, response, (error) => { throw error })
    assert.equal(response.statusCode, 403)
    assert.equal(response.body.error, 'Only administrators can sign in')
  } finally {
    User.findOne = originalFindOne
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken
    if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId
  }
})

test('Google sign-in and SMS verification report missing provider configuration', async () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID
  const twilioKeys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']
  const originalTwilioValues = Object.fromEntries(twilioKeys.map((key) => [key, process.env[key]]))
  delete process.env.GOOGLE_CLIENT_ID
  twilioKeys.forEach((key) => delete process.env[key])

  try {
    const googleResponse = responseRecorder()
    await googleLogin({ body: {} }, googleResponse, (error) => { throw error })
    assert.equal(googleResponse.statusCode, 503)

    const phoneResponse = responseRecorder()
    await sendPhoneOtp({}, phoneResponse)
    assert.equal(phoneResponse.statusCode, 503)
  } finally {
    if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId
    for (const key of twilioKeys) {
      if (originalTwilioValues[key] === undefined) delete process.env[key]
      else process.env[key] = originalTwilioValues[key]
    }
  }
})

test('phone-verification tokens cannot access protected API routes', async () => {
  const originalJwtSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'
  try {
    const response = responseRecorder()
    let nextCalled = false
    const token = jwt.sign(
      { userId: 'test-user-id', tokenType: 'phone-verification' },
      process.env.JWT_SECRET,
    )
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } },
      response,
      () => { nextCalled = true },
    )
    assert.equal(response.statusCode, 401)
    assert.equal(nextCalled, false)
  } finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  }
})

test('unapproved accounts are denied protected API access', async () => {
  const originalJwtSecret = process.env.JWT_SECRET
  const originalFindById = User.findById
  process.env.JWT_SECRET = 'test-secret'
  User.findById = () => ({
    lean: async () => ({ _id: 'test-user-id', role: 'user', isPhoneVerified: true, isApproved: false }),
  })

  try {
    const response = responseRecorder()
    let nextCalled = false
    const token = jwt.sign({ userId: 'test-user-id', tokenType: 'access' }, process.env.JWT_SECRET)
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } },
      response,
      () => { nextCalled = true },
    )
    assert.equal(response.statusCode, 403)
    assert.equal(response.body.code, 'ACCOUNT_PENDING_APPROVAL')
    assert.equal(nextCalled, false)
  } finally {
    User.findById = originalFindById
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  }
})

test('unverified phone accounts are denied protected API access', async () => {
  const originalJwtSecret = process.env.JWT_SECRET
  const originalFindById = User.findById
  process.env.JWT_SECRET = 'test-secret'
  User.findById = () => ({
    lean: async () => ({ _id: 'test-user-id', role: 'user', isPhoneVerified: false, isApproved: false }),
  })

  try {
    const response = responseRecorder()
    let nextCalled = false
    const token = jwt.sign({ userId: 'test-user-id', tokenType: 'access' }, process.env.JWT_SECRET)
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } },
      response,
      () => { nextCalled = true },
    )
    assert.equal(response.statusCode, 403)
    assert.equal(response.body.code, 'PHONE_VERIFICATION_REQUIRED')
    assert.equal(nextCalled, false)
  } finally {
    User.findById = originalFindById
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  }
})

test('phone-verification middleware rejects a full access token', async () => {
  const originalJwtSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'
  try {
    const response = responseRecorder()
    const token = jwt.sign({ userId: 'test-user-id', tokenType: 'access' }, process.env.JWT_SECRET)
    await requirePhoneVerification(
      { headers: { authorization: `Bearer ${token}` } },
      response,
      () => {},
    )
    assert.equal(response.statusCode, 401)
    assert.equal(response.body.error, 'A phone-verification token is required')
  } finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  }
})

test('bootstrap admin refuses a short password before accessing the database', async () => {
  const originalEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
  const originalPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@example.com'
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'too-short'
  try {
    await assert.rejects(bootstrapAdmin(), /at least 16 characters/)
  } finally {
    if (originalEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL
    else process.env.BOOTSTRAP_ADMIN_EMAIL = originalEmail
    if (originalPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = originalPassword
  }
})
