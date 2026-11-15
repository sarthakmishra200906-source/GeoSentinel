import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import Report from '../models/Report.js'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { helpImageUpload, uploadDirectory } from '../middleware/upload.js'
import { requireAdmin } from '../middleware/admin.js'
import { decodeReportCursor, encodeReportCursor } from '../services/reportCursor.js'

const router = Router()
const REPORT_PAGE_SIZE = 50

router.get('/', ...requireAdmin, async (request, response, next) => {
  try {
    const paginationRequested = request.query.limit !== undefined || request.query.cursor !== undefined
    if (!paginationRequested) {
      response.json(await Report.find().sort({ createdAt: -1 }).lean())
      return
    }
    const cursor = decodeReportCursor(request.query.cursor)
    if (request.query.cursor && !cursor) {
      response.status(400).json({ error: 'Invalid help report cursor' })
      return
    }
    const query = cursor
      ? {
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
          ],
        }
      : {}
    const results = await Report.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(REPORT_PAGE_SIZE + 1)
      .lean()
    const hasMore = results.length > REPORT_PAGE_SIZE
    const reports = results.slice(0, REPORT_PAGE_SIZE)
    response.json({
      reports,
      nextCursor: hasMore ? encodeReportCursor(reports[reports.length - 1]) : null,
      hasMore,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/image', ...requireAdmin, async (request, response, next) => {
  try {
    const report = await Report.findById(request.params.id).select('imageUrl')
    if (!report?.imageUrl) {
      response.status(404).json({ error: 'Report image not found' })
      return
    }
    const filename = path.basename(report.imageUrl)
    if (!filename || filename === '.' || filename === '..') {
      response.status(404).json({ error: 'Report image not found' })
      return
    }
    response.sendFile(path.join(uploadDirectory, filename), (error) => {
      if (error && !response.headersSent) next(error)
    })
  } catch (error) {
    next(error)
  }
})

router.post('/', optionalAuth, helpImageUpload.single('image'), async (request, response, next) => {
  let compressedPath
  const removeUploadedFiles = async () => {
    if (request.file) await fs.unlink(request.file.path).catch(() => {})
    if (compressedPath) await fs.unlink(compressedPath).catch(() => {})
  }

  try {
    const { name, address, description, latitude, longitude } = request.body
    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    if (!name?.trim() || !address?.trim() || !description?.trim()) {
      await removeUploadedFiles()
      response.status(400).json({ error: 'name, address, and problem description are required' })
      return
    }
    if (
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      await removeUploadedFiles()
      response.status(400).json({ error: 'A valid current location is required' })
      return
    }

    const reportData = {
      user: request.user?._id || null,
      reporterName: name.trim(),
      reporterAddress: address.trim(),
      title: 'Help request',
      description: description.trim(),
      location: {
        type: 'Point',
        coordinates: [parsedLongitude, parsedLatitude],
      },
    }
    if (request.file) {
      const originalPath = request.file.path
      const compressedFilename = `${path.parse(request.file.filename).name}.jpg`
      compressedPath = path.join(uploadDirectory, compressedFilename)
      await sharp(originalPath).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(compressedPath)
      await fs.unlink(originalPath)
      reportData.imageUrl = `/uploads/${compressedFilename}`
      reportData.imageMetadata = {
        originalName: request.file.originalname,
        mimeType: 'image/jpeg',
        size: (await fs.stat(compressedPath)).size,
      }
    }

    const report = await Report.create(reportData)
    response.status(201).json(report)
  } catch (error) {
    await removeUploadedFiles()
    next(error)
  }
})

export default router
