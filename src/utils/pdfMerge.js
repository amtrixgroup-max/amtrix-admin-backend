import { PDFDocument } from 'pdf-lib'

export async function mergePdfBuffers(buffers = [], title = 'Combined Invoice Packet') {
  const merged = await PDFDocument.create()
  merged.setTitle(title)

  for (const buffer of buffers) {
    if (!buffer?.length) continue
    const source = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }

  if (merged.getPageCount() === 0) {
    throw new Error('No PDF pages were available to combine.')
  }

  return Buffer.from(await merged.save())
}

export function attachmentFilename(name, loadId, prependLoadNumber = false) {
  const raw = String(name || 'document.pdf').replace(/[^\w.\-]+/g, '_')
  const withExt = raw.toLowerCase().endsWith('.pdf') ? raw : `${raw}.pdf`
  const load = String(loadId || '').replace(/[^\w.-]+/g, '_')
  if (!prependLoadNumber || !load) return withExt
  if (withExt.toLowerCase().startsWith(`${load.toLowerCase()}_`)) return withExt
  return `${load}_${withExt}`
}
