import React, { Component } from 'react'
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
  Marker,
  Popup,
  Circle,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import WindyMap from './WindyMap'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const streetMapUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const createCityWeatherIcon = (point) => {
  const rain = Number(point.rainfall1h || 0)
  const temp = Math.round(point.temperature || 0)
  const cond = String(point.condition || '').toLowerCase()
  const isRain = rain > 0 || cond.includes('rain')
  const isCloudy = cond.includes('cloud') || cond.includes('overcast')
  const emoji = isRain ? '🌧️' : isCloudy ? '⛅' : '☀️'
  const color = isRain ? '#0284c7' : temp >= 35 ? '#ef4444' : temp <= 16 ? '#06b6d4' : '#10b981'

  return L.divIcon({
    className: 'city-weather-icon',
    html: `
      <div class="city-weather-badge" style="--badge-color: ${color}">
        <span class="city-badge-name">${point.name}</span>
        <span class="city-badge-data">${emoji} ${temp}°C</span>
      </div>
    `,
    iconSize: [86, 36],
    iconAnchor: [43, 18],
  })
}

const userPointerIcon = L.divIcon({
  className: 'user-location-icon',
  html: '<span aria-hidden="true"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function getRiskTierClass(tier) {
  const normalized = String(tier || '').toUpperCase()
  if (normalized.includes('CRITICAL') || normalized.includes('HIGH')) return 'critical'
  if (normalized.includes('MODERATE')) return 'moderate'
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

export default class MapComponent extends Component {
  mapInstance = null

  state = {
    mapProvider: 'windy', // Windy is the default primary map
    weatherPoints: [],
    weatherLoading: false,
    userLocation: null,
    selectedLocation: null,
    weather: null,
    forecast: null,
    prediction: null,
    loading: false,
    cardOpen: false,
  }

  componentDidMount() {
    this.loadCityWeather()
  }

  loadCityWeather = async () => {
    try {
      this.setState({ weatherLoading: true })
      const res = await fetch(`${API_URL}/weather/points`)
      if (res.ok) {
        const data = await res.json()
        this.setState({ weatherPoints: data.points || [] })
      }
    } catch (err) {
      console.warn('Unable to load city weather:', err)
    } finally {
      this.setState({ weatherLoading: false })
    }
  }

  fetchRiskAndWeather = async (latitude, longitude) => {
    this.setState({
      selectedLocation: { latitude, longitude },
      cardOpen: true,
      loading: true,
      weather: null,
      forecast: null,
      prediction: null,
    })

    try {
      const [locationRes, forecastRes, predRes] = await Promise.allSettled([
        fetch(`${API_URL}/weather/location?lat=${latitude}&lon=${longitude}`),
        fetch(`${API_URL}/weather/forecast?lat=${latitude}&lon=${longitude}`),
        fetch(`${API_URL}/prediction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude, longitude }),
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

      if (!locData && pData?.weather) {
        locData = pData.weather
      }

      this.setState({
        weather: locData,
        forecast: fData,
        prediction: pData,
        loading: false,
      })
    } catch (error) {
      console.error('Fetch error:', error)
      this.setState({ loading: false })
    }
  }

  handleUserLocated = (lat, lon) => {
    this.setState({ userLocation: { latitude: lat, longitude: lon } })
    if (this.mapInstance) {
      this.mapInstance.flyTo([lat, lon], Math.max(this.mapInstance.getZoom(), 12))
    }
    this.fetchRiskAndWeather(lat, lon)
  }

  locateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.handleUserLocated(coords.latitude, coords.longitude)
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Unable to retrieve your location. Please check browser permissions.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  render() {
    const {
      mapProvider,
      weatherPoints,
      userLocation,
      selectedLocation,
      weather,
      forecast,
      prediction,
      loading,
      cardOpen,
    } = this.state

    // If Windy map is selected, render WindyMap component
    if (mapProvider === 'windy') {
      return (
        <div className="map-background">
          <WindyMap onSwitchToMap={() => this.setState({ mapProvider: 'street' })} />
        </div>
      )
    }

    // Standard Clean Street Map (OpenStreetMap) with City Weather Hubs
    const defaultPosition = [20.5937, 78.9629]

    return (
      <div className="map-background">
        {/* ── Street Map Top Controls Bar ── */}
        <div className="top-controls-bar" role="toolbar" aria-label="Street map controls">
          {/* Status badge */}
          <div className="btn-control-toggle" style={{ cursor: 'default' }}>
            🏙️ Cities Weather ({weatherPoints.length})
          </div>

          {/* My Location button */}
          <button
            type="button"
            className="btn-location"
            onClick={this.locateMe}
            title="Locate my position"
          >
            📍 My Location
          </button>

          {/* Switch to Windy Map */}
          <button
            type="button"
            className="btn-switch-map"
            onClick={() => this.setState({ mapProvider: 'windy' })}
            title="Switch to Windy Weather Map"
          >
            🌀 Windy Map
          </button>
        </div>

        {/* ── Floating General Weather & AI Analysis Card ── */}
        {cardOpen && selectedLocation && (
          <aside className="map-data-card" aria-live="polite">
            <div className="map-data-card-header">
              <strong>📌 {selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°</strong>
              <button
                type="button"
                className="map-data-card-close"
                onClick={() => this.setState({ cardOpen: false })}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {loading && <p className="card-status-text">Fetching live weather telemetry & AI risk model…</p>}

            {/* Weather Hero Header */}
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

            {/* Complete General Weather Grid */}
            {!loading && weather && (
              <div className="card-data-section">
                <span className="card-section-title">📊 Live Atmospheric Telemetry</span>
                <div className="card-data-grid-full">
                  <div className="weather-metric-tile">
                    <span className="metric-label">💨 Wind</span>
                    <span className="metric-val">{fmt(weather.windSpeed, ' km/h')}</span>
                    {weather.windDirection !== null && weather.windDirection !== undefined && (
                      <small className="metric-sub">
                        {weather.windDirection}° {getCompassDirection(weather.windDirection)}
                      </small>
                    )}
                  </div>

                  <div className="weather-metric-tile">
                    <span className="metric-label">⏱️ Pressure</span>
                    <span className="metric-val">{weather.pressure ? `${weather.pressure} hPa` : '—'}</span>
                    <small className="metric-sub">
                      {weather.pressure && weather.pressure < 1005 ? 'Low (Storm risk)' : 'Standard'}
                    </small>
                  </div>

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

                  <div className="weather-metric-tile">
                    <span className="metric-label">💧 Humidity</span>
                    <span className="metric-val">{weather.humidity !== undefined ? `${weather.humidity}%` : '—'}</span>
                    <small className="metric-sub">
                      {weather.humidity > 70 ? 'High' : weather.humidity < 40 ? 'Dry' : 'Normal'}
                    </small>
                  </div>

                  <div className="weather-metric-tile">
                    <span className="metric-label">☁️ Clouds</span>
                    <span className="metric-val">{weather.cloudCover !== undefined ? `${weather.cloudCover}%` : '—'}</span>
                    <small className="metric-sub">{weather.cloudCover > 60 ? 'Overcast' : 'Scattered'}</small>
                  </div>

                  <div className="weather-metric-tile">
                    <span className="metric-label">👁️ Visibility</span>
                    <span className="metric-val">{weather.visibility ? `${weather.visibility} km` : '10 km'}</span>
                    <small className="metric-sub">Clear sight</small>
                  </div>
                </div>
              </div>
            )}

            {/* AI Risk Assessment on current data */}
            {!loading && prediction && (
              <div className="card-data-section ai-analysis-section">
                <span className="card-section-title">🤖 AI Risk Assessment</span>
                <div className="ai-risk-row">
                  <span className={`risk-tag ${getRiskTierClass(prediction.riskTier || prediction.risk_tier)}`}>
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

            {/* 5-Day Daily Forecast List (if available) */}
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
              <p className="card-status-text error">Telemetry unavailable for this location.</p>
            )}
          </aside>
        )}

        {/* ── Standard Leaflet Street Map Container ── */}
        <MapContainer
          center={defaultPosition}
          zoom={5}
          minZoom={2}
          zoomSnap={0.5}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Base Layer: OpenStreetMap Street Map */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={streetMapUrl}
            maxZoom={19}
          />

          {/* Map instance capture */}
          <MapInstanceCapture onMapReady={(map) => { this.mapInstance = map }} />

          {/* General Weather Data Around Cities */}
          {weatherPoints.map((point) => (
            <Marker
              key={point.name}
              position={[point.latitude, point.longitude]}
              icon={createCityWeatherIcon(point)}
            >
              <Popup>
                <div style={{ minWidth: '190px', fontFamily: 'system-ui, sans-serif' }}>
                  <strong style={{ fontSize: '15px', color: '#0f172a' }}>📍 {point.name}</strong>
                  <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: '1.6', color: '#334155' }}>
                    <div><b>Condition:</b> {point.condition || 'Clear'}</div>
                    <div><b>Temperature:</b> {point.temperature}°C {point.feelsLike ? `(Feels ${point.feelsLike}°C)` : ''}</div>
                    <div><b>Rainfall:</b> {point.rainfall1h || 0} mm/h</div>
                    <div><b>Humidity:</b> {point.humidity || '—'}%</div>
                    <div><b>Wind:</b> {point.windSpeed || 0} km/h {point.windGust ? `(Gust ${point.windGust})` : ''}</div>
                  </div>
                  <button
                    type="button"
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      padding: '6px 10px',
                      background: '#0284c7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => this.fetchRiskAndWeather(point.latitude, point.longitude)}
                  >
                    🤖 Run AI Flood Risk Assessment
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* User Location Pulse Marker */}
          {userLocation && (
            <>
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={3000}
                pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.25, weight: 2 }}
              />
              <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userPointerIcon}>
                <Popup>
                  <strong>📍 Your Location</strong>
                  <br />
                  {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                </Popup>
              </Marker>
            </>
          )}

          {/* Marker at clicked location */}
          {selectedLocation && (
            <>
              <Circle
                center={[selectedLocation.latitude, selectedLocation.longitude]}
                radius={15000}
                pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.18, weight: 2, dashArray: '6 6' }}
              />
              <Marker position={[selectedLocation.latitude, selectedLocation.longitude]} icon={userPointerIcon}>
                <Popup>
                  <strong>Selected Point</strong>
                  <br />
                  {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                </Popup>
              </Marker>
            </>
          )}

          <InteractiveMapClickHandler onSelect={this.fetchRiskAndWeather} />
          <ZoomControl position="bottomright" />
        </MapContainer>
      </div>
    )
  }
}

function MapInstanceCapture({ onMapReady }) {
  const map = useMap()
  React.useEffect(() => {
    onMapReady(map)
  }, [map, onMapReady])
  return null
}

function InteractiveMapClickHandler({ onSelect }) {
  const map = useMapEvents({
    click(event) {
      map.flyTo([event.latlng.lat, event.latlng.lng], Math.max(map.getZoom(), 8))
      if (typeof onSelect === 'function') {
        onSelect(event.latlng.lat, event.latlng.lng)
      }
    },
  })
  return null
}
