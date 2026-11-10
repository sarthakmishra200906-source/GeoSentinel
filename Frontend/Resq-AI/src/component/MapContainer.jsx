import React, { Component } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import WeatherLayerControl from './WeatherLayerControl'

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

const createWeatherIcon = (point) =>
  L.divIcon({
    className: 'weather-stamp-icon',
    html: (() => {
      const level = getWeatherLevel(point)
      return `<div class="weather-stamp" style="--weather-color:${level.color}"><i></i><strong>${point.temperature}°C</strong><span>${point.name}</span><small>${level.label}</small></div>`
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
  }

  componentDidMount() {
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
    const position = [20.5937, 78.9629];
    const { activeLayers, satellite, weatherPoints, stormTracks, weatherUpdatedAt, weatherAvailable, rescueCenters } = this.state
    return (
      <div className="map-background">
        <WeatherLayerControl
          activeLayers={activeLayers}
          onToggle={this.toggleLayer}
          satellite={satellite}
          onToggleSatellite={this.toggleSatellite}
        />
        {activeLayers.rain && <div className="weather-animation weather-animation-rain" aria-hidden="true" />}
        {activeLayers.temperature && <div className="weather-animation weather-animation-heat" aria-hidden="true" />}
        <div className="weather-status" role="status">
          {weatherAvailable ? `Live weather · ${weatherUpdatedAt ? new Date(weatherUpdatedAt).toLocaleTimeString() : 'updated'}` : 'Live weather unavailable'}
        </div>
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
            <Marker key={point.name} position={[point.latitude, point.longitude]} icon={createWeatherIcon(point)}>
              <Popup>
                <strong>{point.name} · {getWeatherLevel(point).label}</strong>
                <br />
                Coordinates: {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                <br />
                Temperature: {point.temperature}°C (feels {point.feelsLike}°C)
                <br />
                Rain (1h): {point.rainfall1h} mm · Clouds: {point.cloudCover}%
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
          ))}
          {rescueCenters.map((center) => (
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
          <ZoomControl position="bottomright" />
        </MapContainer>
      </div>
    );
  }
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