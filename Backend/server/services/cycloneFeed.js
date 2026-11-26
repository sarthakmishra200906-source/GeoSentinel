const GDACS_CYCLONE_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC'
const NHC_CURRENT_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json'
const ATCF_SOURCES = [
  { id: 'JTWC-WP', url: 'https://www.metoc.navy.mil/jtwc/products/abpwweb.txt', basin: 'Western Pacific' },
  { id: 'JTWC-SH', url: 'https://www.metoc.navy.mil/jtwc/products/shtwweb.txt', basin: 'Southern Hemisphere' },
]
const CACHE_DURATION_MS = 5 * 60 * 1000
const FAILURE_RETRY_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 8000
const RECENT_EVENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const INDIA_CYCLONE_BOUNDS = { minLat: -5, maxLat: 35, minLon: 55, maxLon: 105 }
const KNOTS_TO_KMH = 1.852
const DEDUP_DISTANCE_KM = 180
const STATUS_ORDER = {
  ACTIVE_LIVE_GDACS: 0,
  ACTIVE_ATCF: 0,
  FORMING_DEPRESSION: 1,
  FORMING_INVEST: 1,
  UPCOMING_GDACS: 2,
  RECENT_GDACS: 3,
}

function parseProviderDate(value) {
  if (!value) return Number.NaN
  const date = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)
  return Date.parse(hasTimezone ? date : `${date}Z`)
}

function parseAtcfDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]))).toISOString()
}

function parseAtcfLatitude(value) {
  const match = /^(\d{2,3})([NS])$/.exec(String(value || '').trim())
  if (!match) return null
  const latitude = Number(match[1]) / 10
  return match[2] === 'S' ? -latitude : latitude
}

function parseAtcfLongitude(value) {
  const match = /^(\d{3,4})([EW])$/.exec(String(value || '').trim())
  if (!match) return null
  const longitude = Number(match[1]) / 10
  return match[2] === 'W' ? -longitude : longitude
}

function getCoordinates(feature) {
  const geometry = feature?.geometry
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates]
  }
  if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
  }
  return []
}

// Raw GDACS geometry is GeoJSON ([longitude, latitude]); normalized tracks
// from every provider use [latitude, longitude].
function isIndiaGeoJsonCoordinates(coordinates) {
  return coordinates.some(([longitude, latitude]) => (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= INDIA_CYCLONE_BOUNDS.minLat &&
    Number(latitude) <= INDIA_CYCLONE_BOUNDS.maxLat &&
    Number(longitude) >= INDIA_CYCLONE_BOUNDS.minLon &&
    Number(longitude) <= INDIA_CYCLONE_BOUNDS.maxLon
  ))
}

function isIndiaTrackCoordinates(coordinates = []) {
  return coordinates.some(([latitude, longitude]) => (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= INDIA_CYCLONE_BOUNDS.minLat &&
    Number(latitude) <= INDIA_CYCLONE_BOUNDS.maxLat &&
    Number(longitude) >= INDIA_CYCLONE_BOUNDS.minLon &&
    Number(longitude) <= INDIA_CYCLONE_BOUNDS.maxLon
  ))
}

function getEventStatus(feature, now) {
  const properties = feature?.properties || {}
  const startsAt = parseProviderDate(properties.fromdate || properties.fromDate)
  const endsAt = parseProviderDate(properties.todate || properties.toDate)
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    startsAt > now + 7 * 24 * 60 * 60 * 1000 ||
    endsAt < now - RECENT_EVENT_RETENTION_MS
  ) {
    return null
  }
  const coordinates = getCoordinates(feature)
  const country = String(properties.country || '').toLowerCase()
  if (!country.includes('india') && !isIndiaGeoJsonCoordinates(coordinates)) return null
  if (startsAt > now) return 'UPCOMING_GDACS'
  if (endsAt < now) return 'RECENT_GDACS'
  return 'ACTIVE_LIVE_GDACS'
}

function mapCycloneFeature(feature, index, status) {
  const properties = feature.properties || {}
  const coordinates = getCoordinates(feature)
    .map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude))
  if (!coordinates.length) return null

  const wind = Number(properties.severitydata?.severity)
  const name = properties.name || properties.eventname || `Tropical Cyclone ${index + 1}`
  return {
    id: `gdacs-tc-${properties.eventid || index}`,
    name: name.startsWith('🌀') ? name : `🌀 ${name}`,
    category: properties.alertlevel ? `${properties.alertlevel} Alert Cyclone` : 'Tropical Cyclone',
    ...(Number.isFinite(wind) ? { maxWindKmh: Math.round(wind) } : {}),
    status,
    basin: properties.country || 'Global Oceans',
    coordinates,
    locationType: feature.geometry.type,
    source: 'GDACS',
    sources: ['GDACS'],
    reportUrl: properties.url?.report || null,
    validFrom: properties.fromdate || null,
    validUntil: properties.todate || null,
    lastUpdated: properties.datemodified || null,
  }
}

function statusForStormType(type) {
  const code = String(type || '').trim().toUpperCase()
  if (['DB', 'LO', 'WB', 'WV', 'SD', 'SS'].includes(code)) return 'FORMING_INVEST'
  if (['TD', 'EP', 'CP'].includes(code)) return 'FORMING_DEPRESSION'
  return 'ACTIVE_ATCF'
}

function categoryForStormType(type) {
  const categories = {
    DB: 'Disturbance / Invest',
    LO: 'Low-pressure area',
    WB: 'Tropical wave',
    SD: 'Subtropical depression',
    SS: 'Subtropical storm',
    TD: 'Tropical Depression',
    TS: 'Tropical Storm',
    HU: 'Hurricane',
    TY: 'Typhoon',
    ST: 'Severe Tropical Storm',
    CY: 'Cyclone',
    EP: 'Extratropical',
  }
  return categories[String(type || '').trim().toUpperCase()] || 'Tropical System'
}

// Parse plain-text ATCF best-track/forecast records (JTWC and NHC formats).
export function parseAtcfText(text, source, now = Date.now()) {
  if (typeof text !== 'string') return []
  const storms = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const fields = line.split(',').map((field) => field.trim())
    const dateIndex = fields.findIndex((field) => /^\d{10}$/.test(field))
    if (dateIndex < 0) continue
    const validTime = parseAtcfDate(fields[dateIndex])
    if (!validTime) continue
    const observedAt = Date.parse(validTime)
    if (!Number.isFinite(observedAt) || observedAt < now - RECENT_EVENT_RETENTION_MS) continue
    const forecastHour = Number(fields[dateIndex + 1])
    const latitude = parseAtcfLatitude(fields[dateIndex + 4])
    const longitude = parseAtcfLongitude(fields[dateIndex + 5])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    const windKt = Number(fields[dateIndex + 6])
    const pressureHpa = Number(fields[dateIndex + 7])
    const stormType = fields[dateIndex + 8]
    const stormName = fields[dateIndex + 9] || `${fields[0] || ''}${fields[1] || ''}`.trim()
    const id = `${source.id}-${fields[0] || ''}${fields[1] || ''}`.toUpperCase()
    if (!storms.has(id)) {
      storms.set(id, {
        id,
        name: /^\d{2}[A-Z]$/i.test(stormName) ? `🌀 Invest ${stormName.toUpperCase()}` : `🌀 ${stormName}`,
        category: categoryForStormType(stormType),
        ...(Number.isFinite(windKt) ? { maxWindKmh: Math.round(windKt * KNOTS_TO_KMH) } : {}),
        ...(Number.isFinite(pressureHpa) ? { centralPressureHpa: Math.round(pressureHpa) } : {}),
        status: statusForStormType(stormType),
        basin: source.basin || fields[0] || 'Global Oceans',
        coordinates: [],
        forecastTrack: [],
        locationType: 'Point',
        source: source.id,
        sources: [source.id],
        stormType,
        validFrom: validTime,
        validUntil: validTime,
        lastUpdated: validTime,
      })
    }
    const storm = storms.get(id)
    storm.validFrom = storm.validFrom && storm.validFrom < validTime ? storm.validFrom : validTime
    storm.validUntil = storm.validUntil && storm.validUntil > validTime ? storm.validUntil : validTime
    if (!Number.isFinite(forecastHour) || forecastHour === 0) {
      storm.currentPosition = [latitude, longitude]
      storm.coordinates.push([latitude, longitude])
      if (Number.isFinite(windKt)) {
        const gust = Math.round(windKt * KNOTS_TO_KMH)
        if (!storm.maxWindKmh || gust > storm.maxWindKmh) storm.maxWindKmh = gust
      }
      if (Number.isFinite(pressureHpa)) storm.centralPressureHpa = Math.round(pressureHpa)
    } else {
      storm.forecastTrack.push([latitude, longitude, forecastHour])
    }
  }
  return [...storms.values()]
    .filter((storm) => storm.currentPosition || storm.forecastTrack.length)
    .map((storm) => ({
      ...storm,
      coordinates: (storm.coordinates.length ? storm.coordinates : [storm.currentPosition]).slice(-12),
      forecastTrack: storm.forecastTrack.sort((a, b) => a[2] - b[2]).slice(0, 20),
    }))
}

// NHC publishes a small JSON summary of currently active Atlantic/E Pacific systems.
export function parseNhcCurrent(payload, now = Date.now()) {
  const storms = Array.isArray(payload?.activeStorms)
    ? payload.activeStorms
    : Array.isArray(payload?.features)
      ? payload.features
        .filter((feature) => Boolean(feature.properties?.classification))
        .map((feature) => ({
          id: feature.id || feature.properties?.id,
          name: feature.properties?.name,
          classification: feature.properties?.classification,
          latitude: feature.geometry?.coordinates?.[1],
          longitude: feature.geometry?.coordinates?.[0],
          lastUpdate: feature.properties?.lastUpdate,
        }))
      : []
  return storms.map((storm, index) => {
    const latitude = Number(storm.latitude ?? storm.lat)
    const longitude = Number(storm.longitude ?? storm.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    const name = String(storm.name || ` Invest ${index + 1}`).trim()
    const classification = String(storm.classification || 'DB').trim().toUpperCase()
    return {
      id: `nhc-${storm.id || index}`,
      name: /^\d{2}[A-Z]$/i.test(name) ? `🌀 Invest ${name}` : `🌀 ${name}`,
      category: categoryForStormType(classification),
      status: statusForStormType(classification),
      basin: storm.basin || 'Atlantic / East Pacific',
      coordinates: [[latitude, longitude]],
      forecastTrack: Array.isArray(storm.forecastTrack) ? storm.forecastTrack : [],
      locationType: 'Point',
      source: 'NHC',
      sources: ['NHC'],
      stormType: classification,
      validFrom: storm.lastUpdate || null,
      validUntil: storm.lastUpdate || null,
      lastUpdated: storm.lastUpdate || null,
    }
  }).filter(Boolean)
}

function normalizeName(name) {
  return String(name || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function distanceBetween(first, second) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDifference = toRadians(second.latitude - first.latitude)
  const longitudeDifference = toRadians(second.longitude - first.longitude)
  const raw = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) * Math.cos(toRadians(second.latitude)) *
    Math.sin(longitudeDifference / 2) ** 2
  const haversine = Math.min(1, Math.max(0, raw))
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function firstCoordinate(track) {
  const coordinate = track.coordinates?.[0] || track.forecastTrack?.[0]
  return coordinate ? { latitude: coordinate[0], longitude: coordinate[1] } : null
}

function preferredStatus(first, second) {
  return STATUS_ORDER[first.status] <= STATUS_ORDER[second.status] ? first.status : second.status
}

export function mergeStormTracks(tracks) {
  const merged = []
  for (const track of tracks) {
    const position = firstCoordinate(track)
    const matchingIndex = merged.findIndex((existing) => {
      if (normalizeName(existing.name) && normalizeName(existing.name) === normalizeName(track.name)) return true
      const existingPosition = firstCoordinate(existing)
      return Boolean(position && existingPosition && distanceBetween(position, existingPosition) <= DEDUP_DISTANCE_KM)
    })
    if (matchingIndex < 0) {
      merged.push({ ...track, sources: track.sources || [track.source] })
      continue
    }
    const existing = merged[matchingIndex]
    const hasForecast = Boolean(track.forecastTrack?.length)
    const keepForecast = hasForecast || !existing.forecastTrack?.length
    merged[matchingIndex] = {
      ...existing,
      ...(keepForecast ? {
        coordinates: hasForecast ? track.coordinates : existing.coordinates,
        forecastTrack: track.forecastTrack || existing.forecastTrack,
      } : {}),
      status: preferredStatus(existing, track),
      category: (hasForecast ? track.category : existing.category) || existing.category,
      maxWindKmh: Math.max(existing.maxWindKmh || 0, track.maxWindKmh || 0) || undefined,
      centralPressureHpa: track.centralPressureHpa || existing.centralPressureHpa,
      stormType: (hasForecast ? track.stormType : existing.stormType) || existing.stormType,
      reportUrl: existing.reportUrl || track.reportUrl || null,
      sources: [...new Set([...(existing.sources || []), ...(track.sources || [track.source])])],
      lastUpdated: track.lastUpdated && existing.lastUpdated && track.lastUpdated > existing.lastUpdated
        ? track.lastUpdated
        : existing.lastUpdated || track.lastUpdated,
    }
  }
  return merged.map((track) => ({
    ...track,
    source: track.sources.join(' + '),
    sourceList: track.sources,
  }))
}

function fetchWithTimeout(fetchImpl, url, accept) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return Promise.resolve(fetchImpl(url, {
    signal: controller.signal,
    headers: { Accept: accept },
  })).finally(() => clearTimeout(timeout))
}

export function createCycloneFeed({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map()
  const inFlight = new Map()

  async function load(scope) {
    const requests = await Promise.allSettled([
      fetchWithTimeout(fetchImpl, GDACS_CYCLONE_URL, 'application/json'),
      ...ATCF_SOURCES.map((source) => fetchWithTimeout(fetchImpl, source.url, 'text/plain')),
      fetchWithTimeout(fetchImpl, NHC_CURRENT_URL, 'application/json'),
    ])
    const currentTime = now()
    const tracks = []
    const sources = []
    const [gdacsResult, ...providerResults] = requests

    if (gdacsResult.status === 'fulfilled' && gdacsResult.value.ok) {
      try {
        const data = await gdacsResult.value.json()
        const features = Array.isArray(data?.features) ? data.features : []
        tracks.push(...features
          .map((feature, index) => {
            const status = getEventStatus(feature, currentTime)
            return status ? mapCycloneFeature(feature, index, status) : null
          })
          .filter(Boolean))
        sources.push('GDACS')
      } catch { /* provider payload was not usable */ }
    }

    const nhcResult = providerResults[ATCF_SOURCES.length]
    if (nhcResult?.status === 'fulfilled' && nhcResult.value.ok) {
      try {
        const payload = await nhcResult.value.json()
        const parsed = parseNhcCurrent(payload, currentTime)
        if (payload && typeof payload === 'object') sources.push('NHC')
        tracks.push(...parsed)
      } catch { /* provider payload was not usable */ }
    }

    // Read ATCF text bodies and merge any usable storms.
    await Promise.all(providerResults.slice(0, ATCF_SOURCES.length).map(async (result, index) => {
      if (result.status !== 'fulfilled' || !result.value.ok) return
      try {
        const text = await result.value.text()
        const parsed = parseAtcfText(text, ATCF_SOURCES[index], currentTime)
        if (typeof text === 'string' && !sources.includes(ATCF_SOURCES[index].id)) sources.push(ATCF_SOURCES[index].id)
        tracks.push(...parsed)
      } catch { /* provider payload was not usable */ }
    }))

    if (!sources.length) {
      const unavailable = {
        available: false,
        live: false,
        status: 'unavailable',
        scope,
        source: 'none',
        fetchedAt: null,
        tracks: [],
        count: 0,
        error: 'Live cyclone feed is unavailable',
      }
      cache.set(scope, { response: unavailable, cachedAt: currentTime })
      return unavailable
    }

    const merged = mergeStormTracks(tracks)
    const scoped = scope === 'india'
      ? merged.filter((track) => isIndiaTrackCoordinates(track.coordinates) ||
          isIndiaTrackCoordinates(track.forecastTrack))
      : merged
    const sorted = scoped.sort((first, second) => {
      const statusDifference = (STATUS_ORDER[first.status] ?? 9) - (STATUS_ORDER[second.status] ?? 9)
      if (statusDifference !== 0) return statusDifference
      return (second.maxWindKmh || 0) - (first.maxWindKmh || 0)
    }).slice(0, scope === 'india' ? 10 : 20)
    const activeCount = sorted.filter((track) => STATUS_ORDER[track.status] === 0).length
    const formingCount = sorted.filter((track) => STATUS_ORDER[track.status] === 1).length
    const upcomingCount = sorted.filter((track) => STATUS_ORDER[track.status] === 2).length
    const recentCount = sorted.filter((track) => STATUS_ORDER[track.status] === 3).length
    const response = {
      available: true,
      live: activeCount > 0,
      status: activeCount > 0
        ? 'active_events'
        : formingCount > 0
          ? 'forming_systems'
          : upcomingCount > 0
            ? 'upcoming_events'
            : recentCount > 0
              ? 'recent_events'
              : 'no_current_events',
      scope,
      source: sources.join(' + '),
      sources,
      fetchedAt: new Date(currentTime).toISOString(),
      tracks: sorted,
      count: sorted.length,
      activeCount,
      formingCount,
      upcomingCount,
      recentCount,
    }
    cache.set(scope, { response, cachedAt: currentTime })
    return response
  }

  return {
    getCurrentEvents({ scope = 'global' } = {}) {
      const selectedScope = scope === 'india' ? 'india' : 'global'
      const currentTime = now()
      const cached = cache.get(selectedScope)
      if (cached) {
        const duration = cached.response.available ? CACHE_DURATION_MS : FAILURE_RETRY_MS
        if (currentTime - cached.cachedAt < duration) return Promise.resolve(cached.response)
      }
      if (!inFlight.has(selectedScope)) {
        inFlight.set(selectedScope, load(selectedScope).finally(() => inFlight.delete(selectedScope)))
      }
      return inFlight.get(selectedScope)
    },
  }
}

const cycloneFeed = createCycloneFeed()

export default cycloneFeed
