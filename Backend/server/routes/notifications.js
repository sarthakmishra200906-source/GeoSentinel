import { Router } from 'express'
import Notification from '../models/Notification.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRoles } from '../middleware/roles.js'

const router = Router()

router.get('/', requireAuth, async (request, response, next) => {
  try {
    const audience = request.user.role === 'admin' ? ['all', 'admins'] : ['all', 'users']
    const notifications = await Notification.find({ audience: { $in: audience } })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean()
    response.json(notifications.map((notification) => ({
      ...notification,
      read: notification.readBy.some((id) => String(id) === String(request.user._id)),
    })))
  } catch (error) {
    next(error)
  }
})

router.patch('/:id/read', requireAuth, async (request, response, next) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      request.params.id,
      { $addToSet: { readBy: request.user._id } },
      { new: true },
    )
    if (!notification) {
      response.status(404).json({ error: 'Notification not found' })
      return
    }
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post('/', requireAuth, requireRoles('admin'), async (request, response, next) => {
  try {
    const { title, message, severity, audience } = request.body || {}
    if (!title?.trim() || !message?.trim()) {
      response.status(400).json({ error: 'title and message are required' })
      return
    }
    response.status(201).json(await Notification.create({
      title,
      message,
      severity,
      audience,
      createdBy: request.user._id,
    }))
  } catch (error) {
    next(error)
  }
})

export default router
