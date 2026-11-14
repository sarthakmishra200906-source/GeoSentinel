import { Router } from 'express'
import { requireAdmin } from '../middleware/admin.js'
import { weatherToFeatures } from '../services/weatherFeatures.js'

const router = Router()
const DEFAULT_TIMEOUT_MS = 5000

function coordinatesFrom(body) {
  const latitude = Number(body.latitude ?? body.lat)
  const longitude = Number(body.longitude ?? body.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    const error = new Error('latitude and longitude must be valid coordinates')
    error.statusCode = 400
    throw error
  }
  return { latitude, longitude }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ML_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.detail || `Dependency returned HTTP ${response.status}`)
      error.statusCode = response.status
      throw error
    }
    return payload
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = error.name === 'AbortError' ? 504 : 503
      error.message = error.name === 'AbortError' ? 'Prediction dependency timed out' : `Prediction dependency unavailable: ${error.message}`
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchWeather({ latitude, longitude }) {
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
  forecastUrl.searchParams.set('latitude', latitude)
  forecastUrl.searchParams.set('longitude', longitude)
  forecastUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,surface_pressure,wind_speed_10m',
  )
  forecastUrl.searchParams.set('hourly', 'precipitation_probability,precipitation,wind_speed_10m')
  forecastUrl.searchParams.set('daily', 'precipitation_sum,precipitation_probability_max,wind_speed_10m_max')
  forecastUrl.searchParams.set('forecast_days', '3')
  forecastUrl.searchParams.set('timezone', 'UTC')
  const floodUrl = new URL('https://flood-api.open-meteo.com/v1/flood')
  floodUrl.searchParams.set('latitude', latitude)
  floodUrl.searchParams.set('longitude', longitude)
  floodUrl.searchParams.set('daily', 'river_discharge,river_discharge_max')
  floodUrl.searchParams.set('forecast_days', '3')
  floodUrl.searchParams.set('timezone', 'UTC')

  const [forecast, flood] = await Promise.all([fetchJson(forecastUrl), fetchJson(floodUrl)])
  const current = forecast.current || {}
  const daily = forecast.daily || {}
  const hourlyRain = (forecast.hourly?.precipitation || []).map(Number).filter(Number.isFinite)
  const dailyRain = (daily.precipitation_sum || []).map(Number).filter(Number.isFinite)
  const discharge = (flood.daily?.river_discharge || []).map(Number).filter(Number.isFinite)
  const dischargeMax = (flood.daily?.river_discharge_max || []).map(Number).filter(Number.isFinite)
  const windMax = (daily.wind_speed_10m_max || []).map(Number).filter(Number.isFinite)
  return {
    latitude,
    longitude,
    temperature: Number(current.temperature_2m),
    feelsLike: Number(current.apparent_temperature),
    humidity: Number(current.relative_humidity_2m),
    pressure: Number(current.surface_pressure),
    windSpeed: Number(current.wind_speed_10m),
    windSpeedMax: windMax.length ? Math.max(...windMax) : Number(current.wind_speed_10m),
    rainfall1h: Number(current.rain ?? current.precipitation ?? 0),
    precipitationSum: dailyRain[0] || 0,
    rain72h: dailyRain.reduce((total, value) => total + value, 0) || hourlyRain.reduce((total, value) => total + value, 0),
    rainChance: Math.max(...(daily.precipitation_probability_max || [0]).map(Number)),
    rainAmountMm: dailyRain.reduce((total, value) => total + value, 0),
    riverDischarge: discharge[0] || 0,
    riverDischargeMax: dischargeMax[0] || 0,
    condition: Number(current.rain ?? current.precipitation ?? 0) > 0 ? 'Rain' : 'Clear',
    observedAt: current.time || new Date().toISOString(),
    provider: 'Open-Meteo weather + Global Flood',
  }
}

async function predict(weather, status = 'SIMULATED') {
  const baseUrl = process.env.FASTAPI_URL || 'http://127.0.0.1:8000'
  const observedTime = weather.observedAt ? new Date(weather.observedAt).getTime() : Date.now()
  const safeTimestamp = new Date(Math.min(Date.now(), observedTime)).toISOString()
  const prediction = await fetchJson(`${baseUrl}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      features: weatherToFeatures(weather),
      feature_timestamp: safeTimestamp,
    }),
  })
  return {
    ...prediction,
    status: status === 'SIMULATED' ? prediction.status : prediction.status,
    source: 'Open-Meteo weather + Global Flood telemetry',
    weather,
    generatedAt: new Date().toISOString(),
  }
}

router.post('/', async (request, response, next) => {
  try {
    const coordinates = coordinatesFrom(request.body || {})
    const weather = await fetchWeather(coordinates)
    response.json(await predict(weather))
  } catch (error) {
    next(error)
  }
})

router.post('/simulate', ...requireAdmin, async (request, response, next) => {
  try {
    const coordinates = coordinatesFrom(request.body || { latitude: 20.5937, longitude: 78.9629 })
    const weather = {
      ...coordinates,
      temperature: 27,
      feelsLike: 29,
      humidity: 98,
      pressure: 985,
      windSpeed: 72,
      rainfall1h: 55,
      cloudCover: 100,
      condition: 'simulation: heavy rain',
      observedAt: new Date().toISOString(),
    }
    const result = await predict(weather, 'SIMULATED')
    result.status = 'SIMULATED'
    result.warnings = [...(result.warnings || []), 'Dry-run only; this does not create or change a public alert.']
    response.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
