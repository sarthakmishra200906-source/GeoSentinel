import AuditEvent from '../models/AuditEvent.js'

export async function recordAuditEvent({
  request,
  actor,
  action,
  targetType,
  targetId = null,
  oldStatus = null,
  newStatus = null,
  reason = '',
  changes = null,
}) {
  await AuditEvent.create({
    actor,
    action,
    targetType,
    targetId,
    oldStatus,
    newStatus,
    reason,
    requestId: request.id,
    changes,
  })
}
