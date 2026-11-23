export async function deleteSimulationRunData({ run, models }) {
  const removedRun = await models.SimulationRun.deleteOne({
    _id: run._id,
    owner: run.owner,
  })
  if (!removedRun.deletedCount) return null

  const [timesteps, reports] = await Promise.all([
    models.SimulationTimestep.deleteMany({ runId: run._id }),
    models.SimulationReport.deleteMany({ runId: run._id }),
  ])
  const scenarioId = run.scenario?._id || run.scenario
  const scenarioInUse = await models.SimulationRun.exists({ scenario: scenarioId })
  let scenarioDeleted = false
  if (!scenarioInUse) {
    const removedScenario = await models.SimulationScenario.deleteOne({
      _id: scenarioId,
      createdBy: run.owner,
    })
    scenarioDeleted = Boolean(removedScenario.deletedCount)
  }

  return {
    timestepCount: timesteps.deletedCount,
    reportCount: reports.deletedCount,
    scenarioDeleted,
  }
}
