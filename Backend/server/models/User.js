import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: { type: String, trim: true, default: undefined },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true, select: false },
    isEmailVerified: { type: Boolean, default: true },
    isPhoneVerified: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: true },
    isBootstrapAdmin: { type: Boolean, default: false, select: false },
    phoneVerificationPhone: { type: String, select: false },
    phoneVerificationLastSentAt: { type: Date, select: false },
    age: { type: Number, min: 0, max: 130 },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Other' },
    address: { type: String, default: '', trim: true },
    familyCode: { type: String, unique: true, index: true },
    linkedFamilyMembers: [
      {
        memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        relation: { type: String, required: true, trim: true },
      },
    ],
    isPWD: { type: Boolean, default: false },
    pwdDetails: {
      disabilityType: {
        type: String,
        enum: ['Mobility', 'Visual', 'Hearing', 'Medical_Dependency', 'None'],
        default: 'None',
      },
      requiresWheelchair: { type: Boolean, default: false },
      medicalEquipmentNeeded: { type: String, default: '', trim: true },
    },
    memorySummary: {
      type: String,
      default: 'New user, no prior emergency chat history.',
      trim: true,
    },
    role: { type: String, enum: ['user', 'admin', 'responder'], default: 'user' },
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true },
)

userSchema.pre('save', function generateFamilyCode(next) {
  if (!this.familyCode) {
    this.familyCode = `RESQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  }
  next()
})

export default mongoose.model('User', userSchema)
