import fs from 'fs'
import path from 'path'
import multer from 'multer'

export const PREPAID_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'prepaid')

fs.mkdirSync(PREPAID_UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PREPAID_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf'
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  }
})

export const uploadPrepaidPdfs = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (file.mimetype !== 'application/pdf' && ext !== '.pdf') {
      cb(new Error('Only PDF files are allowed'))
      return
    }
    cb(null, true)
  }
})
