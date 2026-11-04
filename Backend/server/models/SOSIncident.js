import mongoose from 'mongoose'

const sosIncidentSchema = new mongoose.Schema(
  {
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates) =>
            coordinates.length === 2 &&
            coordinates[0] >= -180 &&
            coordinates[0] <= 180 &&
            coordinates[1] >= -90 &&
            coordinates[1] <= 90,
          message: 'location coordinates must be [longitude, latitude]',
        },
      },
    },
    imageUrls: [{ type: String, trim: true }],
    description: { type: String, required: true, trim: true },
    aiSeverityScore: {
      type: String,
      enum: ['Low', 'Medium', 'Critical'],
      default: 'Low',
    },
    status: {
      type: String,
      enum: ['Pending', 'Responding', 'Resolved'],
      default: 'Pending',
    },
  },
  { timestamps: true },
)

sosIncidentSchema.index({ location: '2dsphere' })

export default mongoose.model('SOSIncident', sosIncidentSchema)
