import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '../models/User.js'

const DEMO_EMAIL = 'demo.admin@geosentinel.local'
const DEMO_PASSWORD = 'DemoAdmin@2026'
const DEMO_NAME = 'GeoSentinel Demo Admin'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a demo admin in production')
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to seed the demo admin')
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || 'resq_ai_db',
  })

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const user = await User.findOneAndUpdate(
    { email: DEMO_EMAIL },
    {
      $set: {
        name: DEMO_NAME,
        password: passwordHash,
        role: 'admin',
        isEmailVerified: true,
        isPhoneVerified: true,
        isApproved: true,
      },
      $setOnInsert: {
        email: DEMO_EMAIL,
        familyCode: `RESQ-DEMO-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).select('email role isApproved isPhoneVerified isEmailVerified')

  console.log(
    `Demo admin ready: ${user.email} (role=${user.role}, approved=${user.isApproved}, phoneVerified=${user.isPhoneVerified})`,
  )
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  try {
    await mongoose.disconnect()
  } catch {
    // ignore disconnect errors after a failed connect
  }
  process.exit(1)
})
