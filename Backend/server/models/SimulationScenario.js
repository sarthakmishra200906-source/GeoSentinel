import mongoose from 'mongoose'

const simulationScenarioSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    geography: { type: String, enum: ['ODISHA'], default: 'ODISHA', immutable: true },
    version: { type: Number, required: true, min: 1 },
    parameters: { type: mongoose.Schema.Types.Mixed, required: true },
    seed: { type: String, required: true, trim: true, maxlength: 120 },
    rulesetVersion: { type: String, required: true, trim: true, maxlength: 80 },
    dataSource: {
      type: String,
      enum: ['synthetic_simulation'],
      default: 'synthetic_simulation',
      immutable: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true },
)

simulationScenarioSchema.index({ createdBy: 1, createdAt: -1 })
simulationScenarioSchema.index({ geography: 1, createdAt: -1 })

export default mongoose.model('SimulationScenario', simulationScenarioSchema)
