export async function deleteSimulationReport({ reportId, runId, owner, SimulationReport }) {
  const filter = {
    _id: reportId,
    runId,
  }
  if (owner) filter.owner = owner

  const report = await SimulationReport.findOneAndDelete(filter)
    .select('_id fileName sha256 generatedAt summary')

  if (!report) return null
  return {
    id: report._id,
    fileName: report.fileName,
    sha256: report.sha256,
    generatedAt: report.generatedAt,
    summary: report.summary,
  }
}
