import mongoose from 'mongoose'

const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName: { type: String, required: true, trim: true },
    reporterAddress: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'resolved'],
      default: 'pending',
    },
    imageUrl: { type: String, trim: true },
    imageMetadata: {
      originalName: { type: String, trim: true },
      mimeType: { type: String, trim: true },
      size: { type: Number, min: 0 },
    },
  },
  { timestamps: true },
)

reportSchema.index({ location: '2dsphere' })

export default mongoose.model('Report', reportSchema)
