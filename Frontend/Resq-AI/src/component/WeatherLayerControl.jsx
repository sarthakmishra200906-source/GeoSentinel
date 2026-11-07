import React from 'react'

const layerLabels = {
  temperature: 'Temperature',
  rain: 'Rain radar',
  wind: 'Wind',
  clouds: 'Satellite clouds',
  storms: 'Cyclone tracks',
}

export default function WeatherLayerControl({ activeLayers, onToggle }) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  return (
    <aside className={`weather-control ${isExpanded ? 'is-expanded' : ''}`} aria-label="Weather layers">
      <button
        className="weather-control-trigger"
        type="button"
        aria-label="Show weather layers"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span aria-hidden="true">☁️</span>
      </button>
      <div className="weather-control-panel">
        <h2>Weather layers</h2>
        {Object.entries(layerLabels).map(([layer, label]) => (
          <button
            className={`weather-layer-toggle ${activeLayers[layer] ? 'is-active' : ''}`}
            key={layer}
            type="button"
            aria-pressed={activeLayers[layer]}
            onClick={() => onToggle(layer)}
          >
            <span>
              <span className="weather-layer-icon" aria-hidden="true">
                {layer === 'temperature' ? '🌡️' : layer === 'rain' ? '🌧️' : layer === 'wind' ? '💨' : layer === 'clouds' ? '☁️' : '🌀'}
              </span>
              {label}
            </span>
            <span className="weather-layer-state">{activeLayers[layer] ? 'On' : 'Off'}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
