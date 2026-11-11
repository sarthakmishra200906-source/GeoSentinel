export function assertExpectedVersion(version, currentVersion) {
  if (!Number.isInteger(Number(version))) {
    const error = new Error('version is required for optimistic concurrency; reload before saving')
    error.statusCode = 428
    throw error
  }
  if (Number(version) !== currentVersion) {
    const error = new Error('Rescue center was changed by another admin; reload before saving')
    error.statusCode = 409
    throw error
  }
}
