export function requireRoles(...roles) {
  return function roleGuard(request, response, next) {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}
