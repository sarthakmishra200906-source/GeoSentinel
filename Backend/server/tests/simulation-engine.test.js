import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSimulationParameters } from '../services/simulationValidation.js'
import {
  calculateSimulationStep,
  coneRadiusForHour,
  isIndianLand,
  projectForwardTrack,
  windRadii,
} from '../services/simulationEngine.js'

const START = '2026-11-15T00:00:00.000Z'

function forwardParameters(overrides = {}) {
  return validateSimulationParameters({
    cyclone: {
      startLatitude: 15,
      startLongitude: 90,
      headingDeg: 270,
      forwardSpeedKmh: 20,
      windSpeedKmh: 140,
      centralPressureHpa: 980,
      galeRadiusKm: 180,
      ...overrides,
    },
    rainfall: { hourlyMm: 100, durationHours: 24 },
    capacity: { districts: 30, institutions: 500, shelters: 20 },
  })
}

test('forward mode advances the eye by great-circle distance with a poleward drift', () => {
  const parameters = forwardParameters()
  const first = calculateSimulationStep(parameters, 1, START)
  const sixth = calculateSimulationStep(parameters, 6, first.timestamp)

  assert.equal(first.mode, 'forward_forecast')
  assert.equal(first.cyclone.leadHours, 1)
  assert.equal(sixth.cyclone.leadHours, 6)
  assert.ok(sixth.cyclone.positionLongitude < first.cyclone.positionLongitude)
  assert.ok(sixth.cyclone.positionLatitude > first.cyclone.positionLatitude)
  assert.ok(sixth.cyclone.distanceToStartKm > 90 && sixth.cyclone.distanceToStartKm < 140)
  assert.ok(Math.abs(first.cyclone.coneRadiusKm - coneRadiusForHour(1)) <= 1)
})

test('cone radius follows the IMD lead-time anchors and wind radii are ordered', () => {
  assert.equal(coneRadiusForHour(6), 25)
  assert.equal(coneRadiusForHour(12), 45)
  assert.equal(coneRadiusForHour(24), 75)
  assert.equal(coneRadiusForHour(48), 120)
  assert.ok(coneRadiusForHour(36) > 75 && coneRadiusForHour(36) < 120)

  const radii = windRadii(140, 180)
  assert.ok(radii.kt34Km > radii.kt50Km)
  assert.ok(radii.kt50Km > radii.kt64Km)
  assert.equal(windRadii(90, 180).kt64Km, 0)
})

test('landfall weakens the cyclone and increases rainfall', () => {
  assert.equal(isIndianLand(21.5, 79), true)
  assert.equal(isIndianLand(15, 90), false)

  const parameters = forwardParameters({
    startLatitude: 21.5,
    startLongitude: 89.5,
    headingDeg: 280,
    forwardSpeedKmh: 25,
  })
  const first = calculateSimulationStep(parameters, 1, START)
  const later = calculateSimulationStep(parameters, 8, first.timestamp)

  assert.equal(later.cyclone.isLandfall, true)
  assert.ok(later.cyclone.windSpeedKmh < first.cyclone.windSpeedKmh)
  assert.ok(later.weather.hourlyRainfallMm > first.weather.hourlyRainfallMm)
})

test('the +12h step emits a milestone impact summary with affected areas', () => {
  const parameters = forwardParameters({
    startLatitude: 18.5,
    startLongitude: 86.5,
    headingDeg: 330,
    forwardSpeedKmh: 18,
  })
  const twelfth = calculateSimulationStep(parameters, 12, START)
  const milestone = twelfth.impacts.milestone12h

  assert.ok(milestone)
  assert.equal(milestone.leadHours, 12)
  assert.equal(milestone.coneRadiusKm, 45)
  assert.ok(milestone.positionLatitude > 18.5)
  assert.ok(Array.isArray(milestone.affectedDistricts))
  assert.ok(Array.isArray(milestone.affectedStates))
  assert.equal(typeof milestone.floodRiskTier, 'string')
  assert.equal(twelfth.cyclone.forecastHoursRemaining, 12)
})

test('forward steps are deterministic for the same input and timestamp', () => {
  const parameters = forwardParameters()
  const first = calculateSimulationStep(parameters, 3, START)
  const repeat = calculateSimulationStep(parameters, 3, START)
  assert.deepEqual(first, repeat)
  assert.ok(first.impacts.districts.every((item) => typeof item.projectedWindKmh === 'number'))
  assert.ok(first.impacts.states.every((item) => typeof item.distanceToTrackKm === 'number'))
})

function segmentBearing(start, end) {
  const startLatitude = start.latitude * Math.PI / 180
  const endLatitude = end.latitude * Math.PI / 180
  const longitudeDelta = (end.longitude - start.longitude) * Math.PI / 180
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude)
  const x = Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

test('the expected IMD-style track recurves instead of running in a straight line', () => {
  const parameters = forwardParameters({
    startLatitude: 17.6,
    startLongitude: 88.8,
    headingDeg: 290,
    forwardSpeedKmh: 22,
  })
  const track = projectForwardTrack(parameters, 24)
  const earlyBearing = segmentBearing(track.positions[0], track.positions[3])
  const lateBearing = segmentBearing(track.positions[20], track.positions[23])

  assert.equal(track.trackModel, 'imd_style_recurving')
  assert.ok(lateBearing > earlyBearing + 10, `expected a poleward bend, got ${earlyBearing.toFixed(1)}° → ${lateBearing.toFixed(1)}°`)
  assert.ok(track.positions.at(-1).headingDeg > track.positions[0].headingDeg + 15)
  assert.ok(track.positions.at(-1).latitude > track.positions[0].latitude + 1)
})

test('the expected track reports a first landfall hour and position', () => {
  const parameters = forwardParameters({
    startLatitude: 20.5,
    startLongitude: 88.5,
    headingDeg: 300,
    forwardSpeedKmh: 25,
  })
  const track = projectForwardTrack(parameters, 24)

  assert.ok(track.landfall)
  assert.ok(track.landfall.hour >= 1 && track.landfall.hour <= 24)
  assert.equal(track.landfall.hour, track.positions.find((point) => point.isLandfall).hour)
  assert.ok(track.landfall.latitude > 18 && track.landfall.latitude < 24)
})

test('hourly weather steering changes the expected path and committed steps', () => {
  const configured = forwardParameters()
  const weatherSteering = Array.from({ length: 24 }, (_, index) => ({
    hour: index + 1,
    headingDeg: 90,
    forwardSpeedKmh: 10,
  }))
  const weatherDriven = forwardParameters({ weatherSteering })

  const configuredPreview = projectForwardTrack(configured, 12)
  const weatherPreview = projectForwardTrack(weatherDriven, 12)
  const step = calculateSimulationStep(weatherDriven, 3, START)

  assert.equal(configuredPreview.steeringSource, 'configured')
  assert.equal(weatherPreview.steeringSource, 'open_meteo_hourly')
  assert.equal(weatherPreview.positions.length, 12)
  assert.notEqual(weatherPreview.positions.at(-1).longitude, configuredPreview.positions.at(-1).longitude)
  assert.equal(step.cyclone.steeringSource, 'open_meteo_hourly')
  assert.equal(step.cyclone.weatherSteeredHours, 3)
  assert.equal(step.cyclone.appliedHeadingDeg, 90)
  assert.equal(step.cyclone.appliedForwardSpeedKmh, 10)
})
