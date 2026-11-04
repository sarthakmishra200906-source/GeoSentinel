import { Router } from 'express'
import Report from '../models/Report.js'

const router = Router()

router.get('/', async (request, response, next) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).lean()
    response.json(reports)
  } catch (error) {
    next(error)
  }
})

router.post('/', async (request, response, next) => {
  try {
    const report = await Report.create(request.body)
    response.status(201).json(report)
  } catch (error) {
    next(error)
  }
})

export default router
