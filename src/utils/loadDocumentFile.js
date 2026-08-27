import fs from 'fs'
import path from 'path'
import { LOAD_DOCS_UPLOAD_DIR } from '../middleware/uploadLoadDocs.js'
import { buildLoadDocumentPdf, pdfFilename } from './loadPdf.js'

export async function resolveUploadedDocumentFile(doc = {}) {
  if (!doc.storedName) return null
  const filePath = path.join(LOAD_DOCS_UPLOAD_DIR, path.basename(doc.storedName))
  if (!fs.existsSync(filePath)) return null
  return {
    buffer: await fs.promises.readFile(filePath),
    mimeType: doc.mimeType || 'application/octet-stream',
    filename: doc.originalName || doc.name || 'document',
  }
}

export async function resolveDocumentFile(load, doc) {
  const uploaded = await resolveUploadedDocumentFile(doc)
  if (uploaded) return uploaded
  if (doc.source === 'Uploaded' || doc.defaulted === false) return null
  const buffer = await buildLoadDocumentPdf(load, doc)
  return {
    buffer,
    mimeType: 'application/pdf',
    filename: pdfFilename(doc, load),
  }
}
