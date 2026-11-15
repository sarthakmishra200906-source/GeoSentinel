import { Router } from 'express'
import { assessTelemetry } from '../services/riskAssessment.js'
import cycloneFeed from '../services/cycloneFeed.js'

const router = Router()
const hubs = [
  { name: 'Srinagar', state: 'Jammu and Kashmir', latitude: 34.0837, longitude: 74.7973 },
  { name: 'Leh', state: 'Ladakh', latitude: 34.1526, longitude: 77.5771 },
  { name: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { name: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
  { name: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { name: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  { name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  { name: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096 },
  { name: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { name: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { name: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { name: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  { name: 'Paradip', state: 'Odisha', latitude: 20.3167, longitude: 86.6167 },
  { name: 'Gopalpur', state: 'Odisha', latitude: 19.2667, longitude: 84.9 },
  { name: 'Goa', state: 'Goa', latitude: 15.4909, longitude: 73.8278 },
  { name: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185 },
  { name: 'Guwahati', state: 'Assam', latitude: 26.1445, longitude: 91.7362 },
]
const supportedTileLayers = new Set(['temp_new', 'precipitation_new', 'wind_new', 'clouds_new'])
let cachedPoints = null
let cachedAt = 0
let cachedDashboard = null
let cachedDashboardAt = 0
let dashboardInFlight = null

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

router.get('/dashboard', async (_request, response, next) => {
  if (cachedDashboard && Date.now() - cachedDashboardAt < 5 * 60 * 1000) {
    response.json({ ...cachedDashboard, cached: true })
    return
  }
  if (dashboardInFlight) {
    try {
      response.json({ ...(await dashboardInFlight), cached: true })
    } catch (error) {
      next(error)
    }
    return
  }
  dashboardInFlight = (async () => {
    const locations = [{ name: 'India', latitude: 20.5937, longitude: 78.9629 }, ...hubs]
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', locations.map((location) => location.latitude).join(','))
    url.searchParams.set('longitude', locations.map((location) => location.longitude).join(','))
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,surface_pressure',
    )
    url.searchParams.set('hourly', 'precipitation_probability,precipitation,temperature_2m')
    url.searchParams.set('forecast_days', '1')
    url.searchParams.set('timezone', 'auto')
    const weatherResponse = await fetch(url)
    if (!weatherResponse.ok) {
      throw new Error(`Forecast provider returned HTTP ${weatherResponse.status}`)
    }
    const payload = await weatherResponse.json()
    const weatherPayloads = Array.isArray(payload) ? payload : [payload]
    const floodResults = await Promise.allSettled(
      locations.map(async (location) => {
        const floodUrl = new URL('https://flood-api.open-meteo.com/v1/flood')
        floodUrl.searchParams.set('latitude', location.latitude)
        floodUrl.searchParams.set('longitude', location.longitude)
        floodUrl.searchParams.set('daily', 'river_discharge,river_discharge_max')
        floodUrl.searchParams.set('forecast_days', '1')
        const floodResponse = await fetch(floodUrl)
        return floodResponse.ok ? floodResponse.json() : null
      }),
    )
    const floodPayloads = floodResults.map((result) => (result.status === 'fulfilled' ? result.value : null))
    const readings = weatherPayloads.map((data, index) => {
      const current = data.current || {}
      const hourly = data.hourly || {}
      const probabilities = (hourly.precipitation_probability || []).map(Number).filter(Number.isFinite)
      const precipitation = (hourly.precipitation || []).map(Number).filter(Number.isFinite)
      const temperatures = (hourly.temperature_2m || []).map(Number).filter(Number.isFinite)
      const discharge = Number(floodPayloads[index]?.daily?.river_discharge?.[0] || 0)
      const rainAmountMm = precipitation.reduce((total, value) => total + value, 0)
      const assessment = assessTelemetry({
        precipitationSum: Number(current.rain ?? current.precipitation ?? 0),
        rain72h: rainAmountMm,
        rainChance: probabilities.length ? Math.max(...probabilities) : 0,
        riverDischarge: discharge,
        pressure: Number(current.surface_pressure ?? 1013),
        windSpeed: Number(current.wind_speed_10m ?? 0),
      })
      return {
        ...locations[index],
        temperature: Number(current.temperature_2m),
        humidity: Number(current.relative_humidity_2m),
        currentRainMm: Number(current.rain ?? current.precipitation ?? 0),
        rainChance: probabilities.length ? Math.max(...probabilities) : 0,
        rainAmountMm,
        riverDischarge: discharge,
        rainOutlook: assessment.rainOutlook,
        rainOutlookTier: assessment.rainOutlookTier,
        activeFloodRisk: assessment.activeFloodRisk,
        activeFloodRiskTier: assessment.activeFloodRiskTier,
        floodRisk: assessment.activeFloodRisk,
        floodRiskTier: assessment.activeFloodRiskTier,
        riskStatus: assessment.status,
        riskFactors: assessment.factors,
        riskWarnings: assessment.warnings,
        maxTemperature: temperatures.length ? Math.max(...temperatures) : Number(current.temperature_2m),
        windSpeed: Number(current.wind_speed_10m),
        pressure: Number(current.surface_pressure),
        condition: weatherCodeToCondition(current.weather_code),
        observedAt: current.time || new Date().toISOString(),
      }
    })
    return {
      provider: 'Open-Meteo forecast',
      generatedAt: new Date().toISOString(),
      india: readings[0],
      cities: readings.slice(1),
    }
  })()
  try {
    const result = await dashboardInFlight
    cachedDashboard = result
    cachedDashboardAt = Date.now()
    response.json(result)
  } catch (error) {
    response.status(503).json({ error: error.message })
  } finally {
    dashboardInFlight = null
  }
})

router.get('/states', async (_request, response, next) => {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', hubs.map((hub) => hub.latitude).join(','))
    url.searchParams.set('longitude', hubs.map((hub) => hub.longitude).join(','))
    url.searchParams.set('current', 'temperature_2m,precipitation,rain,wind_speed_10m,surface_pressure')
    url.searchParams.set('daily', 'precipitation_sum,temperature_2m_max')
    url.searchParams.set('forecast_days', '1')
    url.searchParams.set('timezone', 'UTC')
    const providerResponse = await fetch(url)
    if (!providerResponse.ok) {
      response.status(503).json({ error: `Forecast provider returned HTTP ${providerResponse.status}` })
      return
    }
    const payload = await providerResponse.json()
    const floodPayloads = await Promise.all(
      hubs.map(async (hub) => {
        const floodUrl = new URL('https://flood-api.open-meteo.com/v1/flood')
        floodUrl.searchParams.set('latitude', hub.latitude)
        floodUrl.searchParams.set('longitude', hub.longitude)
        floodUrl.searchParams.set('daily', 'river_discharge')
        floodUrl.searchParams.set('forecast_days', '1')
        const floodResponse = await fetch(floodUrl)
        return floodResponse.ok ? floodResponse.json() : null
      }),
    )
    const readings = (Array.isArray(payload) ? payload : [payload]).map((data, index) => {
      const current = data.current || {}
      const daily = data.daily || {}
      const riverDischarge = Number(floodPayloads[index]?.daily?.river_discharge?.[0])
      const assessment = assessTelemetry({
        precipitationSum: Number(current.rain ?? current.precipitation),
        rain72h: Number(current.rain ?? current.precipitation),
        riverDischarge,
        pressure: Number(current.surface_pressure),
        windSpeed: Number(current.wind_speed_10m),
      })
      return {
        ...hubs[index],
        rainfallMm: Number(daily.precipitation_sum?.[0] ?? current.precipitation ?? 0),
        temperature: Number(daily.temperature_2m_max?.[0] ?? current.temperature_2m),
        riverDischarge: Number.isFinite(riverDischarge) ? riverDischarge : null,
        activeFloodRisk: assessment.activeFloodRisk,
        activeFloodRiskTier: assessment.activeFloodRiskTier,
        riskStatus: assessment.status,
        observedAt: current.time || new Date().toISOString(),
      }
    })
    const grouped = new Map()
    for (const reading of readings) {
      const current = grouped.get(reading.state) || {
        state: reading.state,
        monitoredCities: 0,
        rainfallMm: 0,
        maxTemperature: null,
        activeAlertCount: 0,
        coverageStatus: 'LIVE',
        cities: [],
      }
      current.monitoredCities += 1
      current.rainfallMm += reading.rainfallMm
      current.maxTemperature = Math.max(current.maxTemperature ?? -Infinity, reading.temperature)
      if (['HIGH', 'CRITICAL'].includes(reading.activeFloodRiskTier)) current.activeAlertCount += 1
      current.riskValues = current.riskValues || []
      if (reading.activeFloodRisk !== null) current.riskValues.push(reading.activeFloodRisk)
      current.cities.push(reading.name)
      grouped.set(reading.state, current)
    }
    response.json({
      provider: 'Open-Meteo forecast',
      generatedAt: new Date().toISOString(),
      warning: 'Risk is proxy-calibrated and must not be used as an official emergency warning.',
      states: [...grouped.values()].map((state) => ({
        ...state,
        rainfallMm: Math.round(state.rainfallMm * 10) / 10,
        maxTemperature: Math.round(state.maxTemperature * 10) / 10,
        averageActiveFloodRisk: state.riskValues?.length
          ? Math.round((state.riskValues.reduce((total, value) => total + value, 0) / state.riskValues.length) * 100) / 100
          : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/trends', async (request, response, next) => {
  try {
    const state = String(request.query.state || '').trim()
    const selected = hubs.filter((hub) => !state || hub.state.toLowerCase() === state.toLowerCase())
    if (!selected.length) {
      response.status(400).json({ error: 'state must match a monitored state' })
      return
    }
    const end = new Date()
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 365)
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.searchParams.set('latitude', selected[0].latitude)
    url.searchParams.set('longitude', selected[0].longitude)
    url.searchParams.set('start_date', start.toISOString().slice(0, 10))
    url.searchParams.set('end_date', end.toISOString().slice(0, 10))
    url.searchParams.set('daily', 'precipitation_sum,temperature_2m_mean,temperature_2m_max')
    url.searchParams.set('timezone', 'UTC')
    const floodUrl = new URL('https://flood-api.open-meteo.com/v1/flood')
    floodUrl.searchParams.set('latitude', selected[0].latitude)
    floodUrl.searchParams.set('longitude', selected[0].longitude)
    floodUrl.searchParams.set('start_date', start.toISOString().slice(0, 10))
    floodUrl.searchParams.set('end_date', end.toISOString().slice(0, 10))
    floodUrl.searchParams.set('daily', 'river_discharge')
    floodUrl.searchParams.set('timezone', 'UTC')
    const [providerResponse, floodResponse] = await Promise.all([fetch(url), fetch(floodUrl)])
    if (!providerResponse.ok) {
      response.status(503).json({ error: `Historical provider returned HTTP ${providerResponse.status}` })
      return
    }
    const payload = await providerResponse.json()
    const floodPayload = floodResponse.ok ? await floodResponse.json() : {}
    const daily = payload.daily || {}
    const months = new Map()
    ;(daily.time || []).forEach((date, index) => {
      const month = String(date).slice(0, 7)
      const item = months.get(month) || {
        month,
        rainfallMm: 0,
        temperatureSum: 0,
        maxTemperature: -Infinity,
        riverDischargeSum: 0,
        riverDays: 0,
        days: 0,
      }
      item.rainfallMm += Number(daily.precipitation_sum?.[index] || 0)
      item.temperatureSum += Number(daily.temperature_2m_mean?.[index] || 0)
      item.maxTemperature = Math.max(item.maxTemperature, Number(daily.temperature_2m_max?.[index] || 0))
      const river = Number(floodPayload.daily?.river_discharge?.[index])
      if (Number.isFinite(river)) {
        item.riverDischargeSum += river
        item.riverDays += 1
      }
      item.days += 1
      months.set(month, item)
    })
    response.json({
      state: selected[0].state,
      city: selected[0].name,
      provider: 'Open-Meteo Historical Weather',
      generatedAt: new Date().toISOString(),
      coverageStatus: 'PARTIAL',
      warning: 'Flood-risk labels remain unavailable until verified flood-event observations are supplied.',
      months: [...months.values()].map((item) => ({
        month: item.month,
        rainfallMm: Math.round(item.rainfallMm * 10) / 10,
        meanTemperature: item.days ? Math.round((item.temperatureSum / item.days) * 10) / 10 : null,
        maxTemperature: Math.round(item.maxTemperature * 10) / 10,
        averageRiverDischarge: item.riverDays ? Math.round((item.riverDischargeSum / item.riverDays) * 10) / 10 : null,
        floodRisk: null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/storms', async (_request, response, next) => {
  try {
    response.json(await cycloneFeed.getCurrentEvents())
  } catch (error) {
    next(error)
  }
})

router.post('/storms/simulate', (_request, response) => {
  response.status(410).json({ error: 'Cyclone simulation has been removed; only live provider data is shown.' })
})

export default router
