import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const WINDY_VIEWER_URL = '/GeoSentinel/windy.html'
const WINDY_MAP_KEY = import.meta.env.VITE_WINDY_MAP_FORECAST_KEY

function formatNumber(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}${suffix}` : 'Unavailable'
}

export default function WindyMap() {
  const [selected, setSelected] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [storms, setStorms] = useState([])
  const [error, setError] = useState('')
  const viewerUrl = `${WINDY_VIEWER_URL}?key=${encodeURIComponent(WINDY_MAP_KEY)}`

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'windy-picker') return
      const { lat, lon, values, overlay } = event.data
      setSelected({ lat, lon, values, overlay })
      setForecast(null)
      setError('')
      try {
        const [forecastResponse, stormsResponse] = await Promise.all([
          fetch(`${API_URL}/weather/forecast?lat=${lat}&lon=${lon}`),
          fetch(`${API_URL}/weather/storms`),
        ])
        const forecastData = await forecastResponse.json()
        const stormsData = await stormsResponse.json()
        setForecast(forecastResponse.ok ? forecastData : { available: false, error: forecastData.error })
        setStorms(stormsData.tracks || [])
      } catch (requestError) {
        setError(requestError.message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const iframe = document.querySelector('.windy-map')
        iframe?.contentWindow?.postMessage({ type: 'open-windy-picker', lat: coords.latitude, lon: coords.longitude }, window.location.origin)
      },
      () => setError('Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const matchingStorms = selected
    ? storms.filter((storm) => storm.coordinates?.some(([lat, lon]) => Math.abs(lat - selected.lat) < 5 && Math.abs(lon - selected.lon) < 5))
    : []

  return (
    <div className="windy-map-shell">
      <iframe className="windy-map" title="Interactive Windy weather forecast map" src={viewerUrl} allow="geolocation" />
      <div className="windy-map-status" role="status">Windy forecast · click anywhere for local weather</div>
      <button className="windy-location-button" type="button" onClick={useCurrentLocation}>Use my current location</button>
      <div className="windy-map-help">
        <strong>Need help?</strong>
        <span>Use the red Help button to report an emergency.</span>
      </div>
      <aside className="windy-forecast-card" aria-live="polite">
        {!selected && <p>Click the map or use your location to see temperature, precipitation, and forecast.</p>}
        {selected && (
          <>
            <strong>Selected location</strong>
            <span>{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</span>
            <span>Windy {selected.overlay || 'weather'} values: {selected.values.length ? selected.values.map((value) => formatNumber(value)).join(' · ') : 'Picker opened; loading values'}</span>
            <span>Forecast: {forecast?.available ? 'available' : forecast?.error || 'loading / optional OpenWeather unavailable'}</span>
            {forecast?.days?.map((day) => (
              <div className="forecast-day" key={day.date}>
                <strong>{day.date}</strong>
                <span>{formatNumber(day.minTemperature, '°')}–{formatNumber(day.maxTemperature, '°')}</span>
                <span>{formatNumber(day.precipitation, ' mm')} · {day.condition}</span>
              </div>
            ))}
            <span className={matchingStorms.length ? 'storm-warning' : ''}>
              Cyclone/storm tracks nearby: {matchingStorms.length ? matchingStorms.map((storm) => storm.name).join(', ') : 'none configured'}
            </span>
            {error && <span className="form-error">{error}</span>}
          </>
        )}
      </aside>
    </div>
  )
}
