import fs from 'fs'
import path from 'path'
import multer from 'multer'

export const LOAD_DOCS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'load-docs')

fs.mkdirSync(LOAD_DOCS_UPLOAD_DIR, { recursive: true })

const allowed = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOAD_DOCS_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin'
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})

export const uploadLoadDocument = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (!allowed.has(ext)) {
      cb(new Error('This file type is not allowed'))
      return
    }
    cb(null, true)
  },
})
