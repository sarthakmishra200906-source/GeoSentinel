import React, { Component } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import WeatherLayerControl from './WeatherLayerControl'
import WindyMap from './WindyMap'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const streetMapUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const satelliteMapUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function getWeatherLevel(point) {
  const rain = Number(point.rainfall1h || 0)
  const wind = Number(point.windSpeed || 0)
  const temperature = Number(point.temperature || 0)
  if (rain >= 15 || wind >= 60) return { label: 'Severe', color: '#dc2626' }
  if (rain >= 5 || wind >= 35 || temperature >= 38) return { label: 'High', color: '#f97316' }
  if (rain > 0 || wind >= 20 || temperature >= 32) return { label: 'Moderate', color: '#eab308' }
  return { label: 'Normal', color: '#16a34a' }
}

function getTemperatureColor(temperature) {
  if (temperature >= 40) return '#b91c1c'
  if (temperature >= 35) return '#ef4444'
  if (temperature >= 30) return '#f97316'
  if (temperature >= 24) return '#eab308'
  if (temperature >= 16) return '#22c55e'
  if (temperature >= 8) return '#06b6d4'
  return '#2563eb'
}

function getRainColor(rainfall) {
  if (rainfall >= 15) return '#7f1d1d'
  if (rainfall >= 8) return '#dc2626'
  if (rainfall >= 3) return '#f59e0b'
  if (rainfall > 0) return '#38bdf8'
  return '#94a3b8'
}

function getWindColor(windSpeed) {
  if (windSpeed >= 60) return '#7c3aed'
  if (windSpeed >= 40) return '#ef4444'
  if (windSpeed >= 20) return '#f59e0b'
  return '#22c55e'
}

function getPointColor(point, activeLayers) {
  if (activeLayers.rain) return getRainColor(Number(point.rainfall1h || 0))
  if (activeLayers.wind) return getWindColor(Number(point.windSpeed || 0))
  return getTemperatureColor(Number(point.temperature || 0))
}

const createWeatherIcon = (point, activeLayers) =>
  L.divIcon({
    className: 'weather-stamp-icon',
    html: (() => {
      const level = getWeatherLevel(point)
      return `<div class="weather-stamp" style="--weather-color:${getPointColor(point, activeLayers)}"><i></i><strong>${point.temperature}°C</strong><span>${point.name}</span><small>${level.label} · ${point.condition}</small></div>`
    })(),
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  })

const rescueCenterIcon = L.divIcon({
  className: 'rescue-center-icon',
  html: '<div class="rescue-center-pin" aria-label="Rescue center">+</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export default class MapComponent extends Component {
  state = {
    activeLayers: { temperature: false, rain: false, wind: false, clouds: false, storms: false },
    satellite: true,
    weatherPoints: [],
    stormTracks: [],
    weatherUpdatedAt: null,
    weatherAvailable: false,
    rescueCenters: [],
    rescueQuery: '',
  }

  componentDidMount() {
    if (import.meta.env.VITE_WINDY_MAP_FORECAST_KEY) return
    this.loadWeather()
  }

  loadWeather = async () => {
    try {
      const [pointsResponse, stormsResponse, centersResponse] = await Promise.all([
        fetch(`${API_URL}/weather/points`),
        fetch(`${API_URL}/weather/storms`),
        fetch(`${API_URL}/rescue-centers`),
      ])
      if (!pointsResponse.ok || !stormsResponse.ok || !centersResponse.ok) throw new Error('Map data request failed')
      const points = await pointsResponse.json()
      const storms = await stormsResponse.json()
      const centers = await centersResponse.json()
      this.setState({
        weatherPoints: points.points || [],
        stormTracks: storms.tracks || [],
        weatherUpdatedAt: points.updatedAt || null,
        weatherAvailable: points.available === true,
        rescueCenters: Array.isArray(centers) ? centers : [],
      })
    } catch (error) {
      console.error('Unable to load weather data', error)
    }
  }

  toggleLayer = (layer) => {
    this.setState((state) => ({
      activeLayers: { ...state.activeLayers, [layer]: !state.activeLayers[layer] },
    }))
  }

  toggleSatellite = () => {
    this.setState((state) => ({ satellite: !state.satellite }))
  }

  render() {
    // Windy is the primary map provider. Leaflet remains a local fallback when
    // the browser key is not configured.
    if (import.meta.env.VITE_WINDY_MAP_FORECAST_KEY) return <WindyMap />

    const position = [20.5937, 78.9629];
    const { activeLayers, satellite, weatherPoints, stormTracks, weatherUpdatedAt, weatherAvailable, rescueCenters, rescueQuery } = this.state
    const visibleCenters = rescueCenters.filter((center) =>
      `${center.name} ${center.address}`.toLowerCase().includes(rescueQuery.toLowerCase()),
    )
    return (
      <div className="map-background">
        <WeatherLayerControl
          activeLayers={activeLayers}
          onToggle={this.toggleLayer}
          satellite={satellite}
          onToggleSatellite={this.toggleSatellite}
        />
        {activeLayers.temperature && <div className="weather-animation weather-animation-heat" aria-hidden="true" />}
        <div className="weather-status" role="status">
          {weatherAvailable ? `Live weather · ${weatherUpdatedAt ? new Date(weatherUpdatedAt).toLocaleTimeString() : 'updated'}` : 'Live weather unavailable'}
        </div>
        <div className="weather-legend" aria-label="Weather color legend">
          {activeLayers.rain ? (
            <>
              <strong>Precipitation / 1h</strong>
              <span><i style={{ background: '#94a3b8' }} /> 0 mm</span>
              <span><i style={{ background: '#38bdf8' }} /> Light</span>
              <span><i style={{ background: '#f59e0b' }} /> Moderate</span>
              <span><i style={{ background: '#7f1d1d' }} /> Severe</span>
            </>
          ) : activeLayers.wind ? (
            <>
              <strong>Wind</strong>
              <span><i style={{ background: '#22c55e' }} /> &lt;20</span>
              <span><i style={{ background: '#f59e0b' }} /> 20–40</span>
              <span><i style={{ background: '#ef4444' }} /> 40–60</span>
              <span><i style={{ background: '#7c3aed' }} /> 60+ km/h</span>
            </>
          ) : (
            <>
              <strong>Temperature</strong>
              <span><i style={{ background: '#2563eb' }} /> &lt;8°C</span>
              <span><i style={{ background: '#22c55e' }} /> 16–24°C</span>
              <span><i style={{ background: '#f97316' }} /> 30–35°C</span>
              <span><i style={{ background: '#b91c1c' }} /> 40°C+</span>
            </>
          )}
        </div>
        <label className="rescue-search">
          <span>Find a rescue center</span>
          <input
            type="search"
            value={rescueQuery}
            onChange={(event) => this.setState({ rescueQuery: event.target.value })}
            placeholder="Search name or address"
          />
        </label>
        <MapContainer
          center={position}
          zoom={5}
          minZoom={4}
          zoomSnap={0.5}
          maxBounds={[[-85, -540], [85, 540]]}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            key={satellite ? 'satellite' : 'street'}
            attribution={
              satellite
                ? 'Tiles &copy; Esri'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
            url={satellite ? satelliteMapUrl : streetMapUrl}
          />
          {activeLayers.temperature && (
            <TileLayer opacity={0.55} url={`${API_URL}/weather/tiles/temp_new/{z}/{x}/{y}.png`} />
          )}
          {activeLayers.rain && (
            <TileLayer opacity={0.6} url={`${API_URL}/weather/tiles/precipitation_new/{z}/{x}/{y}.png`} />
          )}
          {activeLayers.wind && (
            <TileLayer opacity={0.6} url={`${API_URL}/weather/tiles/wind_new/{z}/{x}/{y}.png`} />
          )}
          {activeLayers.clouds && (
            <TileLayer opacity={0.45} url={`${API_URL}/weather/tiles/clouds_new/{z}/{x}/{y}.png`} />
          )}
          {weatherPoints.map((point) => (
            <React.Fragment key={point.name}>
            <Circle
              center={[point.latitude, point.longitude]}
              radius={45000}
              pathOptions={{
                color: getPointColor(point, activeLayers),
                fillColor: getPointColor(point, activeLayers),
                fillOpacity: 0.13,
                weight: 2,
              }}
            />
            <Marker position={[point.latitude, point.longitude]} icon={createWeatherIcon(point, activeLayers)}>
              <Popup>
                <strong>{point.name} · {getWeatherLevel(point).label}</strong>
                <br />
                Coordinates: {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                <br />
                Temperature: {point.temperature}°C (feels {point.feelsLike}°C)
                <br />
                Rain (1h): {point.rainfall1h} mm · Clouds: {point.cloudCover}%
                <br />
                Rain (3h): {point.rainfall3h} mm · Range: {point.tempMin}–{point.tempMax}°C
                <br />
                Humidity: {point.humidity}% · Pressure: {point.pressure} hPa
                <br />
                💨 {point.windSpeed} km/h · gust {point.windGust} km/h · direction {point.windDirection ?? 'N/A'}°
                <br />
                Visibility: {point.visibility ? `${(point.visibility / 1000).toFixed(1)} km` : 'N/A'}
                <br />
                Condition: {point.condition}
                <br />
                Observed: {point.observedAt ? new Date(point.observedAt).toLocaleString() : 'N/A'}
              </Popup>
            </Marker>
            </React.Fragment>
          ))}
          {visibleCenters.map((center) => (
            <Marker
              key={center._id}
              position={[center.location.coordinates[1], center.location.coordinates[0]]}
              icon={rescueCenterIcon}
            >
              <Popup>
                <strong>{center.name}</strong>
                <br />
                {center.address}
                <br />
                Status: {center.status} · Occupancy: {center.occupancy}/{center.capacity}
                <br />
                Accessibility: {center.accessibility ? 'Available' : 'Not listed'}
                <br />
                Water: {center.waterAvailable ? 'Available' : 'Not listed'} · Medical: {center.medicalAvailable ? 'Available' : 'Not listed'}
                <br />
                Contact: {center.contact || 'Not listed'}
                <br />
                Last verified: {center.lastVerifiedAt ? new Date(center.lastVerifiedAt).toLocaleString() : 'Not listed'}
                <br />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${center.location.coordinates[1]},${center.location.coordinates[0]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get directions
                </a>
              </Popup>
            </Marker>
          ))}
          {activeLayers.storms &&
            stormTracks.map((track) => (
              <Polyline key={track.id} positions={track.coordinates} color="#f97316" weight={4}>
                <Popup>{track.name}</Popup>
              </Polyline>
            ))}
          <LocateControl />
          <UserLocationMarker />
          <MapLocationPicker />
          <ZoomControl position="bottomright" />
        </MapContainer>
      </div>
    );
  }

}

function MapLocationPicker() {
    const [selected, setSelected] = React.useState(null)
    useMapEvents({
      async click(event) {
        setSelected({ latitude: event.latlng.lat, longitude: event.latlng.lng, loading: true })
        try {
          const response = await fetch(`${API_URL}/prediction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
          })
          if (!response.ok) throw new Error('Weather is unavailable for this location')
          const result = await response.json()
          setSelected({ ...result.weather, prediction: result, loading: false })
        } catch (error) {
          setSelected({ latitude: event.latlng.lat, longitude: event.latlng.lng, loading: false, error: error.message })
        }
      },
    })

    if (!selected) return null
    return (
      <>
        <Circle
          center={[selected.latitude, selected.longitude]}
          radius={25000}
          pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.16, weight: 2, dashArray: '6 6' }}
        />
        <Marker position={[selected.latitude, selected.longitude]}>
          <Popup>
            <strong>Selected location</strong>
            <br />
            Coordinates: {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
            {selected.loading && <><br />Loading exact weather…</>}
            {selected.error && <><br />{selected.error}</>}
            {!selected.loading && !selected.error && (
              <>
                <br />
                Temperature: {selected.temperature}°C (feels {selected.feelsLike}°C)
                <br />
                Precipitation: {selected.rainfall1h} mm/h · Clouds: {selected.cloudCover}%
                <br />
                Wind: {selected.windSpeed} km/h · direction {selected.windDirection ?? 'N/A'}°
                <br />
                <strong>Flood risk: {selected.prediction.riskTier || selected.prediction.risk_tier}</strong>
                <br />
                Status: {selected.prediction.status} · Probability: {selected.prediction.probability ?? 'Unavailable'}
                <br />
                Model: {selected.prediction.modelVersion || selected.prediction.model_version}
              </>
            )}
          </Popup>
        </Marker>
      </>
    )
}

const userLocationIcon = L.divIcon({
  className: 'user-location-icon',
  html: '<span aria-hidden="true"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function UserLocationMarker() {
  const [location, setLocation] = React.useState(null)
  React.useEffect(() => {
    if (!navigator.geolocation) return undefined
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
  if (!location) return null
  return (
    <>
      <Circle
        center={[location.latitude, location.longitude]}
        radius={location.accuracy}
        pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.18, weight: 1 }}
      />
      <Marker position={[location.latitude, location.longitude]} icon={userLocationIcon}>
        <Popup>Your current location<br />Accuracy: ±{Math.round(location.accuracy)} m</Popup>
      </Marker>
    </>
  )
}

function LocateControl() {
  const map = useMap();

  const locate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.flyTo([coords.latitude, coords.longitude], Math.max(map.getZoom(), 12))
    })
  }

  return (
    <button className="map-locate-button" type="button" onClick={locate} aria-label="Show my current location">
      ◎
    </button>
  )
}