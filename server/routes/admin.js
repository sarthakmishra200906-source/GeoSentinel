import { Router } from 'express'
import Report from '../models/Report.js'

const router = Router()

router.patch('/reports/:id/status', async (request, response, next) => {
  try {
    const report = await Report.findByIdAndUpdate(
      request.params.id,
      { status: request.body.status },
      { new: true, runValidators: true },
    )

    if (!report) {
      response.status(404).json({ error: 'Report not found' })
      return
    }

    response.json(report)
  } catch (error) {
    next(error)
  }
})

export default router
