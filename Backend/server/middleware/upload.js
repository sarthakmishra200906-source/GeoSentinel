import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'

export const uploadDirectory = path.resolve(process.cwd(), 'uploads')
fs.mkdirSync(uploadDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
  },
})

export const helpImageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true)
      return
    }
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'))
  },
})
