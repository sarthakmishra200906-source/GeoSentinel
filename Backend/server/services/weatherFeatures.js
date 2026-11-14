const FEATURE_NAMES = [
  'precipitation_sum',
  'rain_72h',
  'wind_speed_10m_max',
  'surface_pressure_mean',
  'river_discharge',
]

export function weatherToFeatures(weather) {
  return {
    precipitation_sum: Number(weather.precipitationSum ?? weather.rainfall1h ?? 0),
    rain_72h: Number(weather.rain72h ?? weather.rainAmountMm ?? 0),
    wind_speed_10m_max: Number(weather.windSpeedMax ?? weather.windSpeed ?? 0),
    surface_pressure_mean: Number(weather.pressure ?? 1013),
    river_discharge: Number(weather.riverDischarge ?? 0),
  }
}

export { FEATURE_NAMES }
