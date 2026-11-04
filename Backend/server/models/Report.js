import mongoose from 'mongoose'

const reportSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true },
)

reportSchema.index({ location: '2dsphere' })

export default mongoose.model('Report', reportSchema)
