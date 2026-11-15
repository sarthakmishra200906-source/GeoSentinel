import mongoose from 'mongoose'

const simulationReportSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulationRun', required: true, immutable: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    reportType: { type: String, enum: ['complete_simulation_pdf'], required: true, immutable: true },
    fileName: { type: String, required: true, immutable: true },
    contentType: { type: String, enum: ['application/pdf'], default: 'application/pdf', immutable: true },
    sha256: { type: String, required: true, immutable: true },
    generatedAt: { type: Date, required: true, immutable: true },
    summary: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    pdf: { type: Buffer, required: true, immutable: true, select: false },
  },
  { timestamps: true },
)

simulationReportSchema.index({ runId: 1, createdAt: -1 })
simulationReportSchema.index({ owner: 1, createdAt: -1 })

export default mongoose.model('SimulationReport', simulationReportSchema)
