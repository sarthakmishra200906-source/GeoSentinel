export function notFoundHandler(request, response) {
  response.status(404).json({ error: `Route not found: ${request.method} ${request.path}` })
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }

  console.error({ requestId: request.id, error })
  const statusCode =
    error.statusCode ||
    (error.name === 'MulterError' && error.code === 'LIMIT_UNEXPECTED_FILE'
      ? 415
      : error.name === 'ValidationError' || error.name === 'CastError'
        ? 400
        : 500)
  response.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : error.name === 'MulterError' ? 'Only text, Markdown, or PDF guideline files are allowed' : error.message,
    requestId: request.id,
  })
}
