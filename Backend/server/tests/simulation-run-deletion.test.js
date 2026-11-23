import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteSimulationRunData } from '../services/simulationRunDeletion.js'

function deletionModels({ scenarioInUse = false } = {}) {
  const calls = []
  return {
    calls,
    models: {
      SimulationRun: {
        async deleteOne(filter) {
          calls.push(['run.deleteOne', filter])
          return { deletedCount: 1 }
        },
        async exists(filter) {
          calls.push(['run.exists', filter])
          return scenarioInUse
        },
      },
      SimulationTimestep: {
        async deleteMany(filter) {
          calls.push(['timestep.deleteMany', filter])
          return { deletedCount: 3 }
        },
      },
      SimulationReport: {
        async deleteMany(filter) {
          calls.push(['report.deleteMany', filter])
          return { deletedCount: 2 }
        },
      },
      SimulationScenario: {
        async deleteOne(filter) {
          calls.push(['scenario.deleteOne', filter])
          return { deletedCount: 1 }
        },
      },
    },
  }
}

test('deleting a run removes its timesteps, reports, and now-unused owned scenario', async () => {
  const { calls, models } = deletionModels()
  const result = await deleteSimulationRunData({
    run: { _id: 'run-1', owner: 'admin-1', scenario: 'scenario-1' },
    models,
  })

  assert.deepEqual(result, { timestepCount: 3, reportCount: 2, scenarioDeleted: true })
  assert.deepEqual(calls, [
    ['run.deleteOne', { _id: 'run-1', owner: 'admin-1' }],
    ['timestep.deleteMany', { runId: 'run-1' }],
    ['report.deleteMany', { runId: 'run-1' }],
    ['run.exists', { scenario: 'scenario-1' }],
    ['scenario.deleteOne', { _id: 'scenario-1', createdBy: 'admin-1' }],
  ])
})

test('deleting a run preserves its scenario while another run still references it', async () => {
  const { calls, models } = deletionModels({ scenarioInUse: true })
  const result = await deleteSimulationRunData({
    run: { _id: 'run-1', owner: 'admin-1', scenario: { _id: 'scenario-1' } },
    models,
  })

  assert.equal(result.scenarioDeleted, false)
  assert.equal(calls.some(([call]) => call === 'scenario.deleteOne'), false)
})

test('deletion reports a concurrent run removal without deleting related data', async () => {
  const { calls, models } = deletionModels()
  models.SimulationRun.deleteOne = async () => ({ deletedCount: 0 })

  const result = await deleteSimulationRunData({
    run: { _id: 'run-1', owner: 'admin-1', scenario: 'scenario-1' },
    models,
  })

  assert.equal(result, null)
  assert.equal(calls.length, 0)
})
