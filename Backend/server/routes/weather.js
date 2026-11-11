import { Router } from 'express'

const router = Router()
const hubs = [
  { name: 'Srinagar', latitude: 34.0837, longitude: 74.7973 },
  { name: 'Leh', latitude: 34.1526, longitude: 77.5771 },
  { name: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { name: 'Jaipur', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Lucknow', latitude: 26.8467, longitude: 80.9462 },
  { name: 'Patna', latitude: 25.5941, longitude: 85.1376 },
  { name: 'Ahmedabad', latitude: 23.0225, longitude: 72.5714 },
  { name: 'Bhopal', latitude: 23.2599, longitude: 77.4126 },
  { name: 'Kolkata', latitude: 22.5726, longitude: 88.3639 },
  { name: 'Ranchi', latitude: 23.3441, longitude: 85.3096 },
  { name: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
  { name: 'Pune', latitude: 18.5204, longitude: 73.8567 },
  { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 },
  { name: 'Bhubaneswar', latitude: 20.2961, longitude: 85.8245 },
  { name: 'Paradip', latitude: 20.3167, longitude: 86.6167 },
  { name: 'Gopalpur', latitude: 19.2667, longitude: 84.9 },
  { name: 'Goa', latitude: 15.4909, longitude: 73.8278 },
  { name: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Kochi', latitude: 9.9312, longitude: 76.2673 },
  { name: 'Visakhapatnam', latitude: 17.6868, longitude: 83.2185 },
  { name: 'Guwahati', latitude: 26.1445, longitude: 91.7362 },
]
const supportedTileLayers = new Set(['temp_new', 'precipitation_new', 'wind_new', 'clouds_new'])
let cachedPoints = null
let cachedAt = 0

function validateCoordinates(request, response) {
  const latitude = Number(request.query.lat)
  const longitude = Number(request.query.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    response.status(400).json({ error: 'lat and lon must be valid coordinates' })
    return null
  }
  return { latitude, longitude }
}

router.get('/tiles/:layer/:z/:x/:y.png', async (request, response, next) => {
  try {
    const { layer, z, x, y } = request.params
    if (!supportedTileLayers.has(layer) || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      response.status(400).json({ error: 'Invalid weather tile request' })
      return
    }
    if (!process.env.OPENWEATHER_API_KEY) {
      response.status(503).json({ error: 'Weather service is not configured' })
      return
    }

    const url = new URL(`https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png`)
    url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
    const tileResponse = await fetch(url)
    if (!tileResponse.ok) {
      response.status(tileResponse.status).end()
      return
    }
    response.set('Content-Type', tileResponse.headers.get('content-type') || 'image/png')
    response.set('Cache-Control', 'public, max-age=300')
    response.send(Buffer.from(await tileResponse.arrayBuffer()))
  } catch (error) {
    next(error)
  }
})

router.get('/points', async (_request, response, next) => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      response.json({ available: false, points: [] })
      return
    }

    if (cachedPoints && Date.now() - cachedAt < 5 * 60 * 1000) {
      response.json({ available: true, points: cachedPoints, updatedAt: new Date(cachedAt).toISOString(), cached: true })
      return
    }

    const results = await Promise.allSettled(
      hubs.map(async (hub) => {
        const url = new URL('https://api.openweathermap.org/data/2.5/weather')
        url.searchParams.set('lat', hub.latitude)
        url.searchParams.set('lon', hub.longitude)
        url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
        url.searchParams.set('units', 'metric')
        const weatherResponse = await fetch(url)
        if (!weatherResponse.ok) throw new Error(`OpenWeather request failed with status ${weatherResponse.status}`)
        const data = await weatherResponse.json()
        return {
          ...hub,
          temperature: Math.round(data.main.temp * 10) / 10,
          feelsLike: Math.round(data.main.feels_like * 10) / 10,
          humidity: data.main.humidity,
          pressure: data.main.pressure,
          windSpeed: Math.round((data.wind.speed || 0) * 3.6),
          windDirection: data.wind.deg ?? null,
          windGust: data.wind.gust ? Math.round(data.wind.gust * 3.6) : 0,
          rainfall1h: data.rain?.['1h'] || 0,
          rainfall3h: data.rain?.['3h'] || 0,
          cloudCover: data.clouds?.all ?? 0,
          visibility: data.visibility ?? null,
          condition: data.weather?.[0]?.description || 'Unknown',
          conditionIcon: data.weather?.[0]?.icon || null,
          tempMin: data.main.temp_min,
          tempMax: data.main.temp_max,
          sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
          sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null,
          observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : null,
        }
      }),
    )
    const points = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
    if (!points.length) {
      response.status(503).json({ available: false, points: [], error: 'Weather provider returned no readings' })
      return
    }
    cachedPoints = points
    cachedAt = Date.now()
    response.json({ available: true, points, updatedAt: new Date(cachedAt).toISOString(), failedPointCount: hubs.length - points.length })
  } catch (error) {
    next(error)
  }
})

router.get('/location', async (request, response, next) => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      response.status(503).json({ error: 'Weather service is not configured' })
      return
    }
    const coordinates = validateCoordinates(request, response)
    if (!coordinates) return
    const url = new URL('https://api.openweathermap.org/data/2.5/weather')
    url.searchParams.set('lat', coordinates.latitude)
    url.searchParams.set('lon', coordinates.longitude)
    url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
    url.searchParams.set('units', 'metric')
    const weatherResponse = await fetch(url)
    if (!weatherResponse.ok) {
      response.status(weatherResponse.status).json({ error: 'Weather provider rejected this location' })
      return
    }
    const data = await weatherResponse.json()
    response.json({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      temperature: Math.round(data.main.temp * 10) / 10,
      feelsLike: Math.round(data.main.feels_like * 10) / 10,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: Math.round((data.wind.speed || 0) * 3.6),
      windDirection: data.wind.deg ?? null,
      windGust: data.wind.gust ? Math.round(data.wind.gust * 3.6) : 0,
      rainfall1h: data.rain?.['1h'] || 0,
      rainfall3h: data.rain?.['3h'] || 0,
      cloudCover: data.clouds?.all ?? 0,
      visibility: data.visibility ?? null,
      condition: data.weather?.[0]?.description || 'Unknown',
      observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : null,
    })

  } catch (error) {
    next(error)
  }
})

router.get('/forecast', async (request, response, next) => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      response.status(503).json({ available: false, error: 'OpenWeather forecast is optional and not configured' })
      return
    }
    const coordinates = validateCoordinates(request, response)
    if (!coordinates) return
    const url = new URL('https://api.openweathermap.org/data/2.5/forecast')
    url.searchParams.set('lat', coordinates.latitude)
    url.searchParams.set('lon', coordinates.longitude)
    url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
    url.searchParams.set('units', 'metric')
    const weatherResponse = await fetch(url)
    if (!weatherResponse.ok) {
      response.status(weatherResponse.status).json({ available: false, error: 'Weather provider rejected this location' })
      return
    }
    const data = await weatherResponse.json()
    const daily = new Map()
    for (const item of data.list || []) {
      const date = item.dt_txt?.slice(0, 10)
      if (!date) continue
      const existing = daily.get(date) || {
        date,
        minTemperature: item.main.temp_min,
        maxTemperature: item.main.temp_max,
        precipitation: 0,
        humidity: item.main.humidity,
        condition: item.weather?.[0]?.description || 'Unknown',
        icon: item.weather?.[0]?.icon || null,
      }
      existing.minTemperature = Math.min(existing.minTemperature, item.main.temp_min)
      existing.maxTemperature = Math.max(existing.maxTemperature, item.main.temp_max)
      existing.precipitation += Number(item.rain?.['3h'] || 0)
      daily.set(date, existing)
    }
    response.json({
      available: true,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      provider: 'OpenWeather',
      days: [...daily.values()].slice(0, 5),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/storms', (_request, response) => {
  try {
    const tracks = process.env.WEATHER_STORM_TRACKS_JSON
      ? JSON.parse(process.env.WEATHER_STORM_TRACKS_JSON)
      : []
    response.json({ tracks })
  } catch {
    response.status(500).json({ error: 'WEATHER_STORM_TRACKS_JSON must be valid JSON' })
  }
})

export default router
