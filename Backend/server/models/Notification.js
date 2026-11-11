import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    audience: { type: String, enum: ['all', 'users', 'admins'], default: 'all' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
)

notificationSchema.index({ createdAt: -1 })

export default mongoose.model('Notification', notificationSchema)
