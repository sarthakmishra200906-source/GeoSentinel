import bcrypt from 'bcryptjs'
import User from '../models/User.js'

async function userIndexes() {
  try {
    return await User.collection.indexes()
  } catch (error) {
    if (error.code === 26) return []
    throw error
  }
}

export async function ensureOptionalPhoneIndex() {
  const indexes = await userIndexes()
  const phoneIndex = indexes.find(
    (index) => index.key?.phone === 1 && Object.keys(index.key).length === 1,
  )

  if (phoneIndex && phoneIndex.sparse !== true) {
    try {
      await User.collection.dropIndex(phoneIndex.name)
    } catch (error) {
      if (error.code !== 27) throw error
    }
  }

  const updatedIndexes = await userIndexes()
  const updatedPhoneIndex = updatedIndexes.find(
    (index) => index.key?.phone === 1 && Object.keys(index.key).length === 1,
  )
  if (!updatedPhoneIndex) {
    await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true, name: 'phone_1' })
  } else if (updatedPhoneIndex.sparse !== true || updatedPhoneIndex.unique !== true) {
    throw new Error('The User phone index must be unique and sparse')
  }
}

async function updateBootstrapAdmin(user, passwordHash) {
  user.password = passwordHash
  user.role = 'admin'
  user.isApproved = true
  user.isEmailVerified = true
  user.isPhoneVerified = true
  user.isBootstrapAdmin = true
  await user.save()
}

export async function bootstrapAdmin() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
  if (!email && !password) return false
  if (!email || !password) {
    throw new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to bootstrap the first admin')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address')
  }
  if (password.length < 16) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters')
  }

  let user = await User.findOne({ email }).select('+password +isBootstrapAdmin')
  if (user?.isBootstrapAdmin) return false
  const passwordHash = await bcrypt.hash(password, 12)
  if (user) {
    await updateBootstrapAdmin(user, passwordHash)
    return true
  }

  try {
    await User.create({
      name: 'GeoSentinel Administrator',
      email,
      password: passwordHash,
      role: 'admin',
      isApproved: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      isBootstrapAdmin: true,
    })
    return true
  } catch (error) {
    if (error.code !== 11000) throw error
    user = await User.findOne({ email }).select('+password +isBootstrapAdmin')
    if (!user || user.isBootstrapAdmin) return false
    await updateBootstrapAdmin(user, passwordHash)
    return true
  }
}

export async function ensureProductionAdmin() {
  if (process.env.NODE_ENV !== 'production') return
  const admin = await User.exists({ role: 'admin', isApproved: { $ne: false } })
  if (!admin) {
    throw new Error('No approved admin exists; configure the bootstrap admin environment variables for first startup')
  }
}
