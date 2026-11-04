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
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    address: { type: String, required: true, trim: true },
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
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
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
