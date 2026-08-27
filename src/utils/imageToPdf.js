import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'

const CONVERTIBLE_EXTS = new Set(['.png', '.jpg', '.jpeg'])
const CONVERTIBLE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

export function isConvertibleImageUpload(file = {}) {
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  return CONVERTIBLE_EXTS.has(ext) || CONVERTIBLE_MIMES.has(mime)
}

export async function convertImageUploadToPdf(file, destDir) {
  if (!file?.path || !isConvertibleImageUpload(file)) return file

  const pdfName = `${path.basename(file.filename || path.basename(file.path), path.extname(file.filename || file.path))}.pdf`
  const pdfPath = path.join(destDir, pdfName)

  try {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 36 })
      const stream = fs.createWriteStream(pdfPath)
      stream.on('finish', resolve)
      stream.on('error', reject)
      doc.on('error', reject)
      doc.pipe(stream)
      const width = doc.page.width - 72
      const height = doc.page.height - 72
      doc.image(file.path, 36, 36, { fit: [width, height], align: 'center', valign: 'center' })
      doc.end()
    })
    await fs.promises.unlink(file.path).catch(() => {})
    const stats = await fs.promises.stat(pdfPath)
    const base = path.parse(file.originalname || 'document').name
    return {
      fieldname: file.fieldname,
      filename: pdfName,
      path: pdfPath,
      mimetype: 'application/pdf',
      size: stats.size,
      originalname: `${base}.pdf`,
    }
  } catch {
    await fs.promises.unlink(pdfPath).catch(() => {})
    return file
  }
}
