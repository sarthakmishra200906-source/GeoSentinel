import mongoose from 'mongoose'

const simulationRunSchema = new mongoose.Schema(
  {
    scenario: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulationScenario', required: true, immutable: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'LAGGING', 'COMPLETED', 'FAILED', 'RESET'],
      default: 'DRAFT',
    },
    simulationTime: { type: Date, default: null },
    sequence: { type: Number, default: 0, min: 0 },
    clockMode: { type: String, enum: ['REAL_TIME', 'DEMO_ACCELERATED', 'OFFLINE'], default: 'DEMO_ACCELERATED' },
    dataSource: { type: String, enum: ['synthetic_simulation'], default: 'synthetic_simulation', immutable: true },
    engineVersion: { type: String, default: 'rule-matrix-v1', immutable: true },
    ownerHeartbeatAt: { type: Date, default: null },
    failure: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

simulationRunSchema.index({ owner: 1, createdAt: -1 })
simulationRunSchema.index({ status: 1, updatedAt: -1 })

export default mongoose.model('SimulationRun', simulationRunSchema)
