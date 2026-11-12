import { useEffect, useRef, useState, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const BASE_URL = import.meta.env.BASE_URL || '/'
const WINDY_VIEWER_URL = `${BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`}windy.html`
const WINDY_MAP_KEY = import.meta.env.VITE_WINDY_MAP_FORECAST_KEY

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

export default function WindyMap({ onSwitchToMap }) {
  const iframeRef = useRef(null)
  const [tap, setTap] = useState(null)
  const [weather, setWeather] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeOverlay, setActiveOverlay] = useState('wind')
  const [satellite, setSatellite] = useState(false)
  const [rainRadar, setRainRadar] = useState(false)
  const [showCyclones, setShowCyclones] = useState(true)
  const [storms, setStorms] = useState([])
  const [radarTileUrl, setRadarTileUrl] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [cardOpen, setCardOpen] = useState(false)

  const viewerUrl = `${WINDY_VIEWER_URL}?key=${encodeURIComponent(WINDY_MAP_KEY || '')}`

  // ── Send postMessage to Windy iframe helper ────────────────────────────────
  const postToIframe = useCallback((payload) => {
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(payload, '*')
    }
  }, [])

  // ── Fetch active cyclones worldwide ───────────────────────────────────────
  const fetchStorms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/weather/storms`)
      if (res.ok) {
        const data = await res.json()
        const tracks = data.tracks || []
        setStorms(tracks)
        postToIframe({
          type: 'update-cyclones',
          storms: tracks,
          enabled: showCyclones,
        })
      }
    } catch (err) {
      console.warn('Unable to load cyclone data:', err)
    }
  }, [postToIframe, showCyclones])

  // ── Fetch rain radar tile endpoint (RainViewer Universal Blue) ───────────
  const fetchRadarUrl = useCallback(async () => {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
      if (res.ok) {
        const data = await res.json()
        if (data?.radar?.past?.length > 0) {
          const latest = data.radar.past[data.radar.past.length - 1]
          // Color scheme 2 is Universal Blue (standard weather map pure blue precipitation)
          const url = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`
          setRadarTileUrl(url)
        }
      }
    } catch (_) {
      // Fallback default in windy.html
    }
  }, [])

  // ── Change Windy forecast overlay (wind / rain / temp / clouds) ────────────
  const setLayer = (overlay) => {
    setActiveOverlay(overlay)
    postToIframe({ type: 'change-windy-overlay', overlay, radarTileUrl })
  }

  // ── Toggle Satellite view on Windy map ─────────────────────────────────────
  const toggleSatellite = () => {
    const next = !satellite
    setSatellite(next)
    postToIframe({ type: 'toggle-satellite', enabled: next })
  }

  // ── Toggle Rain Radar (Precipitation Radar tiles) on Windy map ─────────────
  const toggleRadar = () => {
    const next = !rainRadar
    setRainRadar(next)
    postToIframe({ type: 'toggle-radar', enabled: next, tileUrl: radarTileUrl })
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
    const eye = storm.coordinates[0]
    postToIframe({
      type: 'focus-cyclone',
      id: storm.id,
      coordinates: eye,
    })
    fetchData(eye[0], eye[1])
  }

  // ── Fetch complete weather & AI risk for selected point ───────────────────
  const fetchData = async (lat, lon) => {
    setLoading(true)
    setWeather(null)
    setForecast(null)
    setPrediction(null)
    setCardOpen(true)
    try {
      const [locationRes, forecastRes, predRes] = await Promise.allSettled([
        fetch(`${API_URL}/weather/location?lat=${lat}&lon=${lon}`),
        fetch(`${API_URL}/weather/forecast?lat=${lat}&lon=${lon}`),
        fetch(`${API_URL}/prediction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon }),
        }),
      ])

      let locData = null
      let fData = null
      let pData = null

      if (locationRes.status === 'fulfilled' && locationRes.value.ok) {
        locData = await locationRes.value.json()
      }
      if (forecastRes.status === 'fulfilled' && forecastRes.value.ok) {
        fData = await forecastRes.value.json()
      }
      if (predRes.status === 'fulfilled' && predRes.value.ok) {
        pData = await predRes.value.json()
      }

      // If location endpoint didn't succeed, check prediction's embedded weather
      if (!locData && pData?.weather) {
        locData = pData.weather
      }

      setWeather(locData)
      setForecast(fData)
      setPrediction(pData)
    } finally {
      setLoading(false)
    }
  }

  // ── On mount, load storms & radar url ──────────────────────────────────────
  useEffect(() => {
    fetchStorms()
    fetchRadarUrl()
  }, [fetchStorms, fetchRadarUrl])

  // ── Listen for Windy iframe events ─────────────────────────────────────────
  useEffect(() => {
    const handler = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'windy-ready') {
        // Sync current state to newly initialized Windy instance
        if (activeOverlay) {
          postToIframe({ type: 'change-windy-overlay', overlay: activeOverlay, radarTileUrl })
        }
        if (satellite) {
          postToIframe({ type: 'toggle-satellite', enabled: true })
        }
        if (rainRadar) {
          postToIframe({ type: 'toggle-radar', enabled: true, tileUrl: radarTileUrl })
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
  }, [activeOverlay, satellite, rainRadar, storms, showCyclones, radarTileUrl, postToIframe])

  // ── GPS locate ─────────────────────────────────────────────────────────────
  const locateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lon } = coords
        postToIframe({ type: 'open-windy-picker', lat, lon })
        setUserLocation({ lat, lon })
        setTap({ lat, lon, values: [] })
        fetchData(lat, lon)
      },
      () => alert('Could not get your location. Please check browser permissions.'),
      { enableHighAccuracy: true, timeout: 10000 },
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

      {/* ── Top controls bar: Overlays, Satellite, Rain, Cyclones, Location ── */}
      <div className="top-controls-bar" role="toolbar" aria-label="Windy controls">
        {/* Detail Layer toggles: Wind, Rain, Heat/Temp */}
        <div className="windy-layer-group" role="group" aria-label="Weather forecast layers">
          {[
            { key: 'wind', label: '💨 Wind' },
            { key: 'rain', label: '🌧️ Rain' },
            { key: 'temp', label: '🌡️ Heat' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`windy-layer-btn${activeOverlay === key ? ' active' : ''}`}
              onClick={() => setLayer(key)}
              title={`Switch Windy overlay to ${label}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Satellite Imagery toggle */}
        <button
          type="button"
          className={`btn-control-toggle${satellite ? ' active' : ''}`}
          onClick={toggleSatellite}
          title="Toggle high-resolution satellite imagery on Windy"
        >
          {satellite ? '🛰️ Satellite On' : '🛰️ Satellite'}
        </button>

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
            <strong>📌 {tap.lat.toFixed(4)}°, {tap.lon.toFixed(4)}°</strong>
            <button
              type="button"
              className="map-data-card-close"
              onClick={() => setCardOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

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

          {/* ── 5-Day Daily Forecast List (if available) ── */}
          {!loading && forecast && forecast.days && forecast.days.length > 0 && (
            <div className="card-data-section">
              <span className="card-section-title">📅 5-Day Forecast</span>
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
