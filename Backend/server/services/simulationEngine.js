const DISTRICTS = [
  'Angul', 'Balasore', 'Bargarh', 'Bhadrak', 'Bolangir', 'Boudh', 'Cuttack',
  'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur',
  'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar',
  'Khordha', 'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur',
  'Nayagarh', 'Nuapada', 'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur',
  'Sundargarh',
]

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function tier(score) {
  if (score >= 0.75) return 'CRITICAL'
  if (score >= 0.55) return 'HIGH'
  if (score >= 0.35) return 'MODERATE'
  return 'LOW'
}

function distanceKm(start, end) {
  const radians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDifference = radians(end.latitude - start.latitude)
  const longitudeDifference = radians(end.longitude - start.longitude)
  const startLatitude = radians(start.latitude)
  const endLatitude = radians(end.latitude)
  const rawHaversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDifference / 2) ** 2
  const haversine = Math.min(1, Math.max(0, rawHaversine))
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
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
      const radians = (degrees) => (degrees * Math.PI) / 180
      const degrees = (value) => (value * 180) / Math.PI
      const startLatitude = radians(segment.start.latitude)
      const startLongitude = radians(segment.start.longitude)
      const endLatitude = radians(segment.end.latitude)
      const endLongitude = radians(segment.end.longitude)
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
        latitude: degrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
        longitude: degrees(Math.atan2(y, x)),
        totalDistance,
      }
    }
    remainingDistance -= segment.distance
  }

  const target = routePoints[routePoints.length - 1]
  return { latitude: target.latitude, longitude: target.longitude, totalDistance }
}

export function calculateSimulationStep(parameters, sequence, previousTimestamp) {
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
  const districts = DISTRICTS.map((name, index) => {
    const localScore = clamp(score + ((index % 3) - 1) * 0.06)
    const exposedInstitutions = Math.round((capacity.institutions || 0) / DISTRICTS.length * (0.7 + index / 80))
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
  const states = STATES.map((name, index) => {
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
