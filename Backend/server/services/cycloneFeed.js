const GDACS_CYCLONE_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC'
const CACHE_DURATION_MS = 5 * 60 * 1000
const FAILURE_RETRY_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 5000
const INDIA_CYCLONE_BOUNDS = { minLat: -5, maxLat: 35, minLon: 55, maxLon: 105 }

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

function isCurrentIndiaRegionEvent(feature, now) {
  const properties = feature?.properties || {}
  const startsAt = Date.parse(properties.fromdate || properties.fromDate || '')
  const endsAt = Date.parse(properties.todate || properties.toDate || '')
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt < now ||
    startsAt > now + 7 * 24 * 60 * 60 * 1000
  ) {
    return false
  }
  const coordinates = getCoordinates(feature)
  const country = String(properties.country || '').toLowerCase()
  return (
    country.includes('india') ||
    coordinates.some(([longitude, latitude]) => (
      Number.isFinite(Number(latitude)) &&
      Number.isFinite(Number(longitude)) &&
      Number(latitude) >= INDIA_CYCLONE_BOUNDS.minLat &&
      Number(latitude) <= INDIA_CYCLONE_BOUNDS.maxLat &&
      Number(longitude) >= INDIA_CYCLONE_BOUNDS.minLon &&
      Number(longitude) <= INDIA_CYCLONE_BOUNDS.maxLon
    ))
  )
}

function mapCycloneFeature(feature, index) {
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
    status: 'ACTIVE_LIVE_GDACS',
    basin: properties.country || 'Global Oceans',
    coordinates,
    source: 'GDACS',
    validFrom: properties.fromdate || null,
    validUntil: properties.todate || null,
  }
}

export function createCycloneFeed({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cachedResponse = null
  let cachedAt = 0
  let inFlightRequest = null

  async function load() {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetchImpl(GDACS_CYCLONE_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`GDACS returned HTTP ${response.status}`)
      const data = await response.json()
      const features = Array.isArray(data?.features) ? data.features : []
      const tracks = features
        .filter((feature) => isCurrentIndiaRegionEvent(feature, now()))
        .map(mapCycloneFeature)
        .filter(Boolean)
        .slice(0, 10)
      const fetchedAt = new Date(now()).toISOString()
      cachedResponse = {
        available: true,
        live: tracks.length > 0,
        status: tracks.length > 0 ? 'active_events' : 'no_current_events',
        source: 'GDACS',
        fetchedAt,
        tracks,
        count: tracks.length,
      }
      cachedAt = now()
      return cachedResponse
    } catch {
      cachedResponse = {
        available: false,
        live: false,
        status: 'unavailable',
        source: 'GDACS',
        fetchedAt: null,
        tracks: [],
        count: 0,
        error: 'Live cyclone feed is unavailable',
      }
      cachedAt = now()
      return cachedResponse
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    getCurrentEvents() {
      const currentTime = now()
      const cacheDuration = cachedResponse?.available ? CACHE_DURATION_MS : FAILURE_RETRY_MS
      if (cachedResponse && currentTime - cachedAt < cacheDuration) {
        return Promise.resolve(cachedResponse)
      }
      if (!inFlightRequest) {
        inFlightRequest = load().finally(() => {
          inFlightRequest = null
        })
      }
      return inFlightRequest
    },
  }
}

const cycloneFeed = createCycloneFeed()

export default cycloneFeed
