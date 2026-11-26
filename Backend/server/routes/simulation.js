import { Router } from 'express'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import SimulationScenario from '../models/SimulationScenario.js'
import SimulationRun from '../models/SimulationRun.js'
import SimulationTimestep from '../models/SimulationTimestep.js'
import SimulationReport from '../models/SimulationReport.js'
import { requireAdmin } from '../middleware/admin.js'
import { recordAuditEvent } from '../services/audit.js'
import { validateSimulationName, validateSimulationParameters } from '../services/simulationValidation.js'
import { calculateSimulationStep, projectForwardTrack } from '../services/simulationEngine.js'
import { buildSimulationPdf, createSimulationReportSummary } from '../services/simulationPdfReport.js'
import { deleteSimulationRunData } from '../services/simulationRunDeletion.js'
import { deleteSimulationReport } from '../services/simulationReportDeletion.js'

const router = Router()
const RUN_PAGE_SIZE = 50
const MAX_PDF_BYTES = 12 * 1024 * 1024

// Open-Meteo upper-air winds are reported as "direction the wind comes from".
// A tropical system is steered in the opposite direction, so we add 180 degrees
// and scale the flow down to a realistic translational speed.
router.get('/steering-wind', ...requireAdmin, async (request, response, next) => {
  try {
    const latitude = Number(request.query.latitude)
    const longitude = Number(request.query.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      response.status(400).json({ error: 'Valid latitude and longitude are required' })
      return
    }
    const requestedHours = Math.max(1, Math.min(48, Math.floor(Number(request.query.hours) || 1)))
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set(
      'hourly',
      'wind_speed_500hPa,wind_direction_500hPa,wind_speed_700hPa,wind_direction_700hPa',
    )
    url.searchParams.set('forecast_days', requestedHours > 24 ? '2' : '1')
    url.searchParams.set('timezone', 'UTC')
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.STEERING_TIMEOUT_MS) || 8000,
    )
    let providerResponse
    try {
      providerResponse = await fetch(url, { signal: controller.signal })
    } catch (error) {
      response.status(502).json({ error: 'Steering wind provider is unavailable or timed out' })
      return
    } finally {
      clearTimeout(timeout)
    }
    if (!providerResponse.ok) {
      response.status(502).json({ error: 'Steering wind provider is unavailable' })
      return
    }
    const payload = await providerResponse.json()
    const hourly = payload.hourly || {}
    const firstValidIndex = (values) => (Array.isArray(values)
      ? values.findIndex((value) => Number.isFinite(Number(value)))
      : -1)
    const upperLevelIndex = firstValidIndex(hourly.wind_direction_500hPa) >= 0
      ? firstValidIndex(hourly.wind_speed_500hPa)
      : firstValidIndex(hourly.wind_direction_700hPa)
    if (upperLevelIndex < 0) {
      response.status(502).json({ error: 'Steering wind data is unavailable for this location' })
      return
    }
    const use500 = Number.isFinite(Number(hourly.wind_speed_500hPa?.[upperLevelIndex]))
    const level = use500 ? '500hPa' : '700hPa'
    const directionValues = use500 ? hourly.wind_direction_500hPa : hourly.wind_direction_700hPa
    const speedValues = use500 ? hourly.wind_speed_500hPa : hourly.wind_speed_700hPa
    const times = Array.isArray(hourly.time) ? hourly.time : []
    const steering = []
    for (let index = 0; index < Math.min(times.length, directionValues.length, speedValues.length); index += 1) {
      const direction = Number(directionValues[index])
      const speed = Number(speedValues[index])
      if (!Number.isFinite(direction) || !Number.isFinite(speed)) continue
      steering.push({
        hour: steering.length + 1,
        time: times[index],
        windDirectionDeg: Math.round(direction),
        windSpeedKmh: Math.round(speed),
        headingDeg: Math.round((direction + 180) % 360),
        forwardSpeedKmh: Math.round(Math.min(80, Math.max(5, speed * 0.35))),
      })
      if (steering.length >= requestedHours) break
    }
    if (!steering.length) {
      response.status(502).json({ error: 'Steering wind data is unavailable for this location' })
      return
    }
    const first = steering[0]
    response.json({
      available: true,
      provider: 'Open-Meteo',
      level,
      sampledAt: times[upperLevelIndex] || first.time,
      windDirectionDeg: first.windDirectionDeg,
      windSpeedKmh: first.windSpeedKmh,
      headingDeg: first.headingDeg,
      forwardSpeedKmh: first.forwardSpeedKmh,
      steering,
      hours: steering.length,
    })
  } catch (error) {
    next(error)
  }
})

// Expected track for the configured weather scenario, drawn before any hour
// is committed. Uses the same engine as the saved steps.
router.post('/preview', ...requireAdmin, async (request, response, next) => {
  try {
    const parameters = validateSimulationParameters(request.body?.parameters)
    response.json({
      simulationMode: true,
      ...projectForwardTrack(parameters, request.body?.hours),
    })
  } catch (error) {
    next(error)
  }
})

function encodeRunCursor(run) {
  return Buffer.from(JSON.stringify({ createdAt: run.createdAt, id: run._id }), 'utf8').toString('base64url')
}

function reportMetadata(report) {
  const metadata = report.toObject()
  delete metadata.pdf
  return metadata
}

function decodeRunCursor(cursor) {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const createdAt = new Date(parsed.createdAt)
    if (!mongoose.Types.ObjectId.isValid(parsed.id) || !Number.isFinite(createdAt.getTime())) return null
    return { createdAt, id: parsed.id }
  } catch {
    return null
  }
}

async function storeCompletePdf(run, timesteps, owner, request) {
  const generatedAt = new Date()
  const pdf = await buildSimulationPdf({
    run,
    scenario: run.scenario,
    timesteps,
    generatedAt,
  })
  if (pdf.length > MAX_PDF_BYTES) {
    const error = new Error('Generated PDF exceeds the MongoDB document storage limit; export is not stored')
    error.statusCode = 413
    throw error
  }
  const fileName = `${run._id}-complete-evidence-${generatedAt.toISOString().replace(/[:.]/g, '-')}.pdf`
  const report = await SimulationReport.create({
    runId: run._id,
    owner,
    reportType: 'complete_simulation_pdf',
    fileName,
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    generatedAt,
    summary: createSimulationReportSummary(timesteps),
    pdf,
  })
  let auditError = null
  try {
    await recordAuditEvent({
      request,
      actor: owner,
      action: 'simulation.report.created',
      targetType: 'SimulationReport',
      targetId: report._id,
      changes: {
        runId: run._id,
        fileName,
        sha256: report.sha256,
        timestepCount: timesteps.length,
      },
    })
  } catch (error) {
    console.error({ requestId: request.id, error })
    auditError = 'PDF was stored, but its audit event could not be recorded.'
  }
  return { report, auditError }
}

router.post('/scenarios', ...requireAdmin, async (request, response, next) => {
  try {
    const parameters = validateSimulationParameters(request.body.parameters)
    const scenario = await SimulationScenario.create({
      name: validateSimulationName(request.body.name),
      version: 1,
      parameters,
      dataSource: parameters.dataSource || 'synthetic_simulation',
      seed: request.body.seed || crypto.randomUUID(),
      rulesetVersion: parameters.mode === 'forward_forecast' ? 'forward-forecast-v1' : 'rule-matrix-v1',
      createdBy: request.user._id,
    })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.scenario.created',
      targetType: 'SimulationScenario',
      targetId: scenario._id,
      changes: {
        mode: parameters.mode,
        geography: parameters.geography,
        dataSource: parameters.dataSource,
      },
    })
    response.status(201).json(scenario)
  } catch (error) {
    next(error)
  }
})

router.get('/scenarios', ...requireAdmin, async (request, response, next) => {
  try {
    const scenarios = await SimulationScenario.find({ createdBy: request.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    response.json(scenarios)
  } catch (error) {
    next(error)
  }
})

router.post('/runs', ...requireAdmin, async (request, response, next) => {
  try {
    const scenario = await SimulationScenario.findOne({
      _id: request.body.scenarioId,
      createdBy: request.user._id,
    })
    if (!scenario) {
      response.status(404).json({ error: 'Simulation scenario not found' })
      return
    }
    const run = await SimulationRun.create({
      scenario: scenario._id,
      owner: request.user._id,
      collaborators: [request.user._id],
      status: 'READY',
      clockMode: request.body.clockMode || 'DEMO_ACCELERATED',
      simulationTime: new Date(),
      dataSource: scenario.parameters?.dataSource || 'synthetic_simulation',
      engineVersion: scenario.rulesetVersion || 'rule-matrix-v1',
    })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.run.created',
      targetType: 'SimulationRun',
      targetId: run._id,
      changes: { status: run.status, dataSource: run.dataSource },
    })
    response.status(201).json({ ...run.toObject(), simulationMode: true })
  } catch (error) {
    next(error)
  }
})

router.get('/runs', ...requireAdmin, async (request, response, next) => {
  try {
    const ownerFilter = {
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }
    const cursor = decodeRunCursor(request.query.cursor)
    if (request.query.cursor && !cursor) {
      response.status(400).json({ error: 'Invalid simulation run cursor' })
      return
    }
    const query = cursor
      ? {
          $and: [
            ownerFilter,
            {
              $or: [
                { createdAt: { $lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
              ],
            },
          ],
        }
      : ownerFilter
    const results = await SimulationRun.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(RUN_PAGE_SIZE + 1)
      .populate('scenario', 'name parameters')
      .lean()
    const hasMore = results.length > RUN_PAGE_SIZE
    const runs = results.slice(0, RUN_PAGE_SIZE)
    response.json({
      runs: runs.map((run) => ({ ...run, simulationMode: true })),
      nextCursor: hasMore ? encodeRunCursor(runs[runs.length - 1]) : null,
      hasMore,
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/runs/:id', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      owner: request.user._id,
    }).select('_id owner scenario status sequence')
    if (!run) {
      response.status(404).json({ error: 'Owned simulation run not found' })
      return
    }

    const removed = await deleteSimulationRunData({
      run,
      models: { SimulationRun, SimulationTimestep, SimulationReport, SimulationScenario },
    })
    if (!removed) {
      response.status(404).json({ error: 'Owned simulation run not found' })
      return
    }
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.run.deleted',
      targetType: 'SimulationRun',
      targetId: run._id,
      oldStatus: run.status,
      changes: {
        sequence: run.sequence,
        timestepCount: removed.timestepCount,
        reportCount: removed.reportCount,
        scenarioDeleted: removed.scenarioDeleted,
        dataSource: run.scenario?.parameters?.dataSource || 'synthetic_simulation',
      },
    })
    response.json({ deleted: true, runId: run._id, ...removed })
  } catch (error) {
    next(error)
  }
})

router.get('/runs/:id', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).populate('scenario')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    const timesteps = await SimulationTimestep.find({ runId: run._id }).sort({ sequence: -1 }).limit(168).lean()
    response.json({ run, timesteps: timesteps.reverse(), simulationMode: true })
  } catch (error) {
    next(error)
  }
})

router.get('/runs/:id/report', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).populate('scenario')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    const timesteps = await SimulationTimestep.find({ runId: run._id }).sort({ sequence: 1 }).lean()
    const peak = timesteps.reduce((current, item) => !current || item.impacts.riskScore > current.impacts.riskScore ? item : current, null)
    response.json({
      reportType: 'simulation_evidence_pack',
      dataSource: run.scenario?.parameters?.dataSource || 'synthetic_simulation',
      run: run.toObject(),
      scenario: run.scenario,
      timesteps,
      summary: {
        hours: timesteps.length,
        peakRisk: peak ? { hour: peak.sequence, tier: peak.impacts.riskTier, score: peak.impacts.riskScore } : null,
        userHelpStatus: 'isolated_no_live_help_or_sos_created',
        aiInsightStatus: 'rule_matrix_only_no_synthetic_prompt_sent',
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/runs/:id/reports', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).select('_id')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    const reports = await SimulationReport.find({ runId: run._id })
      .sort({ createdAt: -1 })
      .lean()
    response.json(reports)
  } catch (error) {
    next(error)
  }
})

router.post('/runs/:id/reports', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).populate('scenario')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    const timesteps = await SimulationTimestep.find({ runId: run._id }).sort({ sequence: 1 }).lean()
    if (!timesteps.length) {
      response.status(409).json({ error: 'Advance the simulation before creating its PDF report' })
      return
    }
    const { report, auditError } = await storeCompletePdf(run, timesteps, request.user._id, request)
    response.status(auditError ? 503 : 201).json({
      ...reportMetadata(report),
      ...(auditError ? { error: auditError } : {}),
      auditError,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/runs/:id/reports/:reportId/pdf', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).select('_id')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    const report = await SimulationReport.findOne({
      _id: request.params.reportId,
      runId: run._id,
    }).select('+pdf')
    if (!report) {
      response.status(404).json({ error: 'Stored simulation PDF not found' })
      return
    }
    const disposition = request.query.download === '1' ? 'attachment' : 'inline'
    response
      .type('application/pdf')
      .set('Content-Disposition', `${disposition}; filename="${report.fileName}"`)
      .set('X-Report-SHA256', report.sha256)
      .send(report.pdf)
  } catch (error) {
    next(error)
  }
})

router.delete('/runs/:id/reports/:reportId', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      $or: [{ owner: request.user._id }, { collaborators: request.user._id }],
    }).select('_id owner')
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }

    const isRunOwner = run.owner.toString() === request.user._id.toString()
    const report = await deleteSimulationReport({
      reportId: request.params.reportId,
      runId: run._id,
      owner: isRunOwner ? null : request.user._id,
      SimulationReport,
    })
    if (!report) {
      response.status(404).json({ error: 'Stored simulation PDF not found' })
      return
    }

    let auditError = null
    try {
      await recordAuditEvent({
        request,
        actor: request.user._id,
        action: 'simulation.report.deleted',
        targetType: 'SimulationReport',
        targetId: report.id,
        changes: {
          runId: run._id,
          fileName: report.fileName,
          sha256: report.sha256,
          generatedAt: report.generatedAt,
          timestepCount: report.summary?.timestepCount || 0,
        },
      })
    } catch (error) {
      console.error({ requestId: request.id, error })
      auditError = 'PDF was deleted, but its audit event could not be recorded.'
    }
    response.status(auditError ? 503 : 200).json({
      deleted: true,
      reportId: report.id,
      auditError,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/runs/:id/step', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      owner: request.user._id,
      status: { $in: ['READY', 'RUNNING', 'PAUSED', 'LAGGING', 'COMPLETED'] },
    }).populate('scenario')
    if (!run) {
      response.status(404).json({ error: 'Steppable simulation run not found' })
      return
    }
    if (run.status === 'COMPLETED') {
      response.status(409).json({ error: 'Simulation is already complete' })
      return
    }
    const durationHours = run.scenario.parameters.cyclone?.durationHours ??
      run.scenario.parameters.rainfall?.durationHours ?? 24
    if (run.sequence >= durationHours) {
      response.status(409).json({ error: 'Simulation reached its configured duration and is complete' })
      return
    }
    const timestep = calculateSimulationStep(run.scenario.parameters, run.sequence + 1, run.simulationTime)
    const created = await SimulationTimestep.create({
      runId: run._id,
      sequence: run.sequence + 1,
      timestamp: timestep.timestamp,
      dataSource: run.scenario.parameters.dataSource || 'synthetic_simulation',
      cyclone: timestep.cyclone,
      weather: timestep.weather,
      impacts: timestep.impacts,
      recommendations: timestep.recommendations,
      ruleVersion: run.scenario.rulesetVersion,
    })
    run.sequence = created.sequence
    run.simulationTime = created.timestamp
    run.status = created.sequence >= durationHours ? 'COMPLETED' : 'RUNNING'
    run.ownerHeartbeatAt = new Date()
    await run.save()
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.run.step',
      targetType: 'SimulationRun',
      targetId: run._id,
      changes: { sequence: created.sequence, riskTier: created.impacts.riskTier, dataSource: created.dataSource },
    })
    let storedReport = null
    let reportError = null
    if (run.status === 'COMPLETED') {
      try {
        const timesteps = await SimulationTimestep.find({ runId: run._id }).sort({ sequence: 1 }).lean()
        const reportResult = await storeCompletePdf(run, timesteps, request.user._id, request)
        storedReport = reportResult.report
        reportError = reportResult.auditError
      } catch (error) {
        console.error({ requestId: request.id, error })
        reportError = error.statusCode === 413
          ? error.message
          : 'Simulation completed, but its PDF could not be archived. Retry from the saved-run report controls.'
      }
    }
    response.json({
      run,
      timestep: created,
      simulationMode: true,
      storedReport: storedReport ? reportMetadata(storedReport) : null,
      reportError,
    })
  } catch (error) {
    if (error.code === 11000) {
      response.status(409).json({ error: 'Another request already advanced this run; reload the run before stepping again' })
      return
    }
    next(error)
  }
})

router.post('/runs/:id/pause', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOneAndUpdate(
      { _id: request.params.id, owner: request.user._id, status: { $in: ['READY', 'RUNNING', 'LAGGING'] } },
      { $set: { status: 'PAUSED', ownerHeartbeatAt: new Date() } },
      { new: true },
    )
    if (!run) {
      response.status(404).json({ error: 'Pausable simulation run not found' })
      return
    }
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.run.paused',
      targetType: 'SimulationRun',
      targetId: run._id,
      reason: request.body.reason || 'Admin pause',
    })
    response.json({ ...run.toObject(), simulationMode: true })
  } catch (error) {
    next(error)
  }
})

router.post('/runs/:id/heartbeat', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOneAndUpdate(
      { _id: request.params.id, owner: request.user._id, status: { $in: ['READY', 'RUNNING', 'PAUSED', 'LAGGING'] } },
      { $set: { ownerHeartbeatAt: new Date() } },
      { new: true },
    )
    if (!run) {
      response.status(404).json({ error: 'Simulation run not found' })
      return
    }
    response.json({ run, simulationMode: true })
  } catch (error) {
    next(error)
  }
})

export default router
