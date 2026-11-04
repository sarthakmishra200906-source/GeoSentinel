import mongoose from 'mongoose'

const sosIncidentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    guestContact: {
      name: { type: String, trim: true, default: '' },
      phone: {
        type: String,
        trim: true,
        required() {
          return !this.ownerDocument().user
        },
      },
    },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
      address: { type: String, trim: true, default: '' },
    },
    emergencyType: {
      type: String,
      enum: ['Medical', 'Trapped', 'Evacuation', 'Food/Water', 'Other'],
      default: 'Evacuation',
    },
    description: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['active', 'in-progress', 'resolved', 'cancelled'],
      default: 'active',
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

sosIncidentSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: 86400 })

sosIncidentSchema.pre('validate', function validateGuestContact(next) {
  if (!this.user && !this.guestContact?.phone) {
    this.invalidate('guestContact.phone', 'Phone is required for guest SOS reports')
  }
  next()
})

sosIncidentSchema.pre('save', function setResolvedTimestamp(next) {
  if (this.isModified('status') && this.status === 'resolved' && !this.resolvedAt) {
    this.resolvedAt = new Date()
  }
  if (this.isModified('status') && this.status !== 'resolved') {
    this.resolvedAt = null
  }
  next()
})

export default mongoose.model('SOSIncident', sosIncidentSchema)
