const DEFAULT_RAIN_THRESHOLD_MM = 26.4
const DEFAULT_RIVER_THRESHOLD = 2727.98

function clamp(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function classify(probability) {
  if (probability === null || probability === undefined) return 'UNAVAILABLE'
  if (probability >= 0.7) return 'CRITICAL'
  if (probability >= 0.5) return 'HIGH'
  if (probability >= 0.4) return 'MODERATE'
  return 'LOW'
}

export function assessTelemetry(reading, thresholds = {}) {
  const rainThreshold = Number(thresholds.rain95 ?? DEFAULT_RAIN_THRESHOLD_MM)
  const riverThreshold = Number(thresholds.river95 ?? DEFAULT_RIVER_THRESHOLD)
  const rain24h = Number(reading.precipitationSum)
  const rain72h = Number(reading.rain72h ?? reading.rainAmountMm)
  const riverDischarge = Number(reading.riverDischarge)
  const pressure = Number(reading.pressure ?? 1013)
  const wind = Number(reading.windSpeed ?? 0)

  if (![rain24h, rain72h, riverDischarge, pressure, wind].every(Number.isFinite)) {
    return {
      status: 'UNAVAILABLE',
      rainOutlook: null,
      activeFloodRisk: null,
      rainOutlookTier: 'UNAVAILABLE',
      activeFloodRiskTier: 'UNAVAILABLE',
      warnings: ['Required live telemetry is incomplete.'],
    }
  }

  const rainOutlook = clamp((Number(reading.rainChance ?? 0) / 100) * 0.4 + clamp(rain72h / (rainThreshold * 3)) * 0.6)
  const observedRainSignal = clamp(rain24h / rainThreshold)
  const riverSignal = clamp(riverDischarge / riverThreshold)
  const pressureSignal = clamp((1013 - pressure) / 35)
  const windSignal = clamp(wind / 100)
  const activeFloodRisk = clamp(
    observedRainSignal * 0.4 + riverSignal * 0.4 + pressureSignal * 0.1 + windSignal * 0.1,
  )

  return {
    status: 'LIVE',
    rainOutlook: Math.round(rainOutlook * 100) / 100,
    activeFloodRisk: Math.round(activeFloodRisk * 100) / 100,
    rainOutlookTier: classify(rainOutlook),
    activeFloodRiskTier: classify(activeFloodRisk),
    factors: {
      observedRainSignal: Math.round(observedRainSignal * 100) / 100,
      riverSignal: Math.round(riverSignal * 100) / 100,
      pressureSignal: Math.round(pressureSignal * 100) / 100,
      windSignal: Math.round(windSignal * 100) / 100,
    },
    warnings: ['Proxy-calibrated telemetry; not an official emergency warning.'],
  }
}

export { classify }
