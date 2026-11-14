import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSimulationName, validateSimulationParameters } from '../services/simulationValidation.js'

test('simulation validation defaults to Odisha synthetic rule-matrix scope', () => {
  const parameters = validateSimulationParameters({
    cyclone: { approachDistanceKm: 200 },
    rainfall: { hourlyMm: 120, durationHours: 24 },
    capacity: { districts: 30, institutions: 2000, shelters: 100 },
  })

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
})

test('simulation validation requires a bounded scenario name', () => {
  assert.equal(validateSimulationName(' Odisha cyclone rehearsal '), 'Odisha cyclone rehearsal')
  assert.throws(() => validateSimulationName(''), /Simulation name is required/)
})
