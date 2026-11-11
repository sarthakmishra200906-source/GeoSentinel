import { Router } from 'express'
import RescueCenter from '../models/RescueCenter.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRoles } from '../middleware/roles.js'
import { recordAuditEvent } from '../services/audit.js'
import { assertExpectedVersion } from '../services/rescueCenterConcurrency.js'

const router = Router()
const adminOnly = [requireAuth, requireRoles('admin')]

function validateCenter(body) {
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  const capacity = Number(body.capacity)
  const occupancy = Number(body.occupancy ?? 0)
  if (!body.name?.trim() || !body.address?.trim()) throw new Error('name and address are required')
  if (![latitude, longitude, capacity, occupancy].every(Number.isFinite)) throw new Error('coordinates and capacity must be numeric')
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('invalid coordinates')
  if (capacity < 0 || occupancy < 0 || occupancy > capacity) throw new Error('occupancy must be within capacity')
  return { latitude, longitude, capacity, occupancy }
}

async function findDuplicate(values, excludeId = null) {
  const query = {
    name: values.name.trim(),
    address: values.address.trim(),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }
  return RescueCenter.findOne(query).select('_id').lean()
}

router.get('/', async (_request, response, next) => {
  try {
    response.json(await RescueCenter.find({ status: { $ne: 'closed' } }).sort({ name: 1 }).lean())
  } catch (error) {
    next(error)
  }
})

router.post('/', ...adminOnly, async (request, response, next) => {
  try {
    const values = validateCenter(request.body)
    if (await findDuplicate(request.body)) {
      response.status(409).json({ error: 'A rescue center with this name and address already exists' })
      return
    }
    const center = await RescueCenter.create({
      ...request.body,
      ...values,
      location: { type: 'Point', coordinates: [values.longitude, values.latitude] },
      createdBy: request.user._id,
    })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'rescue-center.create',
      targetType: 'RescueCenter',
      targetId: center._id,
      newStatus: center.status,
    })
    response.status(201).json(center)
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('coordinates') || error.message.includes('occupancy')) {
      response.status(400).json({ error: error.message })
      return
    }
    next(error)
  }
})

router.patch('/:id', ...adminOnly, async (request, response, next) => {
  try {
    const existing = await RescueCenter.findById(request.params.id)
    if (!existing) {
      response.status(404).json({ error: 'Rescue center not found' })
      return
    }
    assertExpectedVersion(request.body.version, existing.__v)
    const values = validateCenter({
      name: request.body.name ?? existing.name,
      address: request.body.address ?? existing.address,
      latitude: request.body.latitude ?? existing.location.coordinates[1],
      longitude: request.body.longitude ?? existing.location.coordinates[0],
      capacity: request.body.capacity ?? existing.capacity,
      occupancy: request.body.occupancy ?? existing.occupancy,
    })
    if (await findDuplicate({
      name: request.body.name ?? existing.name,
      address: request.body.address ?? existing.address,
    }, existing._id)) {
      response.status(409).json({ error: 'A rescue center with this name and address already exists' })
      return
    }
    const expectedVersion = Number(request.body.version)
    const update = {
      name: request.body.name ?? existing.name,
      address: request.body.address ?? existing.address,
      capacity: values.capacity,
      occupancy: values.occupancy,
      status: request.body.status ?? existing.status,
      accessibility: request.body.accessibility ?? existing.accessibility,
      waterAvailable: request.body.waterAvailable ?? existing.waterAvailable,
      medicalAvailable: request.body.medicalAvailable ?? existing.medicalAvailable,
      powerAvailable: request.body.powerAvailable ?? existing.powerAvailable,
      contact: request.body.contact ?? existing.contact,
      location: { type: 'Point', coordinates: [values.longitude, values.latitude] },
      lastVerifiedAt: new Date(),
    }
    const filter = { _id: request.params.id }
    filter.__v = expectedVersion
    const center = await RescueCenter.findOneAndUpdate(
      filter,
      { $set: update, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    )
    if (!center) {
      response.status(409).json({ error: 'Rescue center was changed by another admin; reload before saving' })
      return
    }
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'rescue-center.update',
      targetType: 'RescueCenter',
      targetId: center._id,
      oldStatus: existing.status,
      newStatus: center.status,
      changes: update,
    })
    response.json(center)
  } catch (error) {
    if (error.statusCode || error.name === 'ValidationError' || error.message.includes('required') || error.message.includes('coordinates') || error.message.includes('occupancy')) {
      response.status(error.statusCode || 400).json({ error: error.message })
      return
    }
    next(error)
  }
})

export default router
