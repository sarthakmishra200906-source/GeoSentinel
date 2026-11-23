import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteSimulationReport } from '../services/simulationReportDeletion.js'

function reportModel(report) {
  const calls = []
  return {
    calls,
    SimulationReport: {
      findOneAndDelete(filter) {
        calls.push({ filter })
        return {
          async select(fields) {
            calls.push({ fields })
            return report
          },
        }
      },
    },
  }
}

test('deletes only the report matching report, run, and owner IDs and returns safe metadata', async () => {
  const storedReport = {
    _id: 'report-1',
    fileName: 'run-report.pdf',
    sha256: 'digest',
    generatedAt: new Date('2026-11-15T00:00:00.000Z'),
    summary: { timestepCount: 2 },
    pdf: Buffer.from('not selected'),
  }
  const { calls, SimulationReport } = reportModel(storedReport)
  const result = await deleteSimulationReport({
    reportId: 'report-1',
    runId: 'run-1',
    owner: 'admin-1',
    SimulationReport,
  })

  assert.deepEqual(calls, [
    { filter: { _id: 'report-1', runId: 'run-1', owner: 'admin-1' } },
    { fields: '_id fileName sha256 generatedAt summary' },
  ])
  assert.deepEqual(result, {
    id: 'report-1',
    fileName: 'run-report.pdf',
    sha256: 'digest',
    generatedAt: storedReport.generatedAt,
    summary: { timestepCount: 2 },
  })
  assert.equal(Object.hasOwn(result, 'pdf'), false)
})

test('returns not found when the report does not belong to the requested run or owner', async () => {
  const { SimulationReport } = reportModel(null)
  const result = await deleteSimulationReport({
    reportId: 'report-1',
    runId: 'run-1',
    owner: 'admin-1',
    SimulationReport,
  })

  assert.equal(result, null)
})

test('allows the run owner to delete a report created by a collaborator', async () => {
  const storedReport = {
    _id: 'report-1',
    fileName: 'run-report.pdf',
    sha256: 'digest',
    generatedAt: new Date('2026-11-15T00:00:00.000Z'),
    summary: { timestepCount: 2 },
  }
  const { calls, SimulationReport } = reportModel(storedReport)
  const result = await deleteSimulationReport({
    reportId: 'report-1',
    runId: 'run-1',
    owner: null,
    SimulationReport,
  })

  assert.deepEqual(calls, [
    { filter: { _id: 'report-1', runId: 'run-1' } },
    { fields: '_id fileName sha256 generatedAt summary' },
  ])
  assert.equal(result.id, 'report-1')
})
