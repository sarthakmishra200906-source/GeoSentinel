import { Router } from 'express'
import crypto from 'node:crypto'
import SimulationScenario from '../models/SimulationScenario.js'
import SimulationRun from '../models/SimulationRun.js'
import SimulationTimestep from '../models/SimulationTimestep.js'
import { requireAdmin } from '../middleware/admin.js'
import { recordAuditEvent } from '../services/audit.js'
import { validateSimulationName, validateSimulationParameters } from '../services/simulationValidation.js'
import { calculateSimulationStep } from '../services/simulationEngine.js'

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
    const timesteps = await SimulationTimestep.find({ runId: run._id }).sort({ sequence: -1 }).limit(72).lean()
    response.json({ run, timesteps: timesteps.reverse(), simulationMode: true })
  } catch (error) {
    next(error)
  }
})

router.post('/runs/:id/step', ...requireAdmin, async (request, response, next) => {
  try {
    const run = await SimulationRun.findOne({
      _id: request.params.id,
      owner: request.user._id,
      status: { $in: ['READY', 'RUNNING', 'PAUSED', 'LAGGING'] },
    }).populate('scenario')
    if (!run) {
      response.status(404).json({ error: 'Steppable simulation run not found' })
      return
    }
    const timestep = calculateSimulationStep(run.scenario.parameters, run.sequence + 1, run.simulationTime)
    const created = await SimulationTimestep.create({
      runId: run._id,
      sequence: run.sequence + 1,
      timestamp: timestep.timestamp,
      dataSource: 'synthetic_simulation',
      cyclone: timestep.cyclone,
      weather: timestep.weather,
      impacts: timestep.impacts,
      recommendations: timestep.recommendations,
      ruleVersion: run.scenario.rulesetVersion,
    })
    run.sequence = created.sequence
    run.simulationTime = created.timestamp
    run.status = 'RUNNING'
    run.ownerHeartbeatAt = new Date()
    await run.save()
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'simulation.run.step',
      targetType: 'SimulationRun',
      targetId: run._id,
      changes: { sequence: created.sequence, riskTier: created.impacts.riskTier },
    })
    response.json({ run, timestep: created, simulationMode: true })
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
