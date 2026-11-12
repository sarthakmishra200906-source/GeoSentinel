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
  if (process.env.OPENWEATHER_API_KEY) {
    try {
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
        condition: data.weather?.[0]?.description || 'Clear',
        observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
      }
    } catch (_) {
      // Fallback to Open-Meteo
    }
  }

  // Open-Meteo fallback
  try {
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,surface_pressure,wind_speed_10m,cloud_cover`
    const omData = await fetchJson(omUrl)
    const cur = omData.current || {}
    return {
      latitude,
      longitude,
      temperature: Math.round((cur.temperature_2m ?? 25) * 10) / 10,
      feelsLike: Math.round((cur.apparent_temperature ?? cur.temperature_2m ?? 25) * 10) / 10,
      humidity: cur.relative_humidity_2m ?? 60,
      pressure: Math.round(cur.surface_pressure ?? 1012),
      windSpeed: Math.round((cur.wind_speed_10m || 0) * 10) / 10,
      rainfall1h: cur.rain ?? cur.precipitation ?? 0,
      cloudCover: cur.cloud_cover ?? 10,
      condition: (cur.rain ?? cur.precipitation ?? 0) > 0 ? 'Rain' : 'Clear',
      observedAt: new Date().toISOString(),
    }
  } catch (_) {
    // Offline baseline
    return {
      latitude,
      longitude,
      temperature: 26,
      feelsLike: 27,
      humidity: 65,
      pressure: 1012,
      windSpeed: 15,
      rainfall1h: 0,
      cloudCover: 20,
      condition: 'Clear',
      observedAt: new Date().toISOString(),
    }
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
