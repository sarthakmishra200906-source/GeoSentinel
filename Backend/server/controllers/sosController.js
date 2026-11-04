import mongoose from 'mongoose'
import SOSIncident from '../models/SOSIncident.js'

export async function createGuestSOS(request, response, next) {
  try {
    const {
      name,
      phone,
      latitude,
      longitude,
      address,
      emergencyType,
      description,
    } = request.body || {}

    if (!phone || latitude === undefined || longitude === undefined) {
      response.status(400).json({
        error: 'phone, latitude, and longitude are required',
      })
      return
    }

    const incident = await SOSIncident.create({
      user: null,
      guestContact: { name, phone },
      location: { latitude, longitude, address },
      emergencyType,
      description,
    })

    response.status(201).json({ incidentId: incident._id })
  } catch (error) {
    next(error)
  }
}

export async function resolveSOSIncident(request, response, next) {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) {
      response.status(400).json({ error: 'Invalid incident id' })
      return
    }

    const incident = await SOSIncident.findByIdAndUpdate(
      request.params.id,
      { $set: { status: 'resolved', resolvedAt: new Date() } },
      { new: true, runValidators: true },
    )

    if (!incident) {
      response.status(404).json({ error: 'SOS incident not found' })
      return
    }

    response.json({
      incidentId: incident._id,
      status: incident.status,
      resolvedAt: incident.resolvedAt,
    })
  } catch (error) {
    next(error)
  }
}
