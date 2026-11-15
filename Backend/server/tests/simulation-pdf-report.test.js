import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSimulationPdf, createSimulationReportSummary } from '../services/simulationPdfReport.js'

function timestep(sequence, riskScore) {
  const timestamp = new Date(Date.parse('2026-11-15T00:00:00.000Z') + (sequence - 1) * 60 * 60 * 1000)
  return {
    sequence,
    timestamp,
    cyclone: {
      positionLatitude: 20,
      positionLongitude: 86,
      targetLatitude: 21,
      targetLongitude: 87,
      distanceToTargetKm: 100,
      windSpeedKmh: 130,
    },
    weather: {
      hourlyRainfallMm: 40,
      riverDischargeM3s: 500,
      temperatureC: 28,
    },
    impacts: {
      riskTier: riskScore >= 0.7 ? 'CRITICAL' : 'MODERATE',
      riskScore,
      districts: [{
        district: 'Cuttack',
        riskTier: 'MODERATE',
        riskScore,
        rainfallMm: 45,
        riverSignal: 0.4,
        exposedInstitutions: 12,
      }],
      states: [{
        state: 'Odisha',
        riskTier: 'MODERATE',
        riskScore,
        rainfallMm: 40,
        riverDischargeM3s: 500,
        temperatureC: 28,
      }],
    },
  }
}

test('stored PDF includes a cover and every recorded simulation hour', async () => {
  const timesteps = [timestep(1, 0.4), timestep(2, 0.8)]
  const pdf = await buildSimulationPdf({
    run: { _id: 'run-123', status: 'COMPLETED' },
    scenario: { name: 'Report test', rulesetVersion: 'rule-matrix-v1' },
    timesteps,
    generatedAt: new Date('2026-11-15T00:00:00.000Z'),
  })

  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.match(pdf.toString('latin1'), /%%EOF/)
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3)
  assert.deepEqual(createSimulationReportSummary(timesteps), {
    timestepCount: 2,
    peakRisk: { hour: 2, tier: 'CRITICAL', score: 0.8 },
    dataSource: 'synthetic_simulation',
  })
})

test('maximum-duration report includes all district and state evidence within its storage budget', async () => {
  const timesteps = Array.from({ length: 168 }, (_, index) => {
    const item = timestep(index + 1, 0.4)
    item.impacts.districts = Array.from({ length: 30 }, (_, districtIndex) => ({
      district: `District ${districtIndex + 1}`,
      riskTier: 'MODERATE',
      riskScore: 0.4,
      rainfallMm: 45,
      riverSignal: 0.4,
      exposedInstitutions: 12,
    }))
    item.impacts.states = Array.from({ length: 36 }, (_, stateIndex) => ({
      state: `State ${stateIndex + 1}`,
      riskTier: 'MODERATE',
      riskScore: 0.4,
      rainfallMm: 40,
      riverDischargeM3s: 500,
      temperatureC: 28,
    }))
    return item
  })

  const pdf = await buildSimulationPdf({
    run: { _id: 'run-maximum', status: 'COMPLETED' },
    scenario: { name: 'Maximum duration', rulesetVersion: 'rule-matrix-v1' },
    timesteps,
    generatedAt: new Date('2026-11-15T00:00:00.000Z'),
  })

  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 169)
  assert.equal(pdf.length < 12 * 1024 * 1024, true)
})
