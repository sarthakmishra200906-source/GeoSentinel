const MAX_DISTRICTS = 30
const MAX_INSTITUTIONS = 2000
const MAX_SHELTERS = 100

function assertNumber(value, name, { min, max }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    const error = new Error(`${name} must be a number between ${min} and ${max}`)
    error.statusCode = 400
    throw error
  }
}

export function validateSimulationParameters(parameters = {}) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    const error = new Error('Simulation parameters must be an object')
    error.statusCode = 400
    throw error
  }

  const cyclone = parameters.cyclone || {}
  const rainfall = parameters.rainfall || {}
  const capacity = parameters.capacity || {}

  assertNumber(cyclone.approachDistanceKm ?? 200, 'cyclone.approachDistanceKm', { min: 0, max: 1000 })
  assertNumber(cyclone.windSpeedKmh ?? 120, 'cyclone.windSpeedKmh', { min: 0, max: 300 })
  assertNumber(rainfall.hourlyMm ?? 80, 'rainfall.hourlyMm', { min: 0, max: 500 })
  assertNumber(rainfall.durationHours ?? 24, 'rainfall.durationHours', { min: 1, max: 168 })
  assertNumber(capacity.districts ?? 30, 'capacity.districts', { min: 1, max: MAX_DISTRICTS })
  assertNumber(capacity.institutions ?? 0, 'capacity.institutions', { min: 0, max: MAX_INSTITUTIONS })
  assertNumber(capacity.shelters ?? 0, 'capacity.shelters', { min: 0, max: MAX_SHELTERS })

  return {
    ...parameters,
    geography: 'ODISHA',
    dataSource: 'synthetic_simulation',
    engineScope: 'district_institution_rule_matrix',
  }
}

export function validateSimulationName(name) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 120) {
    const error = new Error('Simulation name is required and must be at most 120 characters')
    error.statusCode = 400
    throw error
  }
  return name.trim()
}
