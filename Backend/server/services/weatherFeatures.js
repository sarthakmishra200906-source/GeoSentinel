const FEATURE_NAMES = [
  'MonsoonIntensity',
  'TopographyDrainage',
  'RiverManagement',
  'Deforestation',
  'Urbanization',
  'ClimateChange',
  'DamsQuality',
  'Siltation',
  'AgriculturalPractices',
  'Encroachments',
  'IneffectiveDisasterPreparedness',
  'DrainageSystems',
  'CoastalVulnerability',
  'Landslides',
  'Watersheds',
  'DeterioratingInfrastructure',
  'PopulationScore',
  'WetlandLoss',
  'InadequatePlanning',
  'PoliticalFactors',
]

const clamp = (value, minimum = 0, maximum = 16) => Math.max(minimum, Math.min(maximum, value))

export function weatherToFeatures(weather) {
  const rain = Number(weather.rainfall1h || 0)
  const humidity = Number(weather.humidity || 0)
  const pressure = Number(weather.pressure || 1013)
  const cloudCover = Number(weather.cloudCover || 0)
  const wind = Number(weather.windSpeed || 0)

  return [
    ['MonsoonIntensity', clamp(rain * 0.8)],
    ['TopographyDrainage', clamp(16 - cloudCover * 0.08)],
    ['RiverManagement', clamp(8 + rain * 0.2)],
    ['Deforestation', 8],
    ['Urbanization', 8],
    ['ClimateChange', clamp(8 + (humidity - 50) * 0.04)],
    ['DamsQuality', 8],
    ['Siltation', clamp(rain * 0.25)],
    ['AgriculturalPractices', 8],
    ['Encroachments', 8],
    ['IneffectiveDisasterPreparedness', 8],
    ['DrainageSystems', clamp(16 - rain * 0.4)],
    ['CoastalVulnerability', 8],
    ['Landslides', clamp(rain * 0.15 + wind * 0.03)],
    ['Watersheds', clamp(rain * 0.3)],
    ['DeterioratingInfrastructure', 8],
    ['PopulationScore', 8],
    ['WetlandLoss', 8],
    ['InadequatePlanning', 8],
    ['PoliticalFactors', clamp(8 + (1013 - pressure) * 0.02)],
  ].reduce((features, [name, value]) => {
    features[name] = Number(value.toFixed(3))
    return features
  }, {})
}

export { FEATURE_NAMES }
