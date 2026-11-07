import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import Report from '../models/Report.js'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { helpImageUpload, uploadDirectory } from '../middleware/upload.js'

const router = Router()

router.get('/', async (request, response, next) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).lean()
    response.json(reports)
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
