import mongoose from 'mongoose'

const rescueCenterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    capacity: { type: Number, required: true, min: 0 },
    occupancy: { type: Number, default: 0, min: 0 },
    accessibility: { type: Boolean, default: false },
    waterAvailable: { type: Boolean, default: false },
    medicalAvailable: { type: Boolean, default: false },
    powerAvailable: { type: Boolean, default: false },
    contact: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ['open', 'limited', 'closed'], default: 'open' },
    lastVerifiedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

rescueCenterSchema.index({ location: '2dsphere' })

export default mongoose.model('RescueCenter', rescueCenterSchema)
