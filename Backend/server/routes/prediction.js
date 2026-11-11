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
  if (!process.env.OPENWEATHER_API_KEY) {
    const error = new Error('Weather service is not configured')
    error.statusCode = 503
    throw error
  }
  const url = new URL('https://api.openweathermap.org/data/2.5/weather')
  url.searchParams.set('lat', latitude)
  url.searchParams.set('lon', longitude)
  url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
  url.searchParams.set('units', 'metric')
  const data = await fetchJson(url)
  return {
    latitude,
    longitude,
    temperature: Math.round(data.main.temp * 10) / 10,
    feelsLike: Math.round(data.main.feels_like * 10) / 10,
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    windSpeed: Math.round((data.wind.speed || 0) * 3.6),
    rainfall1h: data.rain?.['1h'] || 0,
    cloudCover: data.clouds?.all ?? 0,
    condition: data.weather?.[0]?.description || 'Unknown',
    observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : null,
  }
}

async function predict(weather, status = 'SIMULATED') {
  const baseUrl = process.env.FASTAPI_URL || 'http://127.0.0.1:8000'
  const prediction = await fetchJson(`${baseUrl}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      features: weatherToFeatures(weather),
      feature_timestamp: weather.observedAt || new Date().toISOString(),
    }),
  })
  return {
    ...prediction,
    status: status === 'SIMULATED' ? prediction.status : prediction.status,
    source: 'OpenWeather-derived features',
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
