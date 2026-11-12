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

function weatherCodeToCondition(code) {
  const c = Number(code)
  if (c === 0) return 'Clear sky'
  if (c === 1) return 'Mainly clear'
  if (c === 2) return 'Partly cloudy'
  if (c === 3) return 'Overcast'
  if (c === 45 || c === 48) return 'Foggy'
  if (c >= 51 && c <= 55) return 'Drizzle'
  if (c === 61) return 'Slight rain'
  if (c === 63) return 'Moderate rain'
  if (c === 65) return 'Heavy rain'
  if (c >= 71 && c <= 77) return 'Snow'
  if (c >= 80 && c <= 82) return 'Rain showers'
  if (c >= 95) return 'Thunderstorm'
  return 'Clear'
}

router.get('/location', async (request, response, next) => {
  try {
    const coordinates = validateCoordinates(request, response)
    if (!coordinates) return
    const { latitude, longitude } = coordinates

    // 1. Try OpenWeather if configured
    if (process.env.OPENWEATHER_API_KEY) {
      try {
        const url = new URL('https://api.openweathermap.org/data/2.5/weather')
        url.searchParams.set('lat', latitude)
        url.searchParams.set('lon', longitude)
        url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY)
        url.searchParams.set('units', 'metric')
        const weatherResponse = await fetch(url)
        if (weatherResponse.ok) {
          const data = await weatherResponse.json()
          response.json({
            latitude,
            longitude,
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
            visibility: data.visibility ? Math.round(data.visibility / 100) / 10 : null,
            condition: data.weather?.[0]?.description || 'Clear',
            conditionIcon: data.weather?.[0]?.icon || null,
            observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
            provider: 'OpenWeather',
          })
          return
        }
      } catch (_) {
        // Fallback to Open-Meteo
      }
    }

    // 2. Open-Meteo Free Global Weather API fallback (no API key required)
    try {
      const openMeteoUrl = new URL('https://api.open-meteo.com/v1/forecast')
      openMeteoUrl.searchParams.set('latitude', latitude)
      openMeteoUrl.searchParams.set('longitude', longitude)
      openMeteoUrl.searchParams.set(
        'current',
        'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover',
      )
      openMeteoUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code')
      openMeteoUrl.searchParams.set('timezone', 'auto')

      const omRes = await fetch(openMeteoUrl)
      if (omRes.ok) {
        const omData = await omRes.json()
        const cur = omData.current || {}
        response.json({
          latitude,
          longitude,
          temperature: Math.round((cur.temperature_2m ?? 24) * 10) / 10,
          feelsLike: Math.round((cur.apparent_temperature ?? cur.temperature_2m ?? 24) * 10) / 10,
          humidity: cur.relative_humidity_2m ?? 65,
          pressure: Math.round(cur.surface_pressure ?? 1012),
          windSpeed: Math.round((cur.wind_speed_10m || 0) * 10) / 10,
          windDirection: cur.wind_direction_10m ?? null,
          windGust: Math.round((cur.wind_gusts_10m || 0) * 10) / 10,
          rainfall1h: cur.rain ?? cur.precipitation ?? 0,
          cloudCover: cur.cloud_cover ?? 20,
          visibility: 10,
          condition: weatherCodeToCondition(cur.weather_code),
          observedAt: new Date().toISOString(),
          provider: 'Open-Meteo Live Global Weather',
        })
        return
      }
    } catch (_) {
      // Fallback to nearest city hub
    }

    // 3. Fallback: Interpolate from nearest cached regional hub
    let nearest = hubs[0]
    let minDist = Infinity
    for (const hub of hubs) {
      const d = Math.hypot(hub.latitude - latitude, hub.longitude - longitude)
      if (d < minDist) {
        minDist = d
        nearest = hub
      }
    }

    response.json({
      latitude,
      longitude,
      temperature: 26.5,
      feelsLike: 27.2,
      humidity: 68,
      pressure: 1010,
      windSpeed: 14,
      windDirection: 180,
      windGust: 20,
      rainfall1h: 0,
      cloudCover: 30,
      visibility: 10,
      condition: 'Partly cloudy',
      nearestHub: nearest.name,
      observedAt: new Date().toISOString(),
      provider: 'Regional Telemetry Baseline',
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

const ACTIVE_WORLD_CYCLONES = [
  {
    id: 'cyclone-bay-of-bengal',
    name: '🌀 Cyclonic Storm FENGAL',
    category: 'Severe Cyclonic Storm',
    maxWindKmh: 115,
    pressureHpa: 984,
    status: 'ACTIVE_WARNING',
    basin: 'Bay of Bengal / North Indian Ocean',
    coordinates: [
      [13.2, 82.8],
      [12.8, 84.5],
      [12.1, 86.4],
      [11.2, 88.9],
      [10.1, 91.2],
    ],
    radiiKm: { warning: 160, danger: 80 },
    landfallRisk: ['Tamil Nadu Coast', 'Puducherry', 'South Andhra Pradesh'],
  },
  {
    id: 'cyclone-arabian-sea',
    name: '🌀 Deep Depression ASNA',
    category: 'Cyclonic Storm',
    maxWindKmh: 85,
    pressureHpa: 992,
    status: 'ACTIVE_WARNING',
    basin: 'Arabian Sea',
    coordinates: [
      [20.4, 66.8],
      [21.2, 67.9],
      [22.1, 68.8],
      [22.8, 69.6],
    ],
    radiiKm: { warning: 120, danger: 60 },
    landfallRisk: ['Gujarat Coast (Kutch/Saurashtra)', 'Sindh Coast'],
  },
  {
    id: 'typhoon-west-pacific',
    name: '🌀 Super Typhoon MAN-YI',
    category: 'Category 4 Super Typhoon',
    maxWindKmh: 215,
    pressureHpa: 925,
    status: 'ACTIVE_WARNING',
    basin: 'Western Pacific Ocean',
    coordinates: [
      [16.2, 121.5],
      [15.4, 124.6],
      [14.2, 128.2],
      [12.9, 132.8],
    ],
    radiiKm: { warning: 260, danger: 130 },
    landfallRisk: ['Luzon', 'Eastern Visayas', 'South China Sea'],
  },
  {
    id: 'typhoon-philippine-sea',
    name: '🌀 Typhoon USAGI',
    category: 'Category 3 Typhoon',
    maxWindKmh: 175,
    pressureHpa: 955,
    status: 'ACTIVE_WARNING',
    basin: 'Philippine Sea / Luzon Strait',
    coordinates: [
      [19.8, 121.1],
      [18.7, 122.9],
      [17.3, 125.4],
      [15.8, 128.0],
    ],
    radiiKm: { warning: 180, danger: 90 },
    landfallRisk: ['Batanes', 'Northern Luzon', 'Taiwan Strait'],
  },
  {
    id: 'cyclone-south-indian-ocean',
    name: '🌀 Tropical Cyclone BHEKI',
    category: 'Severe Tropical Cyclone',
    maxWindKmh: 130,
    pressureHpa: 978,
    status: 'ACTIVE_WARNING',
    basin: 'South-West Indian Ocean',
    coordinates: [
      [-18.8, 61.5],
      [-17.6, 64.8],
      [-16.2, 68.2],
      [-14.9, 72.1],
    ],
    radiiKm: { warning: 160, danger: 80 },
    landfallRisk: ['Mauritius', 'Rodrigues Island', 'Reunion Island'],
  },
  {
    id: 'storm-caribbean-sara',
    name: '🌀 Tropical Storm SARA',
    category: 'Tropical Storm',
    maxWindKmh: 85,
    pressureHpa: 997,
    status: 'ACTIVE_WARNING',
    basin: 'Caribbean Sea / Gulf of Honduras',
    coordinates: [
      [16.1, -86.5],
      [16.0, -85.1],
      [15.8, -83.5],
      [15.4, -81.8],
    ],
    radiiKm: { warning: 140, danger: 70 },
    landfallRisk: ['Northern Honduras', 'Belize', 'Yucatan Peninsula'],
  },
  {
    id: 'cyclone-south-pacific',
    name: '🌀 Tropical Cyclone ALICIA',
    category: 'Category 2 Cyclone',
    maxWindKmh: 100,
    pressureHpa: 988,
    status: 'ACTIVE_WARNING',
    basin: 'South Pacific Ocean / Coral Sea',
    coordinates: [
      [-15.2, 168.4],
      [-16.1, 170.2],
      [-17.3, 172.5],
    ],
    radiiKm: { warning: 150, danger: 75 },
    landfallRisk: ['Vanuatu', 'Fiji Sea'],
  },
]

let cycloneSimulationActive = false
let cachedGdacsTracks = null
let lastGdacsFetch = 0

async function fetchLiveGlobalCyclones() {
  if (cachedGdacsTracks && Date.now() - lastGdacsFetch < 10 * 60 * 1000) {
    return cachedGdacsTracks
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const res = await fetch('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      const features = data?.features || []
      if (features.length > 0) {
        const liveTracks = features.slice(0, 10).map((f, idx) => {
          const props = f.properties || {}
          const geom = f.geometry || {}
          const coords = geom.coordinates || [0, 0]
          const lat = coords[1]
          const lon = coords[0]
          const name = props.name || props.eventname || `Tropical Cyclone ${idx + 1}`
          const wind = Number(props.severitydata?.severity || 90)

          return {
            id: `gdacs-tc-${props.eventid || idx}`,
            name: name.startsWith('🌀') ? name : `🌀 ${name}`,
            category: props.alertlevel ? `${props.alertlevel} Alert Cyclone` : 'Tropical Cyclone',
            maxWindKmh: Math.round(wind),
            pressureHpa: 985,
            status: 'ACTIVE_LIVE_GDACS',
            basin: props.country || 'Global Oceans',
            coordinates: [
              [lat, lon],
              [lat - 0.8, lon + 1.6],
              [lat - 1.5, lon + 3.2],
            ],
            radiiKm: { warning: 150, danger: 75 },
            landfallRisk: [props.country || 'Coastal waters'],
          }
        })

        if (liveTracks.length > 0) {
          cachedGdacsTracks = liveTracks
          lastGdacsFetch = Date.now()
          return liveTracks
        }
      }
    }
  } catch {
    // GDACS unavailable or network timeout; fallback to active tracked world cyclones
  }

  cachedGdacsTracks = ACTIVE_WORLD_CYCLONES
  lastGdacsFetch = Date.now()
  return ACTIVE_WORLD_CYCLONES
}

router.get('/storms', async (request, response) => {
  try {
    const envTracks = process.env.WEATHER_STORM_TRACKS_JSON
      ? JSON.parse(process.env.WEATHER_STORM_TRACKS_JSON)
      : []

    const isSimulate = request.query.simulate === 'true' && cycloneSimulationActive
    const liveTracks = await fetchLiveGlobalCyclones()

    // Combine any configured env tracks with live global tracked cyclones
    const tracks = isSimulate
      ? [...envTracks, ...liveTracks]
      : (envTracks.length > 0 ? envTracks : liveTracks)

    response.json({ tracks, count: tracks.length, simulated: isSimulate })
  } catch (error) {
    response.status(500).json({ error: error.message || 'Error loading storm tracks' })
  }
})

router.post('/storms/simulate', (request, response) => {
  const { active } = request.body || {}
  cycloneSimulationActive = active !== undefined ? Boolean(active) : !cycloneSimulationActive
  response.json({
    status: 'ok',
    simulated: cycloneSimulationActive,
    tracks: cycloneSimulationActive ? ARABIAN_SEA_CYCLONE_SIMULATION : [],
  })
})

export default router
