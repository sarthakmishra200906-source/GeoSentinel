const MAX_DISTRICTS = 30
const MAX_INSTITUTIONS = 2000
const MAX_SHELTERS = 100
const MAX_ROUTE_POINTS = 20

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

  assertNumber(cyclone.approachDistanceKm ?? 200, 'cyclone.approachDistanceKm', { min: 0, max: 50000 })
  assertNumber(cyclone.windSpeedKmh ?? 120, 'cyclone.windSpeedKmh', { min: 0, max: 300 })
  const routePoints = cyclone.routePoints ?? [
    { latitude: cyclone.startLatitude ?? 17.6, longitude: cyclone.startLongitude ?? 88.8 },
    { latitude: cyclone.targetLatitude ?? 20.3, longitude: cyclone.targetLongitude ?? 86.6 },
  ]
  if (!Array.isArray(routePoints) || routePoints.length < 2 || routePoints.length > MAX_ROUTE_POINTS) {
    const error = new Error(`cyclone.routePoints must contain between 2 and ${MAX_ROUTE_POINTS} points`)
    error.statusCode = 400
    throw error
  }
  const normalizedRoute = routePoints.map((point, index) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      const error = new Error(`cyclone.routePoints[${index}] must be an object`)
      error.statusCode = 400
      throw error
    }
    assertNumber(point.latitude, `cyclone.routePoints[${index}].latitude`, { min: -90, max: 90 })
    assertNumber(point.longitude, `cyclone.routePoints[${index}].longitude`, { min: -180, max: 180 })
    return { latitude: point.latitude, longitude: point.longitude }
  })
  if (normalizedRoute.every((point) =>
    point.latitude === normalizedRoute[0].latitude && point.longitude === normalizedRoute[0].longitude,
  )) {
    const error = new Error('Cyclone route must cover more than one location')
    error.statusCode = 400
    throw error
  }
  assertNumber(rainfall.hourlyMm ?? 80, 'rainfall.hourlyMm', { min: 0, max: 500 })
  assertNumber(rainfall.durationHours ?? 24, 'rainfall.durationHours', { min: 1, max: 168 })
  assertNumber(capacity.districts ?? 30, 'capacity.districts', { min: 1, max: MAX_DISTRICTS })
  assertNumber(capacity.institutions ?? 0, 'capacity.institutions', { min: 0, max: MAX_INSTITUTIONS })
  assertNumber(capacity.shelters ?? 0, 'capacity.shelters', { min: 0, max: MAX_SHELTERS })

  return {
    ...parameters,
    cyclone: {
      ...cyclone,
      routePoints: normalizedRoute,
      startLatitude: normalizedRoute[0].latitude,
      startLongitude: normalizedRoute[0].longitude,
      targetLatitude: normalizedRoute[normalizedRoute.length - 1].latitude,
      targetLongitude: normalizedRoute[normalizedRoute.length - 1].longitude,
    },
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
