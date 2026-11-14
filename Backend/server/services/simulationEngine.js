const DISTRICTS = ['Ganjam', 'Puri', 'Khordha', 'Jagatsinghpur', 'Kendrapara', 'Balasore', 'Malkangiri']

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function tier(score) {
  if (score >= 0.75) return 'CRITICAL'
  if (score >= 0.55) return 'HIGH'
  if (score >= 0.35) return 'MODERATE'
  return 'LOW'
}

export function calculateSimulationStep(parameters, sequence, previousTimestamp) {
  const cyclone = parameters.cyclone || {}
  const rainfall = parameters.rainfall || {}
  const capacity = parameters.capacity || {}
  const hours = sequence - 1
  const approach = clamp((hours + 1) / Math.max(rainfall.durationHours || 24, 1))
  const intensity = clamp((cyclone.windSpeedKmh || 120) / 220)
  const rain = clamp(((rainfall.hourlyMm || 80) / 250) * (0.65 + approach * 0.35))
  const river = clamp(rain * 0.72 + approach * 0.28)
  const score = clamp(rain * 0.45 + river * 0.35 + intensity * 0.2)
  const timestamp = new Date(previousTimestamp || Date.now())
  timestamp.setHours(timestamp.getHours() + 1)
  const districts = DISTRICTS.map((name, index) => {
    const localScore = clamp(score + ((index % 3) - 1) * 0.06)
    const exposedInstitutions = Math.round((capacity.institutions || 0) / DISTRICTS.length * (0.7 + index / 20))
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
  const critical = districts.filter((item) => item.riskTier === 'CRITICAL').length
  return {
    timestamp,
    cyclone: {
      distanceToOdishaKm: Number(Math.max(0, Number(cyclone.approachDistanceKm || 200) * (1 - approach)).toFixed(1)),
      windSpeedKmh: Number(((cyclone.windSpeedKmh || 120) * (0.7 + approach * 0.3)).toFixed(1)),
      approachProgress: Number(approach.toFixed(4)),
    },
    weather: {
      hourlyRainfallMm: Number((rainfall.hourlyMm || 80).toFixed(1)),
      riverSignal: Number(river.toFixed(4)),
      soilSaturation: Number(clamp(rain * 0.8 + approach * 0.2).toFixed(4)),
    },
    impacts: {
      riskScore: Number(score.toFixed(4)),
      riskTier: tier(score),
      criticalDistricts: critical,
      districts,
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
