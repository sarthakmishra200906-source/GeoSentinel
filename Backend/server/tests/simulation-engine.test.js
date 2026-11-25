import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSimulationParameters } from '../services/simulationValidation.js'
import {
  calculateSimulationStep,
  coneRadiusForHour,
  isIndianLand,
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
