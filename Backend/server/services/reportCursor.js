import mongoose from 'mongoose'

export function encodeReportCursor(report) {
  return Buffer.from(JSON.stringify({
    createdAt: report.createdAt,
    id: report._id,
  }), 'utf8').toString('base64url')
}

export function decodeReportCursor(cursor) {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const createdAt = new Date(parsed.createdAt)
    if (!mongoose.Types.ObjectId.isValid(parsed.id) || !Number.isFinite(createdAt.getTime())) return null
    return { createdAt, id: parsed.id }
  } catch {
    return null
  }
}
