import mongoose from 'mongoose'

const householdSchema = new mongoose.Schema(
  {
    familyCode: { type: String, required: true, unique: true, trim: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    homeLocation: {
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
          message: 'homeLocation coordinates must be [longitude, latitude]',
        },
      },
    },
    buildingType: { type: String, enum: ['Concrete', 'Tin'], required: true },
    aggregatedEvacuationPriority: { type: Number, min: 0, max: 100, default: 0 },
  },
  { timestamps: true },
)

householdSchema.index({ homeLocation: '2dsphere' })

export default mongoose.model('Household', householdSchema)
