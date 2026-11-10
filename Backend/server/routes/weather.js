import { Router } from 'express'

const router = Router()
const hubs = [
  { name: 'Bhubaneswar', latitude: 20.2961, longitude: 85.8245 },
  { name: 'Paradip', latitude: 20.3167, longitude: 86.6167 },
  { name: 'Gopalpur', latitude: 19.2667, longitude: 84.9 },
  { name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
]
const supportedTileLayers = new Set(['temp_new', 'precipitation_new', 'wind_new', 'clouds_new'])

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

    const points = await Promise.all(
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
          cloudCover: data.clouds?.all ?? 0,
          visibility: data.visibility ?? null,
          condition: data.weather?.[0]?.description || 'Unknown',
          observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : null,
        }
      }),
    )
    response.json({ available: true, points, updatedAt: new Date().toISOString() })
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
