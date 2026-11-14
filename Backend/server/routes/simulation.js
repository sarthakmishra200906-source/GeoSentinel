import { Router } from 'express'
import crypto from 'node:crypto'
import SimulationScenario from '../models/SimulationScenario.js'
import SimulationRun from '../models/SimulationRun.js'
import { requireAdmin } from '../middleware/admin.js'
import { recordAuditEvent } from '../services/audit.js'
import { validateSimulationName, validateSimulationParameters } from '../services/simulationValidation.js'

const router = Router()

router.post('/scenarios', ...requireAdmin, async (request, response, next) => {
  try {
    const parameters = validateSimulationParameters(request.body.parameters)
    const scenario = await SimulationScenario.create({
      name: validateSimulationName(request.body.name),
      version: 1,
      parameters,
      seed: request.body.seed || crypto.randomUUID(),
      rulesetVersion: 'rule-matrix-v1',
      createdBy: request.user._id,
    })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.scenario.created',
      targetType: 'SimulationScenario',
      targetId: scenario._id,
      changes: { geography: 'ODISHA', dataSource: 'synthetic_simulation' },
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

export default router
