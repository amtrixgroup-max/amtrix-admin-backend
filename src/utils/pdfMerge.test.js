import PDFDocument from 'pdfkit'
import { PDFDocument as PdfLibDocument } from 'pdf-lib'
import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentFilename, mergePdfBuffers } from './pdfMerge.js'

function tinyPdf(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER' })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.fontSize(12).text(text)
    doc.end()
  })
}

test('mergePdfBuffers concatenates pages from each PDF', async () => {
  const first = await tinyPdf('Invoice')
  const second = await tinyPdf('BOL')
  const merged = await mergePdfBuffers([first, second], 'Packet')
  const loaded = await PdfLibDocument.load(merged)
  assert.equal(loaded.getPageCount(), 2)
  assert.ok(merged.slice(0, 5).toString() === '%PDF-')
})

test('attachmentFilename prepends the load number once', () => {
  assert.equal(attachmentFilename('BOL.pdf', '24882', true), '24882_BOL.pdf')
  assert.equal(attachmentFilename('24882_BOL.pdf', '24882', true), '24882_BOL.pdf')
  assert.equal(attachmentFilename('invoice', '24882', false), 'invoice.pdf')
})
