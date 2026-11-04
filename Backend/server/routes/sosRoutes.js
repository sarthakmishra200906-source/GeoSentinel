import { Router } from 'express'
import { createGuestSOS, resolveSOSIncident } from '../controllers/sosController.js'
import { requireAuth } from '../middleware/auth.js'
import { requireRoles } from '../middleware/roles.js'

const router = Router()

router.post('/guest', createGuestSOS)
router.patch('/:id/resolve', requireAuth, requireRoles('admin', 'responder'), resolveSOSIncident)

export default router
