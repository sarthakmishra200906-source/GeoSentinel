import { Router } from 'express'
import Report from '../models/Report.js'
import AdminVerification from '../models/AdminVerification.js'
import User from '../models/User.js'
import GuidelineDocument from '../models/GuidelineDocument.js'
import AuditEvent from '../models/AuditEvent.js'
import crypto from 'node:crypto'
import multer from 'multer'
import { requireAdmin } from '../middleware/admin.js'
import { recordAuditEvent } from '../services/audit.js'
import { getLlmProviderStatus } from '../services/groundedChat.js'
import mongoose from 'mongoose'
import { extractPdfText, isReadableText } from '../services/pdfTextExtraction.js'

const router = Router()
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (['text/plain', 'text/markdown', 'application/pdf'].includes(file.mimetype)) callback(null, true)
    else callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'document'))
  },
})

router.get('/health', ...requireAdmin, async (_request, response) => {
  const fastApiUrl = process.env.FASTAPI_URL || 'http://127.0.0.1:8000'
  let ml = 'offline'
  try {
    const healthResponse = await fetch(`${fastApiUrl}/health`, { signal: AbortSignal.timeout(3000) })
    ml = healthResponse.ok ? 'online' : 'offline'
  } catch {
    ml = 'offline'
  }
  response.json({
    express: 'online',
    mongodb: mongoose.connection.readyState === 1 ? 'online' : 'offline',
    ml,
    weather: process.env.OPENWEATHER_API_KEY ? 'configured' : 'offline',
    llm: getLlmProviderStatus() === 'offline' ? 'offline' : 'configured',
    llmProvider: getLlmProviderStatus(),
    checkedAt: new Date().toISOString(),
  })
})

function chunkText(pages, size = 900, overlap = 120) {
  const chunks = []
  pages.forEach(({ page: pageNumber, text: pageText }) => {
    for (let start = 0; start < pageText.length; start += size - overlap) {
      const chunk = pageText.slice(start, start + size).trim()
      if (chunk) chunks.push({ text: chunk, section: 'Uploaded document', page: pageNumber })
    }
  })
  return chunks
}

function parseDate(value, fieldName) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} must be a valid date`)
  return date
}

router.patch('/reports/:id/status', ...requireAdmin, async (request, response, next) => {
  try {
    const previous = await Report.findById(request.params.id).select('status')
    if (!previous) {
      response.status(404).json({ error: 'Report not found' })
      return
    }
    const report = await Report.findByIdAndUpdate(
      request.params.id,
      { status: request.body.status },
      { new: true, runValidators: true },
    )

    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'report.status',
      targetType: 'Report',
      targetId: report._id,
      oldStatus: previous.status,
      newStatus: report.status,
      reason: request.body.reason || '',
    })
    response.json(report)
  } catch (error) {
    next(error)
  }
})

router.get('/verifications', ...requireAdmin, async (_request, response, next) => {
  try {
    response.json(
      await AdminVerification.find({ status: 'pending' })
        .populate('user', 'name email phone isEmailVerified isPhoneVerified')
        .lean(),
    )
  } catch (error) {
    next(error)
  }
})

router.get('/users', ...requireAdmin, async (_request, response, next) => {
  try {
    response.json(
      await User.find({ role: 'user', isApproved: false })
        .select('name email phone isEmailVerified isPhoneVerified createdAt')
        .sort({ createdAt: 1 })
        .limit(100)
        .lean(),
    )
  } catch (error) {
    next(error)
  }
})

router.patch('/users/:id/approval', ...requireAdmin, async (request, response, next) => {
  try {
    if (typeof request.body.isApproved !== 'boolean') {
      response.status(400).json({ error: 'isApproved must be a boolean' })
      return
    }
    if (request.params.id === request.user._id.toString()) {
      response.status(400).json({ error: 'You cannot change your own account approval' })
      return
    }
    const user = await User.findById(request.params.id)
    if (!user) {
      response.status(404).json({ error: 'User not found' })
      return
    }
    if (user.role !== 'user') {
      response.status(409).json({ error: 'Admin accounts must be managed through admin verification requests' })
      return
    }
    if (request.body.isApproved && (!user.isEmailVerified || !user.isPhoneVerified)) {
      response.status(409).json({ error: 'A verified email and phone are required before approval' })
      return
    }
    const oldStatus = user.isApproved ? 'approved' : 'pending'
    user.isApproved = request.body.isApproved
    await user.save()
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'user.approval',
      targetType: 'User',
      targetId: user._id,
      oldStatus,
      newStatus: user.isApproved ? 'approved' : 'pending',
    })
    response.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
    })
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
    const verification = await AdminVerification.findById(request.params.id)
    if (!verification) {
      response.status(404).json({ error: 'Verification request not found' })
      return
    }
    const targetUser = await User.findById(verification.user)
    if (!targetUser) {
      response.status(404).json({ error: 'Applicant account no longer exists' })
      return
    }
    if (status === 'approved' && (!targetUser.isEmailVerified || !targetUser.isPhoneVerified)) {
      response.status(409).json({ error: 'A verified email and phone are required before admin approval' })
      return
    }
    verification.status = status
    verification.reviewedBy = request.user._id
    verification.reviewedAt = new Date()
    verification.reviewNote = request.body.reviewNote || ''
    await verification.save()
    if (status === 'approved') {
      targetUser.role = 'admin'
      targetUser.isApproved = true
      await targetUser.save()
    }
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'admin-verification.review',
      targetType: 'AdminVerification',
      targetId: verification._id,
      newStatus: status,
      reason: request.body.reviewNote || '',
    })
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
    let rawText
    let pages
    let extractionMethod = 'text'
    if (request.file.mimetype === 'application/pdf') {
      if (!request.file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        response.status(415).json({ error: 'The uploaded PDF signature is invalid' })
        return
      }
      const extracted = await extractPdfText(request.file.buffer)
      pages = extracted.pages
      extractionMethod = extracted.method
      rawText = pages.map(({ text }) => text).join('\f').trim()
    } else {
      rawText = request.file.buffer.toString('utf8').replace(/\u0000/g, '').trim()
      pages = [{ page: 1, text: rawText }]
    }
    if (!rawText) {
      response.status(422).json({ error: 'The document contains no extractable text' })
      return
    }
    if (!isReadableText(rawText)) {
      response.status(422).json({
        error: 'The document could not be read even after OCR. Upload a clearer searchable PDF or UTF-8 text file; this document was not indexed.',
      })
      return
    }
    const document = await GuidelineDocument.create({
      title: request.body.title,
      issuingAuthority: request.body.issuingAuthority,
      officialUrl: request.body.officialUrl,
      jurisdiction: request.body.jurisdiction,
      publicationDate: request.body.publicationDate || null,
      reviewDate: parseDate(request.body.reviewDate, 'reviewDate'),
      expiryDate: parseDate(request.body.expiryDate, 'expiryDate'),
      effectiveStatus: 'pending',
      checksum,
      fileName: request.file.originalname,
      mimeType: request.file.mimetype,
      extractionStatus: 'readable',
      extractionMethod,
      rawText,
      chunks: chunkText(pages),
      uploadedBy: request.user._id,
    })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'guideline.upload',
      targetType: 'GuidelineDocument',
      targetId: document._id,
      newStatus: document.status,
      changes: { checksum, fileName: document.fileName, mimeType: document.mimeType },
    })
    response.status(201).json({ id: document._id, status: document.status, chunks: document.chunks.length })
  } catch (error) {
    if (error.code === 11000) {
      response.status(409).json({ error: 'This document has already been uploaded' })
      return
    }
    if (error.message?.endsWith('must be a valid date')) {
      response.status(400).json({ error: error.message })
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
    const previous = await GuidelineDocument.findById(request.params.id).select('status')
    if (!previous) {
      response.status(404).json({ error: 'Guideline not found' })
      return
    }
    const document = await GuidelineDocument.findByIdAndUpdate(
      request.params.id,
      {
        status,
        effectiveStatus: status === 'approved' ? 'active' : status === 'inactive' ? 'expired' : 'pending',
        approvedBy: status === 'approved' ? request.user._id : null,
        approvedAt: status === 'approved' ? new Date() : null,
      },
      { new: true },
    ).select('-rawText -chunks')
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'guideline.status',
      targetType: 'GuidelineDocument',
      targetId: document._id,
      oldStatus: previous.status,
      newStatus: status,
      reason: request.body.reason || '',
    })

    response.json(document)
  } catch (error) {
    next(error)
  }
})

router.delete('/guidelines/:id', ...requireAdmin, async (request, response, next) => {
  try {
    const document = await GuidelineDocument.findById(request.params.id).select('title status')
    if (!document) {
      response.status(404).json({ error: 'Guideline not found' })
      return
    }
    const confirmationEmail = String(request.body.confirmationEmail || '').trim().toLowerCase()
    const confirmationTitle = String(request.body.confirmationTitle || '').trim()
    if (!/^[^@\s]+@gmail\.com$/i.test(confirmationEmail) || confirmationEmail !== String(request.user.email || '').trim().toLowerCase()) {
      response.status(403).json({ error: 'Enter the signed-in administrator Gmail address exactly to delete this document' })
      return
    }
    if (confirmationTitle !== document.title) {
      response.status(400).json({ error: 'Enter the exact document title to confirm deletion' })
      return
    }
    await GuidelineDocument.deleteOne({ _id: document._id })
    await recordAuditEvent({
      request,
      actor: request.user._id,
      action: 'guideline.delete',
      targetType: 'GuidelineDocument',
      targetId: document._id,
      oldStatus: document.status,
      reason: `Confirmed by ${confirmationEmail}`,
    })
    response.json({ deleted: true })
  } catch (error) {
    next(error)
  }
})

router.get('/audit', ...requireAdmin, async (request, response, next) => {
  try {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200)
    response.json(await AuditEvent.find().sort({ createdAt: -1 }).limit(limit).populate('actor', 'name email').lean())
  } catch (error) {
    next(error)
  }
})

export default router
