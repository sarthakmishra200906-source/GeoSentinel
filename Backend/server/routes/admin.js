import { Router } from 'express'
import Report from '../models/Report.js'
import AdminVerification from '../models/AdminVerification.js'
import GuidelineDocument from '../models/GuidelineDocument.js'
import crypto from 'node:crypto'
import multer from 'multer'
import { requireAdmin } from '../middleware/admin.js'

const router = Router()
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (['text/plain', 'text/markdown', 'application/pdf'].includes(file.mimetype)) callback(null, true)
    else callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'document'))
  },
})

function chunkText(text, size = 900, overlap = 120) {
  const chunks = []
  for (let start = 0; start < text.length; start += size - overlap) {
    const chunk = text.slice(start, start + size).trim()
    if (chunk) chunks.push({ text: chunk, section: 'Uploaded document', page: null })
  }
  return chunks
}

router.patch('/reports/:id/status', ...requireAdmin, async (request, response, next) => {
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

router.get('/verifications', ...requireAdmin, async (_request, response, next) => {
  try {
    response.json(await AdminVerification.find({ status: 'pending' }).populate('user', 'name email phone').lean())
  } catch (error) {
    next(error)
  }
})

router.patch('/verifications/:id', ...requireAdmin, async (request, response, next) => {
  try {
    const status = request.body.status
    if (!['approved', 'rejected'].includes(status)) {
      response.status(400).json({ error: 'status must be approved or rejected' })
      return
    }
    const verification = await AdminVerification.findByIdAndUpdate(
      request.params.id,
      { status, reviewedBy: request.user._id, reviewedAt: new Date(), reviewNote: request.body.reviewNote || '' },
      { new: true },
    )
    if (!verification) {
      response.status(404).json({ error: 'Verification request not found' })
      return
    }
    if (status === 'approved') {
      await (await import('../models/User.js')).default.findByIdAndUpdate(verification.user, { role: 'admin' })
    }
    response.json(verification)
  } catch (error) {
    next(error)
  }
})

router.post('/guidelines', ...requireAdmin, documentUpload.single('document'), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'A text, markdown, or PDF document is required' })
      return
    }
    if (!request.body.title || !request.body.issuingAuthority || !request.body.officialUrl || !request.body.jurisdiction) {
      response.status(400).json({ error: 'title, issuingAuthority, officialUrl, and jurisdiction are required' })
      return
    }
    if (!/^https:\/\/([a-z0-9-]+\.)*(gov|gov\.in|nic\.in)(\/|$)/i.test(request.body.officialUrl)) {
      response.status(400).json({ error: 'officialUrl must point to a government domain' })
      return
    }
    const checksum = crypto.createHash('sha256').update(request.file.buffer).digest('hex')
    if (request.file.mimetype === 'application/pdf') {
      response.status(415).json({ error: 'PDF text extraction is not enabled in this local build; upload a verified .txt or .md export' })
      return
    }
    const rawText = request.file.buffer.toString('utf8')
    const document = await GuidelineDocument.create({
      title: request.body.title,
      issuingAuthority: request.body.issuingAuthority,
      officialUrl: request.body.officialUrl,
      jurisdiction: request.body.jurisdiction,
      publicationDate: request.body.publicationDate || null,
      checksum,
      fileName: request.file.originalname,
      mimeType: request.file.mimetype,
      rawText,
      chunks: chunkText(rawText),
      uploadedBy: request.user._id,
    })
    response.status(201).json({ id: document._id, status: document.status, chunks: document.chunks.length })
  } catch (error) {
    if (error.code === 11000) {
      response.status(409).json({ error: 'This document has already been uploaded' })
      return
    }
    next(error)
  }
})

router.get('/guidelines', ...requireAdmin, async (_request, response, next) => {
  try {
    response.json(await GuidelineDocument.find().select('-rawText -chunks').sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

router.patch('/guidelines/:id', ...requireAdmin, async (request, response, next) => {
  try {
    const status = request.body.status
    if (!['approved', 'rejected', 'inactive'].includes(status)) {
      response.status(400).json({ error: 'invalid guideline status' })
      return
    }
    const document = await GuidelineDocument.findByIdAndUpdate(
      request.params.id,
      { status, approvedBy: status === 'approved' ? request.user._id : null, approvedAt: status === 'approved' ? new Date() : null },
      { new: true },
    ).select('-rawText -chunks')
    if (!document) {
      response.status(404).json({ error: 'Guideline not found' })
      return
    }
    response.json(document)
  } catch (error) {
    next(error)
  }
})

export default router
