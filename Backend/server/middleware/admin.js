import { requireAuth } from './auth.js'
import { requireRoles } from './roles.js'

export const requireAdmin = [requireAuth, requireRoles('admin')]
