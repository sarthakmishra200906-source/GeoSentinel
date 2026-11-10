import mongoose from 'mongoose'

const adminVerificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    governmentIdReference: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

export default mongoose.model('AdminVerification', adminVerificationSchema)
