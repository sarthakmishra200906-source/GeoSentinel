// IMD-style forward simulation engine.
// Forward mode projects an eye position hour by hour from a single starting
// point using a great-circle advance, a small beta-drift/poleward correction,
// landfall decay, an IMD-style cone of uncertainty and 34/50/64 kt wind radii.
// The legacy fixed-route rule matrix is retained only for already-saved runs.

const DISTRICT_CENTROIDS = {
  Angul: [20.95, 85.1], Balasore: [21.49, 86.94], Bargarh: [21.34, 83.63],
  Bhadrak: [21.1, 86.51], Bolangir: [20.71, 82.41], Boudh: [20.83, 84.32],
  Cuttack: [20.46, 85.88], Deogarh: [21.06, 84.73], Dhenkanal: [20.66, 85.6],
  Gajapati: [18.87, 84.06], Ganjam: [19.39, 84.88], Jagatsinghpur: [20.27, 86.16],
  Jajpur: [20.85, 86.34], Jharsuguda: [21.85, 84.33], Kalahandi: [19.83, 83.32],
  Kandhamal: [20.47, 84.23], Kendrapara: [20.51, 86.63], Kendujhar: [21.8, 85.81],
  Khordha: [20.23, 85.62], Koraput: [18.8, 82.7], Malkangiri: [18.35, 81.88],
  Mayurbhanj: [21.8, 86.42], Nabarangpur: [19.63, 82.51], Nayagarh: [20.13, 85.06],
  Nuapada: [20.8, 82.54], Puri: [19.81, 85.83], Rayagada: [19.17, 83.44],
  Sambalpur: [21.53, 83.94], Subarnapur: [20.64, 83.88], Sundargarh: [22.12, 84.0],
}

const STATE_CENTROIDS = {
  'Andhra Pradesh': [15.91, 79.59], 'Arunachal Pradesh': [28.22, 94.73],
  Assam: [26.2, 92.94], Bihar: [25.59, 85.13], Chhattisgarh: [21.28, 81.35],
  Goa: [15.4, 73.81], Gujarat: [22.26, 71.51], Haryana: [29.06, 76.09],
  'Himachal Pradesh': [31.1, 77.17], Jharkhand: [23.61, 85.79],
  Karnataka: [15.31, 75.71], Kerala: [10.85, 76.27], 'Madhya Pradesh': [22.94, 78.65],
  Maharashtra: [19.75, 75.71], Manipur: [24.66, 93.9], Meghalaya: [25.47, 91.2],
  Mizoram: [23.6, 92.8], Nagaland: [26.15, 94.56], Odisha: [20.95, 85.5],
  Punjab: [31.15, 75.27], Rajasthan: [26.57, 73.44], Sikkim: [27.53, 88.51],
  'Tamil Nadu': [11.13, 78.66], Telangana: [18.11, 79.39], Tripura: [23.94, 91.93],
  'Uttar Pradesh': [26.85, 80.95], Uttarakhand: [30.41, 79.22],
  'West Bengal': [22.99, 87.51], 'Andaman and Nicobar Islands': [11.68, 92.74],
  Chandigarh: [30.73, 76.78], 'Dadra and Nagar Haveli and Daman and Diu': [20.4, 72.85],
  Delhi: [28.7, 77.1], 'Jammu and Kashmir': [34.08, 74.82], Ladakh: [34.29, 78.96],
  Lakshadweep: [10.56, 72.64], Puducherry: [11.94, 79.83],
}

// Coarse Indian mainland outline, sufficient for a simulation landfall-decay
// signal. This is not a production land mask.
const WEST_COAST = [[8, 77], [15, 73], [20, 70], [24, 72], [30, 76], [35, 78]]
const EAST_COAST = [[8, 81], [15, 80], [18, 84], [20, 86], [22, 89], [24, 92], [27, 95], [30, 96], [35, 92]]
const CONE_ANCHORS = [[0, 0], [6, 25], [12, 45], [24, 75], [48, 120]]

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function tier(score) {
  if (score >= 0.75) return 'CRITICAL'
  if (score >= 0.55) return 'HIGH'
  if (score >= 0.35) return 'MODERATE'
  return 'LOW'
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI
}

function normalizeBearing(degrees) {
  return ((degrees % 360) + 360) % 360
}

function distanceKm(start, end) {
  const latitudeDifference = toRadians(end.latitude - start.latitude)
  const longitudeDifference = toRadians(end.longitude - start.longitude)
  const startLatitude = toRadians(start.latitude)
  const endLatitude = toRadians(end.latitude)
  const rawHaversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDifference / 2) ** 2
  const haversine = Math.min(1, Math.max(0, rawHaversine))
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function destinationPoint(latitude, longitude, bearingDegrees, distance) {
  if (distance <= 0) return { latitude, longitude }
  const angularDistance = distance / 6371
  const bearing = toRadians(bearingDegrees)
  const startLatitude = toRadians(latitude)
  const startLongitude = toRadians(longitude)
  const endLatitude = Math.asin(
    Math.sin(startLatitude) * Math.cos(angularDistance) +
    Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const endLongitude = startLongitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
    Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(endLatitude),
  )
  return {
    latitude: toDegrees(endLatitude),
    longitude: normalizeBearing(toDegrees(endLongitude) + 180) - 180,
  }
}

function interpolateBoundary(table, latitude) {
  if (latitude <= table[0][0]) return table[0][1]
  for (let index = 1; index < table.length; index += 1) {
    const [upperLatitude, upperLongitude] = table[index]
    if (latitude <= upperLatitude) {
      const [lowerLatitude, lowerLongitude] = table[index - 1]
      const fraction = (latitude - lowerLatitude) / (upperLatitude - lowerLatitude)
      return lowerLongitude + (upperLongitude - lowerLongitude) * fraction
    }
  }
  return table[table.length - 1][1]
}

function isIndianLand(latitude, longitude) {
  if (latitude < 8 || latitude > 35) return false
  return (
    longitude >= interpolateBoundary(WEST_COAST, latitude) &&
    longitude <= interpolateBoundary(EAST_COAST, latitude)
  )
}

function coneRadiusForHour(hours) {
  for (let index = 1; index < CONE_ANCHORS.length; index += 1) {
    const [upperHour, upperRadius] = CONE_ANCHORS[index]
    if (hours <= upperHour) {
      const [lowerHour, lowerRadius] = CONE_ANCHORS[index - 1]
      return lowerRadius + ((upperRadius - lowerRadius) * (hours - lowerHour)) / (upperHour - lowerHour)
    }
  }
  return CONE_ANCHORS[CONE_ANCHORS.length - 1][1] + (hours - 48) * 2
}

function windRadii(windSpeedKmh, galeRadiusKm) {
  const intensityScale = clamp(windSpeedKmh / 120, 0.5, 1.5)
  return {
    kt34Km: Math.round(galeRadiusKm * intensityScale),
    kt50Km: Math.round(galeRadiusKm * 0.62 * intensityScale),
    kt64Km: windSpeedKmh >= 118 ? Math.round(galeRadiusKm * 0.35 * intensityScale) : 0,
  }
}

function positionAlongRoute(routePoints, progress) {
  const segments = routePoints.slice(1).map((point, index) => ({
    start: routePoints[index],
    end: point,
    distance: distanceKm(routePoints[index], point),
  }))
  const totalDistance = segments.reduce((total, segment) => total + segment.distance, 0)
  let remainingDistance = totalDistance * progress

  for (const segment of segments) {
    if (remainingDistance <= segment.distance || segment === segments[segments.length - 1]) {
      const segmentProgress = segment.distance === 0 ? 1 : Math.min(1, remainingDistance / segment.distance)
      if (segmentProgress >= 1) return { ...segment.end, totalDistance }
      const startLatitude = toRadians(segment.start.latitude)
      const startLongitude = toRadians(segment.start.longitude)
      const endLatitude = toRadians(segment.end.latitude)
      const endLongitude = toRadians(segment.end.longitude)
      const angularDistance = segment.distance / 6371
      const sineDistance = Math.sin(angularDistance)
      if (Math.abs(sineDistance) < 1e-12) {
        return {
          latitude: segment.start.latitude + (segment.end.latitude - segment.start.latitude) * segmentProgress,
          longitude: segment.start.longitude + (segment.end.longitude - segment.start.longitude) * segmentProgress,
          totalDistance,
        }
      }
      const startWeight = Math.sin((1 - segmentProgress) * angularDistance) / sineDistance
      const endWeight = Math.sin(segmentProgress * angularDistance) / sineDistance
      const x = startWeight * Math.cos(startLatitude) * Math.cos(startLongitude) +
        endWeight * Math.cos(endLatitude) * Math.cos(endLongitude)
      const y = startWeight * Math.cos(startLatitude) * Math.sin(startLongitude) +
        endWeight * Math.cos(endLatitude) * Math.sin(endLongitude)
      const z = startWeight * Math.sin(startLatitude) + endWeight * Math.sin(endLatitude)
      return {
        latitude: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
        longitude: toDegrees(Math.atan2(y, x)),
        totalDistance,
      }
    }
    remainingDistance -= segment.distance
  }

  const target = routePoints[routePoints.length - 1]
  return { latitude: target.latitude, longitude: target.longitude, totalDistance }
}

function forwardImpacts(position, cyclone, rainfall, capacity, leadHours, landfall) {
  const coneRadiusKm = coneRadiusForHour(leadHours)
  const radii = windRadii(cyclone.windSpeedKmh, cyclone.galeRadiusKm)
  const reachKm = radii.kt34Km + coneRadiusKm
  const rainMultiplier = landfall ? 1.2 : 1
  const districtEntries = Object.entries(DISTRICT_CENTROIDS).map(([name, [latitude, longitude]]) => {
    const distance = distanceKm(position, { latitude, longitude })
    const exposure = clamp(1 - distance / reachKm)
    const localWind = cyclone.windSpeedKmh * (0.55 + 0.45 * exposure)
    const localRain = rainfall.hourlyMm * (0.6 + 0.6 * exposure) * rainMultiplier
    const riverSignal = clamp(localRain / 260 * 0.7 + exposure * 0.3)
    const floodScore = clamp(localRain / 250 * 0.55 + riverSignal * 0.25 + exposure * 0.2)
    const riskScore = clamp(localWind / 220 * 0.45 + floodScore * 0.55)
    const exposedInstitutions = Math.round(
      (capacity.institutions / Object.keys(DISTRICT_CENTROIDS).length) * (0.4 + exposure * 0.9),
    )
    return {
      name,
      distanceKm: Math.round(distance),
      riskScore: Number(riskScore.toFixed(4)),
      riskTier: tier(riskScore),
      rainfallMm: Number(localRain.toFixed(1)),
      riverSignal: Number(riverSignal.toFixed(4)),
      projectedWindKmh: Number(localWind.toFixed(1)),
      exposedInstitutions,
      resourceDemand: {
        boats: Math.ceil(exposedInstitutions * riskScore / 80),
        paramedics: Math.ceil(exposedInstitutions * riskScore / 20),
        rescueTeams: Math.ceil(exposedInstitutions * riskScore / 35),
      },
      insideCone: distance <= coneRadiusKm,
      insideGale: distance <= radii.kt34Km,
    }
  })
  const affectedDistricts = districtEntries.filter((entry) => entry.distanceKm <= reachKm)
  const districts = (capacity.districts >= Object.keys(DISTRICT_CENTROIDS).length
    ? districtEntries
    : districtEntries.slice(0, capacity.districts)
  ).map(({ name, distanceKm: distance, insideCone, insideGale, ...entry }) => ({
    district: name,
    ...entry,
    distanceToTrackKm: distance,
    insideCone,
    insideGale,
  }))

  const states = Object.entries(STATE_CENTROIDS).map(([name, [latitude, longitude]]) => {
    const distance = distanceKm(position, { latitude, longitude })
    const exposure = clamp(1 - distance / reachKm)
    const stateScore = clamp(exposure * 0.75 + clamp(cyclone.windSpeedKmh / 220) * 0.25)
    return {
      state: name,
      riskScore: Number(stateScore.toFixed(4)),
      riskTier: tier(stateScore),
      rainfallMm: Number((rainfall.hourlyMm * (0.4 + exposure * 0.8) * rainMultiplier).toFixed(1)),
      riverDischargeM3s: Number((exposure * rainMultiplier * 2500).toFixed(1)),
      temperatureC: Number((28 - 2 * (leadHours / 48) + exposure * 1.5).toFixed(1)),
      dataSource: 'imd_style_forward_forecast',
      distanceToTrackKm: Math.round(distance),
    }
  }).filter((entry) => entry.distanceToTrackKm <= reachKm)

  return {
    leadHours,
    coneRadiusKm: Math.round(coneRadiusKm),
    galeRadiusKm: cyclone.galeRadiusKm,
    windRadiiKm: radii,
    affectedDistricts: affectedDistricts.map((entry) => entry.name),
    affectedStates: states.map((entry) => entry.state),
    rainfallMm: Number((rainfall.hourlyMm * (landfall ? 1.2 : 1)).toFixed(1)),
    floodRiskTier: tier(clamp(rainfall.hourlyMm / 250 * (landfall ? 1.2 : 1))),
    shelterPressure: Math.round((capacity.shelters / 36) * affectedDistricts.length * 10) / 10,
    riskScore: Number(clamp(cyclone.windSpeedKmh / 220 * 0.4 + rainfall.hourlyMm / 250 * 0.6).toFixed(4)),
    riskTier: tier(clamp(cyclone.windSpeedKmh / 220 * 0.4 + rainfall.hourlyMm / 250 * 0.6)),
    districts,
    states,
  }
}

function calculateForwardStep(parameters, sequence, previousTimestamp) {
  const cyclone = parameters.cyclone || {}
  const rainfall = parameters.rainfall || {}
  const capacity = parameters.capacity || {}
  const leadHours = Math.max(1, sequence)
  const durationHours = rainfall.durationHours ?? 24
  const start = {
    latitude: cyclone.startLatitude ?? 17.6,
    longitude: cyclone.startLongitude ?? 88.8,
  }
  const headingDeg = cyclone.headingDeg === 'auto'
    ? 300
    : Number(cyclone.headingDeg ?? 300)
  const forwardSpeedKmh = cyclone.forwardSpeedKmh ?? 18
  const galeRadiusKm = cyclone.galeRadiusKm ?? 180
  const hourlyRain = rainfall.hourlyMm ?? 80

  let position = start
  let windSpeedKmh = cyclone.windSpeedKmh ?? 120
  let landfall = false
  for (let hour = 1; hour <= leadHours; hour += 1) {
    // Beta drift deflects the track slightly west/poleward in the Northern
    // Hemisphere (mirrored in the Southern Hemisphere).
    const bearing = normalizeBearing(headingDeg + (position.latitude >= 0 ? -2.5 : 2.5))
    const driftLatitude = position.latitude >= 0 ? 0.04 : -0.04
    const next = destinationPoint(position.latitude, position.longitude, bearing, forwardSpeedKmh)
    position = {
      latitude: clamp(next.latitude + driftLatitude, -89.9, 89.9),
      longitude: next.longitude,
    }
    const onLand = isIndianLand(position.latitude, position.longitude)
    if (onLand) {
      landfall = true
      windSpeedKmh = Math.max(25, windSpeedKmh * 0.88)
    }
  }

  const coneRadiusKm = coneRadiusForHour(leadHours)
  const radii = windRadii(windSpeedKmh, galeRadiusKm)
  const impacts = forwardImpacts(position, cyclone, rainfall, capacity, leadHours, landfall)
  const timestamp = new Date(previousTimestamp || Date.now())
  timestamp.setHours(timestamp.getHours() + 1)
  const score = impacts.riskScore

  return {
    timestamp,
    mode: 'forward_forecast',
    cyclone: {
      startLatitude: start.latitude,
      startLongitude: start.longitude,
      headingDeg,
      effectiveHeadingDeg: normalizeBearing(headingDeg + (position.latitude >= 0 ? -2.5 : 2.5)),
      forwardSpeedKmh,
      centralPressureHpa: cyclone.centralPressureHpa ?? 990,
      galeRadiusKm,
      coneRadiusKm: Math.round(coneRadiusKm),
      windRadiiKm: radii,
      isLandfall: landfall,
      distanceToStartKm: Number(distanceKm(start, position).toFixed(1)),
      positionLatitude: Number(position.latitude.toFixed(5)),
      positionLongitude: Number(position.longitude.toFixed(5)),
      windSpeedKmh: Number(windSpeedKmh.toFixed(1)),
      leadHours,
      durationHours,
      forecastHoursRemaining: Math.max(0, durationHours - leadHours),
    },
    weather: {
      hourlyRainfallMm: Number((hourlyRain * (landfall ? 1.2 : 1)).toFixed(1)),
      riverSignal: Number(clamp(hourlyRain / 250 * (landfall ? 1.2 : 1)).toFixed(4)),
      riverDischargeM3s: Number((hourlyRain / 250 * (landfall ? 1.2 : 1) * 2500).toFixed(1)),
      temperatureC: Number((28 - 2 * (leadHours / durationHours) + impacts.riskScore * 1.5).toFixed(1)),
      soilSaturation: Number(clamp(hourlyRain / 250 * (landfall ? 1.2 : 1)).toFixed(4)),
    },
    impacts: {
      ...impacts,
      criticalDistricts: impacts.districts.filter((item) => item.riskTier === 'CRITICAL').length,
      ...(leadHours === 12
        ? {
            milestone12h: {
              leadHours: 12,
              positionLatitude: Number(position.latitude.toFixed(5)),
              positionLongitude: Number(position.longitude.toFixed(5)),
              windSpeedKmh: Number(windSpeedKmh.toFixed(1)),
              coneRadiusKm: Math.round(coneRadiusKm),
              galeRadiusKm,
              affectedDistricts: impacts.affectedDistricts,
              affectedStates: impacts.affectedStates,
              floodRiskTier: impacts.floodRiskTier,
            },
          }
        : {}),
    },
    recommendations: {
      priority: tier(score),
      rationale: 'Rank districts by projected cone and gale exposure, wind gusts, rainfall and flood indicators.',
      resources: impacts.districts
        .filter((item) => item.riskTier === 'HIGH' || item.riskTier === 'CRITICAL')
        .map((item) => ({ district: item.district, ...item.resourceDemand })),
    },
  }
}

function calculateFixedRouteStep(parameters, sequence, previousTimestamp) {
  const cyclone = parameters.cyclone || {}
  const rainfall = parameters.rainfall || {}
  const capacity = parameters.capacity || {}
  const hours = sequence - 1
  const approach = clamp((hours + 1) / Math.max(rainfall.durationHours || 24, 1))
  const routePoints = cyclone.routePoints || [
    { latitude: cyclone.startLatitude || 17.6, longitude: cyclone.startLongitude || 88.8 },
    { latitude: cyclone.targetLatitude || 20.3, longitude: cyclone.targetLongitude || 86.6 },
  ]
  const routePosition = positionAlongRoute(routePoints, approach)
  const intensity = clamp((cyclone.windSpeedKmh || 120) / 220)
  const rain = clamp(((rainfall.hourlyMm || 80) / 250) * (0.65 + approach * 0.35))
  const river = clamp(rain * 0.72 + approach * 0.28)
  const score = clamp(rain * 0.45 + river * 0.35 + intensity * 0.2)
  const timestamp = new Date(previousTimestamp || Date.now())
  timestamp.setHours(timestamp.getHours() + 1)
  const districtNames = Object.keys(DISTRICT_CENTROIDS)
  const stateNames = Object.keys(STATE_CENTROIDS)
  const districts = districtNames.map((name, index) => {
    const localScore = clamp(score + ((index % 3) - 1) * 0.06)
    const exposedInstitutions = Math.round((capacity.institutions || 0) / districtNames.length * (0.7 + index / 80))
    return {
      district: name,
      riskScore: Number(localScore.toFixed(4)),
      riskTier: tier(localScore),
      rainfallMm: Number((rainfall.hourlyMm || 80) * (0.8 + index / 15) * (0.7 + approach * 0.3)).toFixed(1),
      riverSignal: Number(clamp(river + index * 0.015).toFixed(4)),
      exposedInstitutions,
      resourceDemand: {
        boats: Math.ceil(exposedInstitutions * localScore / 80),
        paramedics: Math.ceil(exposedInstitutions * localScore / 20),
        rescueTeams: Math.ceil(exposedInstitutions * localScore / 35),
      },
    }
  })
  const states = stateNames.map((name, index) => {
    const proximity = name === 'Odisha' ? 1 : 0.62 + (index % 7) * 0.04
    const stateScore = clamp(score * proximity)
    return {
      state: name,
      riskScore: Number(stateScore.toFixed(4)),
      riskTier: tier(stateScore),
      rainfallMm: Number((rainfall.hourlyMm * proximity).toFixed(1)),
      riverDischargeM3s: Number((river * 2500 * proximity).toFixed(1)),
      temperatureC: Number((28 - approach * 2 + rain * 1.5 + (index % 4) * 0.5).toFixed(1)),
      dataSource: 'synthetic_simulation',
    }
  })
  const critical = districts.filter((item) => item.riskTier === 'CRITICAL').length
  return {
    timestamp,
    mode: 'fixed_route',
    cyclone: {
      distanceToTargetKm: Number((routePosition.totalDistance * (1 - approach)).toFixed(1)),
      distanceToOdishaKm: Number((routePosition.totalDistance * (1 - approach)).toFixed(1)),
      startLatitude: routePoints[0].latitude,
      startLongitude: routePoints[0].longitude,
      targetLatitude: routePoints[routePoints.length - 1].latitude,
      targetLongitude: routePoints[routePoints.length - 1].longitude,
      routePoints,
      positionLatitude: Number(routePosition.latitude.toFixed(5)),
      positionLongitude: Number(routePosition.longitude.toFixed(5)),
      windSpeedKmh: Number(((cyclone.windSpeedKmh || 120) * (0.7 + approach * 0.3)).toFixed(1)),
      approachProgress: Number(approach.toFixed(4)),
    },
    weather: {
      hourlyRainfallMm: Number((rainfall.hourlyMm || 80).toFixed(1)),
      riverSignal: Number(river.toFixed(4)),
      riverDischargeM3s: Number((river * 2500).toFixed(1)),
      temperatureC: Number((28 - approach * 2 + rain * 1.5).toFixed(1)),
      soilSaturation: Number(clamp(rain * 0.8 + approach * 0.2).toFixed(4)),
    },
    impacts: {
      riskScore: Number(score.toFixed(4)),
      riskTier: tier(score),
      criticalDistricts: critical,
      districts,
      states,
    },
    recommendations: {
      priority: tier(score),
      rationale: 'Rank districts by rule-matrix risk, exposed institutions, and accessibility demand.',
      resources: districts
        .filter((item) => item.riskTier === 'HIGH' || item.riskTier === 'CRITICAL')
        .map((item) => ({ district: item.district, ...item.resourceDemand })),
    },
  }
}

export function calculateSimulationStep(parameters, sequence, previousTimestamp) {
  if (parameters?.mode === 'fixed_route') {
    return calculateFixedRouteStep(parameters, sequence, previousTimestamp)
  }
  return calculateForwardStep(parameters, sequence, previousTimestamp)
}

export { coneRadiusForHour, destinationPoint, isIndianLand, windRadii }
