import mongoose from 'mongoose'

const simulationTimestepSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulationRun', required: true, immutable: true },
    sequence: { type: Number, required: true, min: 1, immutable: true },
    timestamp: { type: Date, required: true, immutable: true },
    dataSource: { type: String, enum: ['synthetic_simulation'], default: 'synthetic_simulation', immutable: true },
    cyclone: { type: mongoose.Schema.Types.Mixed, required: true },
    weather: { type: mongoose.Schema.Types.Mixed, required: true },
    impacts: { type: mongoose.Schema.Types.Mixed, required: true },
    recommendations: { type: mongoose.Schema.Types.Mixed, required: true },
    ruleVersion: { type: String, required: true, immutable: true },
  },
  { timestamps: true },
)

simulationTimestepSchema.index({ runId: 1, sequence: 1 }, { unique: true })
simulationTimestepSchema.index({ runId: 1, timestamp: 1 })

export default mongoose.model('SimulationTimestep', simulationTimestepSchema)
