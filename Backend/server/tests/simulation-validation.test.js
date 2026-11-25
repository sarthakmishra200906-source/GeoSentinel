import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSimulationName, validateSimulationParameters } from '../services/simulationValidation.js'
import { calculateSimulationStep } from '../services/simulationEngine.js'

test('new scenarios default to IMD-style forward forecasting', () => {
  const parameters = validateSimulationParameters({
    cyclone: {
      startLatitude: 17.6,
      startLongitude: 88.8,
      headingDeg: 315,
      forwardSpeedKmh: 18,
      windSpeedKmh: 140,
      centralPressureHpa: 980,
      galeRadiusKm: 180,
    },
    rainfall: { hourlyMm: 120, durationHours: 24 },
  })
  assert.equal(parameters.mode, 'forward_forecast')
  assert.equal(parameters.geography, 'GLOBAL')
  assert.equal(parameters.dataSource, 'imd_style_forward_forecast')
  assert.equal(parameters.engineScope, 'great_circle_forward_propagation')
  assert.equal(parameters.cyclone.headingDeg, 315)
})

test('forward validation accepts auto steering and rejects unbounded inputs', () => {
  const auto = validateSimulationParameters({ cyclone: { headingDeg: 'AUTO' } })
  assert.equal(auto.cyclone.headingDeg, 'auto')
  assert.throws(
    () => validateSimulationParameters({ cyclone: { forwardSpeedKmh: 100 } }),
    /forwardSpeedKmh must be a number/,
  )
  assert.throws(
    () => validateSimulationParameters({ cyclone: { headingDeg: 361 } }),
    /headingDeg must be a number/,
  )
  assert.throws(
    () => validateSimulationParameters({ mode: 'unknown' }),
    /mode must be forward_forecast or fixed_route/,
  )
  assert.throws(
    () => validateSimulationParameters({ rainfall: { durationHours: 49 } }),
    /rainfall\.durationHours must be a number/,
  )
})

test('simulation validation keeps the legacy Odisha rule-matrix scope for saved runs', () => {
  const parameters = validateSimulationParameters({
    mode: 'fixed_route',
    cyclone: { approachDistanceKm: 200 },
    rainfall: { hourlyMm: 120, durationHours: 24 },
    capacity: { districts: 30, institutions: 2000, shelters: 100 },
  })

  assert.equal(parameters.mode, 'fixed_route')
  assert.equal(parameters.geography, 'ODISHA')
  assert.equal(parameters.dataSource, 'synthetic_simulation')
  assert.equal(parameters.engineScope, 'district_institution_rule_matrix')
})

test('simulation validation rejects values outside the bounded demo budget', () => {
  assert.throws(
    () => validateSimulationParameters({ rainfall: { hourlyMm: 501 } }),
    /rainfall\.hourlyMm must be a number/,
  )
  assert.throws(
    () => validateSimulationParameters({ capacity: { institutions: 2001 } }),
    /capacity\.institutions must be a number/,
  )
  assert.throws(
    () => validateSimulationParameters({ mode: 'fixed_route', cyclone: { routePoints: [{ latitude: 0, longitude: 0 }] } }),
    /routePoints must contain between 2 and 20 points/,
  )
})

test('saved fixed-route runs accept a custom multi-waypoint route outside the Odisha bounds', () => {
  const parameters = validateSimulationParameters({
    mode: 'fixed_route',
    cyclone: {
      windSpeedKmh: 140,
      routePoints: [
        { latitude: 0, longitude: 140 },
        { latitude: 0, longitude: 160 },
        { latitude: 0, longitude: 180 },
      ],
    },
    rainfall: { hourlyMm: 40, durationHours: 2 },
  })
  const first = calculateSimulationStep(parameters, 1, '2026-11-15T00:00:00.000Z')
  const final = calculateSimulationStep(parameters, 2, first.timestamp)

  assert.equal(first.cyclone.positionLatitude, 0)
  assert.equal(first.cyclone.positionLongitude, 160)
  assert.equal(final.cyclone.positionLatitude, 0)
  assert.equal(final.cyclone.positionLongitude, 180)
  assert.equal(final.cyclone.distanceToTargetKm, 0)
  assert.equal(final.impacts.districts.length, 30)
})

test('saved fixed-route runs follow the short path across the international date line', () => {
  const parameters = validateSimulationParameters({
    mode: 'fixed_route',
    cyclone: {
      routePoints: [
        { latitude: 0, longitude: 170 },
        { latitude: 0, longitude: -170 },
      ],
    },
    rainfall: { durationHours: 2 },
  })
  const middle = calculateSimulationStep(parameters, 1, '2026-11-15T00:00:00.000Z')

  assert.equal(Math.abs(middle.cyclone.positionLongitude), 180)
  assert.equal(middle.cyclone.distanceToTargetKm < 1200, true)
})

test('simulation validation requires a bounded scenario name', () => {
  assert.equal(validateSimulationName(' Odisha cyclone rehearsal '), 'Odisha cyclone rehearsal')
  assert.throws(() => validateSimulationName(''), /Simulation name is required/)
})

test('saved fixed-route runs advance deterministic synthetic district results', () => {
  const parameters = validateSimulationParameters({
    mode: 'fixed_route',
    cyclone: { approachDistanceKm: 200, windSpeedKmh: 160 },
    rainfall: { hourlyMm: 180, durationHours: 24 },
    capacity: { districts: 30, institutions: 500, shelters: 20 },
  })
  const first = calculateSimulationStep(parameters, 1, '2026-11-15T00:00:00.000Z')
  const repeat = calculateSimulationStep(parameters, 1, '2026-11-15T00:00:00.000Z')
  assert.deepEqual(first, repeat)
  assert.equal(first.impacts.districts.length, 30)
  assert.equal(first.impacts.states.length, 36)
  assert.equal(first.impacts.states.find((item) => item.state === 'Odisha').riskTier, first.impacts.riskTier)
  assert.equal(first.weather.hourlyRainfallMm, 180)
  assert.equal(typeof first.weather.riverDischargeM3s, 'number')
  assert.equal(typeof first.weather.temperatureC, 'number')
  assert.equal(first.cyclone.distanceToTargetKm > 0, true)
  assert.equal(first.cyclone.positionLatitude > first.cyclone.startLatitude, true)
})
