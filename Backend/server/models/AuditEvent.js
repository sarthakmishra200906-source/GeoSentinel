import mongoose from 'mongoose'

const auditEventSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true, maxlength: 120 },
    targetType: { type: String, required: true, trim: true, maxlength: 80 },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    oldStatus: { type: String, default: null, maxlength: 40 },
    newStatus: { type: String, default: null, maxlength: 40 },
    reason: { type: String, default: '', trim: true, maxlength: 500 },
    requestId: { type: String, required: true, trim: true, maxlength: 120 },
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

auditEventSchema.index({ createdAt: -1 })
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })

export default mongoose.model('AuditEvent', auditEventSchema)
