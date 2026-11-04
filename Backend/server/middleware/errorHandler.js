export function notFoundHandler(request, response) {
  response.status(404).json({ error: `Route not found: ${request.method} ${request.path}` })
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }

  console.error(error)
  const statusCode =
    error.statusCode || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)
  response.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : error.message,
  })
}
