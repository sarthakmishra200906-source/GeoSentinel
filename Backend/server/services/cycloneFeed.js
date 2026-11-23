const GDACS_CYCLONE_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC'
const CACHE_DURATION_MS = 5 * 60 * 1000
const FAILURE_RETRY_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 5000
const RECENT_EVENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const INDIA_CYCLONE_BOUNDS = { minLat: -5, maxLat: 35, minLon: 55, maxLon: 105 }

function parseProviderDate(value) {
  if (!value) return Number.NaN
  const date = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)
  return Date.parse(hasTimezone ? date : `${date}Z`)
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
  const isIndiaRegion = (
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
  if (!isIndiaRegion) return null
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
    reportUrl: properties.url?.report || null,
    validFrom: properties.fromdate || null,
    validUntil: properties.todate || null,
    lastUpdated: properties.datemodified || null,
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
      const currentTime = now()
      const tracks = features
        .map((feature, index) => {
          const status = getEventStatus(feature, currentTime)
          return status ? mapCycloneFeature(feature, index, status) : null
        })
        .filter(Boolean)
        .sort((first, second) => {
          const statusOrder = {
            ACTIVE_LIVE_GDACS: 0,
            UPCOMING_GDACS: 1,
            RECENT_GDACS: 2,
          }
          const statusDifference = statusOrder[first.status] - statusOrder[second.status]
          if (statusDifference !== 0) return statusDifference
          return parseProviderDate(second.validUntil) - parseProviderDate(first.validUntil)
        })
        .slice(0, 10)
      const activeCount = tracks.filter((track) => track.status === 'ACTIVE_LIVE_GDACS').length
      const upcomingCount = tracks.filter((track) => track.status === 'UPCOMING_GDACS').length
      const recentCount = tracks.filter((track) => track.status === 'RECENT_GDACS').length
      const fetchedAt = new Date(now()).toISOString()
      cachedResponse = {
        available: true,
        live: activeCount > 0,
        status: activeCount > 0
          ? 'active_events'
          : upcomingCount > 0
            ? 'upcoming_events'
            : recentCount > 0
              ? 'recent_events'
              : 'no_current_events',
        source: 'GDACS',
        fetchedAt,
        tracks,
        count: tracks.length,
        activeCount,
        upcomingCount,
        recentCount,
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
