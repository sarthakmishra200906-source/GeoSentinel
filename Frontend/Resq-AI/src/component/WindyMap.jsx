import { useEffect, useRef, useState, useCallback } from 'react'

import { API_URL } from '../api'
const BASE_URL = import.meta.env.BASE_URL || '/'
const WINDY_VIEWER_URL = `${BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`}windy.html`
// Bump once per app load so the iframe never serves a stale cached viewer
// (e.g. an older rain implementation) after a local edit or deployment.
const WINDY_VIEWER_VERSION = Date.now()
const WINDY_MAP_KEY = import.meta.env.VITE_WINDY_MAP_FORECAST_KEY
const WINDY_POINT_KEY = import.meta.env.VITE_WINDY_POINT_FORECAST_KEY

function isConfiguredKey(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/^(?:replace-with|your-)/i.test(value.trim())
}

function getRiskClass(tier) {
  const t = String(tier || '').toUpperCase()
  if (t.includes('CRITICAL') || t.includes('HIGH')) return 'critical'
  if (t.includes('MODERATE')) return 'moderate'
  return 'low'
}

function fmt(v, suffix = '') {
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}${suffix}` : '—'
}

function getCompassDirection(deg) {
  if (deg === null || deg === undefined) return ''
  const val = Math.floor(deg / 22.5 + 0.5)
  const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return arr[val % 16]
}

function getWeatherIcon(condition, isRain) {
  if (isRain) return '🌧️'
  const c = String(condition || '').toLowerCase()
  if (c.includes('thunder') || c.includes('storm')) return '⛈️'
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️'
  if (c.includes('snow')) return '❄️'
  if (c.includes('cloud') || c.includes('overcast')) return '⛅'
  if (c.includes('fog') || c.includes('mist')) return '🌫️'
  return '☀️'
}

export default function WindyMap({ onSwitchToMap, sharedLocation, onLocationChange }) {
  const iframeRef = useRef(null)
  const [tap, setTap] = useState(sharedLocation ? { lat: sharedLocation.latitude, lon: sharedLocation.longitude, values: [] } : null)
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [windyPointForecast, setWindyPointForecast] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeOverlay, setActiveOverlay] = useState('wind')
  const [showCyclones, setShowCyclones] = useState(true)
  const [stormScope, setStormScope] = useState('global')
  const [storms, setStorms] = useState([])
  const [stormFeed, setStormFeed] = useState({ available: false, status: 'loading', fetchedAt: null, error: null })
  const [analysisStormId, setAnalysisStormId] = useState('')
  const [stormFeedLoading, setStormFeedLoading] = useState(false)
  const [userLocation, setUserLocation] = useState(sharedLocation ? { lat: sharedLocation.latitude, lon: sharedLocation.longitude, accuracy: sharedLocation.accuracy } : null)
  const [cardOpen, setCardOpen] = useState(Boolean(sharedLocation))
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)

  const hasWindyMapKey = isConfiguredKey(WINDY_MAP_KEY)
  const viewerUrl = `${WINDY_VIEWER_URL}?key=${encodeURIComponent(hasWindyMapKey ? WINDY_MAP_KEY.trim() : '')}&v=${WINDY_VIEWER_VERSION}`

  // ── Send postMessage to Windy iframe helper ────────────────────────────────
  const postToIframe = useCallback((payload) => {
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(payload, '*')
    }
  }, [])

  // ── Fetch global or India-region tropical systems ────────────────────────
  const fetchStorms = useCallback(async (showLoading = false) => {
    if (showLoading) setStormFeedLoading(true)
    try {
      const res = await fetch(`${API_URL}/weather/storms?scope=${stormScope}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to load cyclone data')
      if (data.available === true) {
        setStorms(Array.isArray(data.tracks) ? data.tracks : [])
      } else {
        setStorms([])
      }
      setStormFeed({
        available: data.available === true,
        status: data.status || 'unavailable',
        fetchedAt: data.fetchedAt || null,
        scope: data.scope || stormScope,
        source: data.source || '',
        error: data.available === true ? null : data.error || 'Live cyclone feed is unavailable',
      })
    } catch (error) {
      console.warn('Unable to load cyclone data:', error)
      setStormFeed({
        available: false,
        status: 'unavailable',
        fetchedAt: null,
        scope: stormScope,
        source: '',
        error: error.message || 'Live cyclone feed is unavailable',
      })
    } finally {
      if (showLoading) setStormFeedLoading(false)
    }
  }, [stormScope])

  // ── Change Windy forecast overlay (wind / rain / temp) ─────────────────────
  const setLayer = (overlay) => {
    setActiveOverlay(overlay)
    postToIframe({ type: 'change-windy-overlay', overlay })
  }

  // ── Toggle Cyclones on Windy map ───────────────────────────────────────────
  const toggleCyclones = () => {
    const next = !showCyclones
    setShowCyclones(next)
    postToIframe({ type: 'update-cyclones', storms, enabled: next })
  }

  // ── Focus map onto specific cyclone eye ────────────────────────────────────
  const focusOnStorm = (storm) => {
    if (!storm || !storm.coordinates || !storm.coordinates[0]) return
    const eye = storm.coordinates[storm.coordinates.length - 1]
    setAnalysisStormId(storm.id)
    postToIframe({
      type: 'focus-cyclone',
      id: storm.id,
      coordinates: eye,
    })
    fetchData(eye[0], eye[1])
  }

  // ── Fetch complete weather, point forecast & AI risk for selected point ───
  const fetchData = useCallback(async (lat, lon, label = '') => {
    setLoading(true)
    setWeather(null)
    setForecast(null)
    setWindyPointForecast(null)
    setPrediction(null)
    setCardOpen(true)
    if (onLocationChange) {
      onLocationChange({ latitude: lat, longitude: lon, label })
    }
    try {
      const requests = [
        fetch(`${API_URL}/weather/location?lat=${lat}&lon=${lon}`),
        fetch(`${API_URL}/weather/forecast?lat=${lat}&lon=${lon}`),
        fetch(`${API_URL}/prediction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon }),
        }),
      ]

      if (isConfiguredKey(WINDY_POINT_KEY)) {
        requests.push(
          fetch('https://api.windy.com/api/point-forecast/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: Number(lat.toFixed(4)),
              lon: Number(lon.toFixed(4)),
              model: 'gfs',
              parameters: ['temp', 'wind', 'precip', 'pressure', 'rh'],
              levels: ['surface'],
              key: WINDY_POINT_KEY.trim(),
            }),
          }),
        )
      }

      const [locationRes, forecastRes, predRes, windyPointRes] = await Promise.allSettled(requests)

      let locData = null
      let fData = null
      let pData = null
      let wpData = null

      if (locationRes.status === 'fulfilled' && locationRes.value.ok) {
        locData = await locationRes.value.json()
      }
      if (forecastRes.status === 'fulfilled' && forecastRes.value.ok) {
        fData = await forecastRes.value.json()
      }
      if (predRes.status === 'fulfilled' && predRes.value.ok) {
        pData = await predRes.value.json()
      }
      if (windyPointRes && windyPointRes.status === 'fulfilled' && windyPointRes.value.ok) {
        const rawWp = await windyPointRes.value.json()
        const tsList = Array.isArray(rawWp.ts) ? rawWp.ts : []
        const temps = rawWp['temp-surface'] || []
        const uWind = rawWp['wind_u-surface'] || []
        const vWind = rawWp['wind_v-surface'] || []
        const precip = rawWp['past3hprecip-surface'] || []
        const pressure = rawWp['pressure-surface'] || []
        wpData = tsList.slice(0, 6).map((ts, idx) => {
          const tempC = Number.isFinite(temps[idx]) ? temps[idx] - 273.15 : null
          const windKmh = Number.isFinite(uWind[idx]) && Number.isFinite(vWind[idx])
            ? Math.hypot(uWind[idx], vWind[idx]) * 3.6
            : null
          const pressureHpa = Number.isFinite(pressure[idx]) ? pressure[idx] / 100 : null
          const rainMm = Number.isFinite(precip[idx]) ? precip[idx] * 1000 : 0
          return {
            time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            tempC,
            windKmh,
            pressureHpa,
            rainMm,
          }
        })
      }

      // If location endpoint didn't succeed, check prediction's embedded weather
      if (!locData && pData?.weather) {
        locData = pData.weather
      }

      setWeather(locData)
      setForecast(fData)
      setWindyPointForecast(wpData)
      setPrediction(pData)
    } finally {
      setLoading(false)
    }
  }, [onLocationChange])

  // ── On mount, load storms & radar url ──────────────────────────────────────
  useEffect(() => {
    fetchStorms()
    const intervalId = window.setInterval(fetchStorms, 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [fetchStorms])

  useEffect(() => {
    postToIframe({ type: 'update-cyclones', storms, enabled: showCyclones })
  }, [postToIframe, showCyclones, storms])

  // ── Listen for Windy iframe events ─────────────────────────────────────────
  useEffect(() => {
    const handler = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'windy-ready') {
        // Sync current state to newly initialized Windy instance
        if (activeOverlay) {
          postToIframe({ type: 'change-windy-overlay', overlay: activeOverlay })
        }
        if (storms.length > 0) {
          postToIframe({ type: 'update-cyclones', storms, enabled: showCyclones })
        }
      } else if (data.type === 'windy-overlay-changed') {
        const raw = data.overlay
        const normalized = raw === 'rainAccu' ? 'rain' : raw
        setActiveOverlay(normalized)
      } else if (data.type === 'windy-picker') {
        const { lat, lon, values } = data
        setTap({ lat, lon, values: values || [] })
        fetchData(lat, lon)
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [activeOverlay, storms, showCyclones, postToIframe, fetchData])

  const analysisStorm = storms.find((storm) => storm.id === analysisStormId) || storms[0]
  const analysisCoordinate = analysisStorm?.coordinates?.[analysisStorm.coordinates.length - 1]
  const stormBadge = (status) => {
    const badges = {
      ACTIVE_LIVE_GDACS: { label: 'ACTIVE · GDACS', className: 'active' },
      ACTIVE_ATCF: { label: 'ACTIVE · ATCF', className: 'active' },
      FORMING_DEPRESSION: { label: 'FORMING DEPRESSION', className: 'forming' },
      FORMING_INVEST: { label: 'FORMING · INVEST', className: 'forming' },
      UPCOMING_GDACS: { label: 'UPCOMING', className: 'upcoming' },
      RECENT_GDACS: { label: 'RECENT · ENDED', className: 'recent' },
    }
    return badges[status] || { label: 'STATUS UNCONFIRMED', className: 'unconfirmed' }
  }
  const formatStormDate = (value) => {
    const date = value ? new Date(value) : null
    return date && Number.isFinite(date.getTime())
      ? date.toLocaleString()
      : 'Not reported'
  }

  // ── Search City / Place ───────────────────────────────────────────────────
  const searchPlace = async (event) => {
    event.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setSearchError('')
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
      )
      const data = await res.json()
      const hit = data?.results?.[0]
      if (!hit) {
        setSearchError(`Location "${q}" not found.`)
        return
      }
      const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ')
      postToIframe({ type: 'open-windy-picker', lat: hit.latitude, lon: hit.longitude })
      setTap({ lat: hit.latitude, lon: hit.longitude, label, values: [] })
      fetchData(hit.latitude, hit.longitude, label)
    } catch {
      setSearchError('Search unavailable right now.')
    } finally {
      setSearching(false)
    }
  }

  // ── GPS locate ─────────────────────────────────────────────────────────────
  const locateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setSearchError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lon, accuracy } = coords
        postToIframe({ type: 'open-windy-picker', lat, lon })
        setUserLocation({ lat, lon, accuracy })
        setTap({ lat, lon, accuracy, values: [] })
        fetchData(lat, lon)
      },
      () => alert('Could not get your location. Check browser permissions or search your city above.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  return (
    <div className="ws-shell">
      {/* Full-screen Windy iframe */}
      <iframe
        ref={iframeRef}
        className="windy-iframe"
        title="Windy weather map"
        src={viewerUrl}
        allow="geolocation"
      />

      {/* ── Top controls bar: Weather overlays, cyclones and location ──────── */}
      <div className="top-controls-bar" role="toolbar" aria-label="Windy controls">
        {/* Detail Layer toggles: Wind, Rain, Heat/Temp */}
        <div className="windy-layer-group" role="group" aria-label="Weather forecast layers">
          {[
            { key: 'wind', label: '💨 Wind' },
            { key: 'rain', label: '🌧️ Rain', title: 'Switch to continuous NASA IMERG rain field' },
            { key: 'temp', label: '🌡️ Heat' },
          ].map(({ key, label, title }) => (
            <button
              key={key}
              type="button"
              className={`windy-layer-btn${activeOverlay === key ? ' active' : ''}`}
              onClick={() => setLayer(key)}
              title={title || `Switch Windy overlay to ${label}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Active Cyclones Worldwide toggle */}
        <button
          type="button"
          className={`btn-control-toggle${showCyclones ? ' active' : ''}`}
          onClick={toggleCyclones}
          title="Toggle active tropical cyclones and typhoons worldwide"
        >
          🌀 Cyclones ({storms.length})
        </button>
        {/* Cyclone Quick-Focus selector */}
        {storms.length > 0 && showCyclones && (
          <select
            className="cyclone-select-dropdown"
            aria-label="Jump to Cyclone"
            defaultValue=""
            onChange={(e) => {
              const selected = storms.find((s) => s.id === e.target.value)
              if (selected) focusOnStorm(selected)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              🌀 Jump to Cyclone…
            </option>
            {storms.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.replace(/^🌀\s*/, '')} ({s.basin ? s.basin.split('/')[0].trim() : 'Active'})
              </option>
            ))}
          </select>
        )}

        {/* Cyclone scope: worldwide forming systems or India region */}
        <div className="cyclone-scope-group" role="group" aria-label="Cyclone map scope">
          <button
            type="button"
            className={stormScope === 'global' ? 'active' : ''}
            onClick={() => setStormScope('global')}
            title="Show tropical systems worldwide"
          >
            🌏 Global
          </button>
          <button
            type="button"
            className={stormScope === 'india' ? 'active' : ''}
            onClick={() => setStormScope('india')}
            title="Show only systems near India"
          >
            🇮🇳 India
          </button>
        </div>

        {/* Search Place */}
        <form className="map-place-search" onSubmit={searchPlace}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city or place…"
            aria-label="Search city or place"
          />
          <button type="submit" disabled={searching}>{searching ? '…' : '🔍'}</button>
        </form>

        {/* My Location button */}
        <button className="btn-location" type="button" onClick={locateMe} title="Locate my position">
          📍 My Location
        </button>

        {/* Switch to Clean Street Map */}
        {onSwitchToMap && (
          <button
            type="button"
            className="btn-switch-map"
            onClick={onSwitchToMap}
            title="Switch to Standard Street Map"
          >
            🗺️ Street Map
          </button>
        )}
      </div>

      <section className="cyclone-analysis-panel" aria-labelledby="cyclone-analysis-title" aria-live="polite">
        <div className="cyclone-analysis-heading">
          <div>
            <h2 id="cyclone-analysis-title">🌀 Live cyclone analysis</h2>
            <p>
              GDACS + NOAA NHC + JTWC ATCF feeds · {stormFeed.scope === 'india' ? 'India region' : 'Global'}
              {stormFeed.source ? ` · ${stormFeed.source}` : ''}
              {stormFeed.fetchedAt ? ` · checked ${formatStormDate(stormFeed.fetchedAt)}` : ''}
            </p>
            <p>Reported tracks and provider forecast points are shown; landfall timing and impacts are not guaranteed.</p>
          </div>
          <button type="button" onClick={() => fetchStorms(true)} disabled={stormFeedLoading}>
            {stormFeedLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        {!stormFeed.available ? (
          <p className="cyclone-analysis-status error">
            Feed unavailable. The map cannot confirm whether a cyclone is active.
            {stormFeed.error ? ` ${stormFeed.error}` : ''}
          </p>
        ) : storms.length === 0 ? (
          <p className="cyclone-analysis-status">
            No active or recent tropical systems are currently listed for {stormScope === 'india' ? 'the India region' : 'the global feed'}.
          </p>
        ) : (
          <>
            <p className="cyclone-analysis-status">
              {stormFeed.status === 'recent_events'
                ? 'No active systems are listed; recent ended events remain visible for 14 days.'
                : `${storms.filter((storm) => stormBadge(storm.status).className === 'active').length} active · ${storms.filter((storm) => stormBadge(storm.status).className === 'forming').length} forming · ${storms.filter((storm) => stormBadge(storm.status).className === 'upcoming').length} upcoming · ${storms.filter((storm) => stormBadge(storm.status).className === 'recent').length} recent`}
            </p>
            <div className="cyclone-analysis-list">
              {storms.map((storm) => (
                <button
                  type="button"
                  className={`cyclone-analysis-event${analysisStorm?.id === storm.id ? ' selected' : ''}`}
                  key={storm.id}
                  onClick={() => focusOnStorm(storm)}
                >
                  <span className="cyclone-analysis-event-title">
                    <strong>{storm.name.replace(/^🌀\s*/, '')}</strong>
                    <span className={`cyclone-event-status ${stormBadge(storm.status).className}`}>
                      {stormBadge(storm.status).label}
                    </span>
                  </span>
                  <span>{storm.category} · {storm.maxWindKmh ? `${storm.maxWindKmh} km/h max wind` : 'wind not reported'}{storm.source ? ` · ${storm.source}` : ''}</span>
                  <span>{storm.validFrom ? formatStormDate(storm.validFrom) : 'Start date not reported'} – {storm.validUntil ? formatStormDate(storm.validUntil) : 'End date not reported'}{storm.forecastTrack?.length ? ` · ${storm.forecastTrack.length} forecast points` : ''}</span>
                </button>
              ))}
            </div>
            {analysisStorm && (
              <div className="cyclone-analysis-detail">
                <strong>
                  {analysisStorm.status === 'RECENT_GDACS' ? 'Last reported position' : 'Reported eye position'}
                  {analysisCoordinate ? ` · ${analysisCoordinate[0].toFixed(2)}°, ${analysisCoordinate[1].toFixed(2)}°` : ''}
                </strong>
                <span>
                  {analysisStorm.forecastTrack?.length
                    ? `${analysisStorm.forecastTrack.length} provider forecast points are drawn as an orange cone on the map.`
                    : analysisStorm.locationType === 'LineString'
                      ? `Provider-reported track · ${analysisStorm.coordinates.length} positions; no centerline forecast was supplied.`
                      : 'A point position only; no centerline forecast was supplied by the provider.'}
                </span>
                <span>Provider(s): {analysisStorm.source || analysisStorm.sources?.join(' + ') || 'unknown'} · Last update: {formatStormDate(analysisStorm.lastUpdated)}</span>
                {analysisStorm.reportUrl && (
                  <a href={analysisStorm.reportUrl} target="_blank" rel="noreferrer">
                    Open GDACS event report
                  </a>
                )}
                <button type="button" onClick={() => focusOnStorm(analysisStorm)}>
                  Inspect position and local telemetry
                </button>
                {analysisStorm.id === analysisStormId && (weather || prediction) && (
                  <div className="cyclone-analysis-telemetry">
                    <span>
                      Local weather: {weather
                        ? `${fmt(weather.temperature, '°C')} · ${weather.condition || 'conditions unavailable'} · ${fmt(weather.rainfall1h, ' mm/h rain')}`
                        : 'Unavailable'}
                    </span>
                    <span>
                      Current flood-risk proxy: {prediction
                        ? `${String(prediction.riskTier || prediction.risk_tier || 'UNAVAILABLE').toUpperCase()} · ${fmt(Number(prediction.probability) * 100, '%')}`
                        : 'Unavailable'}
                    </span>
                    <small>Landfall location and cyclone impacts are not forecast here. This is current local telemetry and a flood-risk proxy, not a cyclone-impact forecast or measured damage report.</small>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* User Location Badge */}
      {userLocation && (
        <div className="location-pin-badge">
          📍 {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
        </div>
      )}

      {/* ── Floating General Weather & AI Analysis Card (appears when tapped) ── */}
      {cardOpen && tap && (
        <aside className="map-data-card" aria-live="polite">
          <div className="map-data-card-header">
            <div>
              <strong>📌 {tap.label || `${tap.lat.toFixed(4)}°, ${tap.lon.toFixed(4)}°`}</strong>
              {tap.accuracy && (
                <small style={{ display: 'block', fontSize: '11px', color: tap.accuracy > 3000 ? '#b45309' : '#64748b' }}>
                  GPS accuracy: ±{tap.accuracy > 1000 ? `${(tap.accuracy / 1000).toFixed(1)} km (approx. IP location — use Search for exact city)` : `${Math.round(tap.accuracy)} m`}
                </small>
              )}
            </div>
            <button
              type="button"
              className="map-data-card-close"
              onClick={() => setCardOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {searchError && <p className="card-status-text error">{searchError}</p>}

          {loading && <p className="card-status-text">Fetching live weather telemetry & AI risk model…</p>}

          {/* ── Weather App Hero Summary Section ── */}
          {!loading && weather && (
            <div className="card-weather-hero">
              <div className="card-hero-main">
                <span className="card-hero-icon">
                  {getWeatherIcon(weather.condition, Number(weather.rainfall1h || 0) > 0)}
                </span>
                <div>
                  <div className="card-hero-temp">
                    {fmt(weather.temperature, '°C')}
                  </div>
                  <div className="card-hero-cond">
                    {weather.condition || 'Clear Sky'}
                  </div>
                </div>
              </div>
              <div className="card-hero-sub">
                {weather.feelsLike && (
                  <span>Feels like <b>{fmt(weather.feelsLike, '°C')}</b></span>
                )}
                {weather.provider && (
                  <small className="card-provider-pill">{weather.provider}</small>
                )}
              </div>
            </div>
          )}

          {/* ── Complete General Weather Grid (as in General Weather Apps) ── */}
          {!loading && weather && (
            <div className="card-data-section">
              <span className="card-section-title">📊 Live Atmospheric Telemetry</span>
              <div className="card-data-grid-full">
                {/* Wind */}
                <div className="weather-metric-tile">
                  <span className="metric-label">💨 Wind</span>
                  <span className="metric-val">{fmt(weather.windSpeed, ' km/h')}</span>
                  {weather.windDirection !== null && weather.windDirection !== undefined && (
                    <small className="metric-sub">
                      {weather.windDirection}° {getCompassDirection(weather.windDirection)}
                    </small>
                  )}
                </div>

                {/* Pressure */}
                <div className="weather-metric-tile">
                  <span className="metric-label">⏱️ Pressure</span>
                  <span className="metric-val">
                    {weather.pressure ? `${weather.pressure} hPa` : '—'}
                  </span>
                  <small className="metric-sub">
                    {weather.pressure && weather.pressure < 1005 ? 'Low (Storm risk)' : 'Standard'}
                  </small>
                </div>

                {/* Rain / Precipitation */}
                <div className="weather-metric-tile">
                  <span className="metric-label">🌧️ Rain (1h)</span>
                  <span className="metric-val">{fmt(weather.rainfall1h, ' mm/h')}</span>
                  <small className="metric-sub">
                    {Number(weather.rainfall1h || 0) >= 10
                      ? 'Heavy Rain'
                      : Number(weather.rainfall1h || 0) > 0
                        ? 'Moderate Rain'
                        : 'No Rain'}
                  </small>
                </div>

                {/* Humidity */}
                <div className="weather-metric-tile">
                  <span className="metric-label">💧 Humidity</span>
                  <span className="metric-val">
                    {weather.humidity !== undefined ? `${weather.humidity}%` : '—'}
                  </span>
                  <small className="metric-sub">
                    {weather.humidity > 70 ? 'High' : weather.humidity < 40 ? 'Dry' : 'Normal'}
                  </small>
                </div>

                {/* Cloud Cover */}
                <div className="weather-metric-tile">
                  <span className="metric-label">☁️ Clouds</span>
                  <span className="metric-val">
                    {weather.cloudCover !== undefined ? `${weather.cloudCover}%` : '—'}
                  </span>
                  <small className="metric-sub">
                    {weather.cloudCover > 60 ? 'Overcast' : 'Scattered'}
                  </small>
                </div>

                {/* Visibility */}
                <div className="weather-metric-tile">
                  <span className="metric-label">👁️ Visibility</span>
                  <span className="metric-val">
                    {weather.visibility ? `${weather.visibility} km` : '10 km'}
                  </span>
                  <small className="metric-sub">Clear sight</small>
                </div>

                {/* Wind Gusts if present */}
                {weather.windGust ? (
                  <div className="weather-metric-tile">
                    <span className="metric-label">💨 Gusts</span>
                    <span className="metric-val">{fmt(weather.windGust, ' km/h')}</span>
                    <small className="metric-sub">Peak gusts</small>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* ── AI Flood Risk Assessment ── */}
          {!loading && prediction && (
            <div className="card-data-section ai-analysis-section">
              <span className="card-section-title">🤖 AI Risk Assessment</span>
              <div className="ai-risk-row">
                <span className={`risk-tag ${getRiskClass(prediction.riskTier || prediction.risk_tier)}`}>
                  {(prediction.riskTier || prediction.risk_tier || 'LOW').toUpperCase()} RISK
                </span>
                <span className="ai-score-text">
                  Risk Score: {Number(prediction.probability || 0).toFixed(2)}
                </span>
              </div>
              {prediction.modelVersion && (
                <small className="ai-model-info">
                  Model: {prediction.modelVersion} (Terrain & Hydrology AI)
                </small>
              )}
            </div>
          )}

          {/* ── Windy Point Forecast (when VITE_WINDY_POINT_FORECAST_KEY is configured) ── */}
          {!loading && windyPointForecast && windyPointForecast.length > 0 && (
            <div className="card-data-section">
              <span className="card-section-title">🌬️ Windy Point Forecast (GFS Hourly)</span>
              <div className="forecast-daily-list">
                {windyPointForecast.map((slot) => (
                  <div key={slot.time} className="forecast-day-row">
                    <span className="forecast-date">{slot.time}</span>
                    <span className="forecast-cond">💨 {fmt(slot.windKmh, ' km/h')}</span>
                    <span className="forecast-temps">{fmt(slot.tempC, '°C')}</span>
                    {slot.rainMm > 0 && <span className="forecast-rain">🌧️ {slot.rainMm.toFixed(1)} mm</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 5-Day Daily Forecast List (if available) ── */}
          {!loading && forecast && forecast.days && forecast.days.length > 0 && (
            <div className="card-data-section">
              <span className="card-section-title">📅 5-Day Point Forecast ({forecast.provider || 'Forecast'})</span>
              <div className="forecast-daily-list">
                {forecast.days.map((day) => (
                  <div key={day.date} className="forecast-day-row">
                    <span className="forecast-date">{day.date.slice(5)}</span>
                    <span className="forecast-cond">{day.condition || 'Forecast'}</span>
                    <span className="forecast-temps">
                      {Math.round(day.minTemperature)}°–{Math.round(day.maxTemperature)}°
                    </span>
                    {Number(day.precipitation || 0) > 0 && (
                      <span className="forecast-rain">🌧️ {Number(day.precipitation).toFixed(1)} mm</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !weather && !prediction && (
            <p className="card-status-text error">Telemetry unavailable for this coordinate.</p>
          )}
        </aside>
      )}
    </div>
  )
}
