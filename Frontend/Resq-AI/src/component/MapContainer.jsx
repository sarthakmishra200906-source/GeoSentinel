import React, { Component } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import WeatherLayerControl from './WeatherLayerControl'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const createWeatherIcon = (point) =>
  L.divIcon({
    className: 'weather-stamp-icon',
    html: `<div class="weather-stamp"><strong>${point.temperature}°C</strong><span>${point.name}</span></div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  })

export default class MapComponent extends Component {
  state = {
    activeLayers: { temperature: false, rain: false, wind: false, clouds: false, storms: false },
    weatherPoints: [],
    stormTracks: [],
  }

  componentDidMount() {
    this.loadWeather()
  }

  loadWeather = async () => {
    try {
      const [pointsResponse, stormsResponse] = await Promise.all([
        fetch(`${API_URL}/weather/points`),
        fetch(`${API_URL}/weather/storms`),
      ])
      if (!pointsResponse.ok || !stormsResponse.ok) throw new Error('Weather data request failed')
      const points = await pointsResponse.json()
      const storms = await stormsResponse.json()
      this.setState({ weatherPoints: points.points || [], stormTracks: storms.tracks || [] })
    } catch (error) {
      console.error('Unable to load weather data', error)
    }
  }

  toggleLayer = (layer) => {
    this.setState((state) => ({
      activeLayers: { ...state.activeLayers, [layer]: !state.activeLayers[layer] },
    }))
  }

  render() {
    const position = [20.5937, 78.9629];
    const { activeLayers, weatherPoints, stormTracks } = this.state
    return (
      <div className="map-background">
        <WeatherLayerControl activeLayers={activeLayers} onToggle={this.toggleLayer} />
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                <strong>{point.name}</strong>
                <br />
                {point.temperature}°C · {point.humidity}% humidity
                <br />
                💨 {point.windSpeed} km/h · {point.condition}
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