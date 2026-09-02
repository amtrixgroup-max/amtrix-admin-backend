import express from 'express'
import mongoose from 'mongoose'
import Invoice from '../models/Invoice.js'
import Load from '../models/Load.js'
import { authenticate } from '../middleware/auth.js'
import { serializeInvoice } from '../utils/invoiceAging.js'
import {
  ACCOUNTING_REQUIRED_DOCUMENTS,
  ensureLoadDocuments,
  invoiceShipperDocumentsMessage,
  uploadedDocumentForRequirement,
} from '../utils/loadDocuments.js'
import { resolveDocumentFile, resolveUploadedDocumentFile } from '../utils/loadDocumentFile.js'
import { documentKindFromDoc } from '../utils/loadPdf.js'
import { attachmentFilename, mergePdfBuffers } from '../utils/pdfMerge.js'
import { sendMail } from '../utils/mailer.js'
import { logActivity } from '../utils/activityLog.js'
import { buildAccountsDashboard } from '../utils/accountsDashboard.js'
import Role from '../models/Role.js'
import {
  andFilter,
  listResponse,
  mongoSort,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'

const router = express.Router()
router.use(authenticate)

const COMPANY = 'AP FREIGHT INC'

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

async function isAccountsUser(user) {
  if (!user) return false
  if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') {
    return false
  }
  if (user.roleId) {
    const role = await Role.findById(user.roleId).select('name displayName').lean()
    const name = normalizeRole(role?.name)
    const display = normalizeRole(role?.displayName)
    if (name === 'ACCOUNTS' || name === 'ACCOUNT' || display === 'ACCOUNTS' || display === 'ACCOUNT') {
      return true
    }
  }
  const fallback = normalizeRole(user.role)
  return fallback === 'ACCOUNTS' || fallback === 'ACCOUNT'
}

function isElevatedAccountingViewer(user) {
  return (
    user?.systemRole === 'SUPER_ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.systemRole === 'ADMIN'
  )
}

async function canAccessAccountsDashboard(user) {
  if (!user) return false
  if (isElevatedAccountingViewer(user)) return true
  return isAccountsUser(user)
}

function toList(docs) {
  return docs.map(serializeInvoice)
}

const AR_AP_SORT_FIELDS = {
  name: 'name',
  invoiceDate: 'invoiceDate',
  containerNumber: 'containerNumber',
  loadNumber: 'loadNumber',
  reference: 'reference',
  paymentTerms: 'paymentTerms',
  dueDate: 'dueDate',
  daysPastDue: 'dueDate',
  invoiceTotal: 'invoiceTotal',
  paid: 'paid',
  current: 'dueDate',
  pastDue0to29: 'dueDate',
  pastDue30: 'dueDate',
  pastDue60: 'dueDate',
  pastDue90: 'dueDate',
}

function accountingSort(raw, fallback) {
  const value = String(raw || '')
  const desc = value.startsWith('-')
  const requested = desc ? value.slice(1) : value
  const field = AR_AP_SORT_FIELDS[requested] || fallback
  return { [field]: desc ? -1 : 1, id: 1 }
}

function tabFilter(raw) {
  const tabs = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!tabs.length) return {}
  if (tabs.length === 1) return { tab: tabs[0] }
  return { tab: { $in: tabs } }
}

async function findInvoice(id) {
  const value = String(id || '').trim()
  if (!value) return null
  const query = [{ id: value }]
  if (mongoose.isValidObjectId(value) && value.length === 24) {
    query.push({ _id: value })
  }
  return Invoice.findOne({ $or: query })
}

function byPublicId(id) {
  const value = String(id || '').trim()
  if (!value) return null
  if (mongoose.isValidObjectId(value) && value.length === 24) {
    return { $or: [{ id: value }, { _id: value }] }
  }
  return { id: value }
}

function invoiceLookupTokens(value) {
  const raw = String(value || '').trim()
  if (!raw) return []
  const stripped = raw.replace(/^(INV|BILL|AR|AP|REC|ARCH)[-_]?/i, '')
  const tokens = [raw]
  if (stripped && stripped !== raw) {
    tokens.push(stripped, `LD-${stripped}`)
  }
  return tokens
}

async function findLoadForInvoice(invoice) {
  const candidates = [
    invoice?.loadNumber,
    ...invoiceLookupTokens(invoice?.invoiceNumber),
    invoice?.id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const unique = [...new Set(candidates)]
  for (const candidate of unique) {
    const filter = byPublicId(candidate)
    if (!filter) continue
    const load = await Load.findOne(filter)
    if (load) return load
  }

  const related = await Invoice.findOne({
    loadNumber: { $exists: true, $nin: [null, ''] },
    $or: [
      { invoiceNumber: invoice?.invoiceNumber },
      {
        companyName: invoice?.companyName,
        invoiceTotal: invoice?.invoiceTotal,
      },
    ],
  }).sort({ updatedAt: -1 })
  if (related?.loadNumber) {
    return Load.findOne(byPublicId(related.loadNumber))
  }
  return null
}

function loadContact(load) {
  const details = load?.customerDetails || {}
  const carrier = load?.carrierDetails || {}
  return {
    id: load?.id || '',
    customer: load?.customer || '',
    customerEmail: details.contactEmail || details.email || '',
    customerContact: details.contactName || details.contact || '',
    carrier: load?.carrier || '',
    carrierEmail: carrier.email || carrier.contactEmail || '',
    carrierContact: carrier.contactName || carrier.contact || load?.carrier || '',
    loadStatus: load?.loadStatus || '',
  }
}

function defaultRecipients(load, user) {
  const rows = []
  const seen = new Set()
  const add = (name, email, company, send = true) => {
    const value = String(email || '').trim()
    if (!value || seen.has(value.toLowerCase())) return
    seen.add(value.toLowerCase())
    rows.push({ name: name || '', email: value, company: company || COMPANY, send })
  }
  const contact = loadContact(load)
  add(contact.customerContact || contact.customer, contact.customerEmail, contact.customer)
  add(user?.name, user?.email, COMPANY, false)
  if (!rows.length) rows.push({ name: '', email: '', company: COMPANY, send: true })
  return rows
}

function supportingDocumentsPayload(load) {
  const documents = load?.documents || []
  return ACCOUNTING_REQUIRED_DOCUMENTS.map((item) => {
    const doc = uploadedDocumentForRequirement(documents, item.key)
    return {
      key: item.key,
      label: item.label,
      type: item.type,
      hint: item.hint,
      uploaded: Boolean(doc),
      document: doc
        ? {
            id: doc.id,
            name: doc.name,
            originalName: doc.originalName || '',
            uploadedAt: doc.uploadedAt || null,
          }
        : null,
    }
  })
}

function chosenRecipients(body) {
  const rows = Array.isArray(body?.recipients) ? body.recipients : []
  const fromRows = rows
    .filter((row) => row && row.send !== false && String(row.email || '').trim())
    .map((row) => String(row.email).trim())
  if (fromRows.length) return [...new Set(fromRows)]
  return String(body?.to || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function invoicePdfDoc(load) {
  const docs = load?.documents || []
  return (
    docs.find((doc) => documentKindFromDoc(doc) === 'invoice') || {
      key: 'invoice',
      name: 'Invoice',
      documentTypes: ['Invoice'],
    }
  )
}

async function buildInvoiceAttachments({ load, combinePdf, prependLoadNumber }) {
  const invoiceFile = await resolveDocumentFile(load, invoicePdfDoc(load))
  if (!invoiceFile?.buffer) {
    throw Object.assign(new Error('Unable to generate the invoice PDF.'), { status: 400 })
  }

  const supporting = []
  for (const item of ACCOUNTING_REQUIRED_DOCUMENTS) {
    const doc = uploadedDocumentForRequirement(load.documents || [], item.key)
    if (!doc) continue
    const file = await resolveUploadedDocumentFile(doc)
    if (!file?.buffer) {
      throw Object.assign(
        new Error(`The uploaded ${item.label} file could not be read. Upload it again.`),
        { status: 400 },
      )
    }
    supporting.push({
      ...file,
      filename: attachmentFilename(file.filename || `${item.label}.pdf`, load.id, prependLoadNumber),
      label: item.label,
    })
  }

  const invoiceName = attachmentFilename(
    invoiceFile.filename || `Invoice_${load.id}.pdf`,
    load.id,
    prependLoadNumber,
  )

  if (combinePdf) {
    const combined = await mergePdfBuffers(
      [invoiceFile.buffer, ...supporting.map((item) => item.buffer)],
      `Invoice ${load.id} packet`,
    )
    return [
      {
        filename: attachmentFilename(`Invoice_${load.id}_packet.pdf`, load.id, prependLoadNumber),
        content: combined,
        contentType: 'application/pdf',
        label: 'Invoice packet (combined PDF)',
      },
    ]
  }

  return [
    {
      filename: invoiceName,
      content: invoiceFile.buffer,
      contentType: invoiceFile.mimeType || 'application/pdf',
      label: 'Invoice',
    },
    ...supporting.map((item) => ({
      filename: item.filename,
      content: item.buffer,
      contentType: item.mimeType || 'application/pdf',
      label: item.label,
    })),
  ]
}

router.get('/dashboard', async (req, res, next) => {
  try {
    if (!(await canAccessAccountsDashboard(req.user))) {
      return res.status(403).json({ success: false, message: 'Accounts access required' })
    }
    const data = await buildAccountsDashboard({ user: req.user, year: req.query.year })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.get('/ar-ap', async (req, res, next) => {
  try {
    const filter = { recordKind: 'ar-ap' }
    const type = String(req.query.type || '').toUpperCase()
    if (type === 'AR' || type === 'AP') {
      filter.type = type
    }

    const list = parseListQuery(req.query, { defaultLimit: 10 })
    const queryFilter = andFilter(
      filter,
      textSearch(['name', 'companyName', 'invoiceNumber', 'loadNumber', 'reference', 'containerNumber'], list.search),
    )
    const { items, total } = await paginateFind(Invoice, queryFilter, {
      ...list,
      sort: accountingSort(req.query.sort, 'invoiceDate'),
    })
    res.json(listResponse(toList(items), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/invoices', async (req, res, next) => {
  try {
    const filter = { recordKind: 'management', ...tabFilter(req.query.tab) }
    if (req.query.sentStatus === 'Not Sent to Customer') {
      filter.sentStatus = { $in: ['Unsent', 'Not Sent to Customer'] }
    } else if (req.query.sentStatus === 'Not Factored') {
      filter.sentStatus = { $ne: 'Factored' }
    } else if (req.query.sentStatus) {
      filter.sentStatus = req.query.sentStatus
    }

    const list = parseListQuery(req.query, { defaultLimit: 10 })
    const queryFilter = andFilter(
      filter,
      textSearch(
        ['companyName', 'loadNumber', 'id', 'invoiceNumber', 'reference', 'sentStatus', 'pickAddress', 'dropAddress', 'loadStatus'],
        list.search,
      ),
    )
    const { items, total } = await paginateFind(Invoice, queryFilter, {
      ...list,
      sort: req.query.sort ? mongoSort(req.query.sort) : { deliveryDate: -1, id: 1 },
    })
    res.json(listResponse(toList(items), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/invoices/:id/email', async (req, res, next) => {
  try {
    const invoice = await findInvoice(req.params.id)
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })

    const load = await findLoadForInvoice(invoice)
    if (load) ensureLoadDocuments(load)

    const docs = load?.documents || []
    const missing = load
      ? invoiceShipperDocumentsMessage(docs)
      : 'This invoice is not linked to a load, so shipper documents cannot be attached.'
    const canSend = Boolean(load) && !invoiceShipperDocumentsMessage(docs)
    const invoiceNumber = invoice.invoiceNumber || invoice.id
    const loadId = load?.id || invoice.loadNumber || ''

    res.json({
      success: true,
      data: {
        invoice: serializeInvoice(invoice),
        load: load ? loadContact(load) : null,
        supportingDocuments: supportingDocumentsPayload(load),
        missingDocumentsMessage: missing,
        canSend,
        startStep: canSend ? 3 : 2,
        recipients: defaultRecipients(load, req.user),
        defaults: {
          combinePdf: true,
          prependLoadNumber: false,
          subject: `Invoice ${invoiceNumber}${loadId ? ` for load ${loadId}` : ''} from ${COMPANY}`,
          message: `Hello!\n\nPlease find the attached invoice${loadId ? ` for load ${loadId}` : ''}.\n\nRate Confirmation, BOL, and POD are included with this invoice.\n\nPlease respond to this email if you do not receive, are unable to open, or have any questions about the attached file(s).\n\nThanks,\n${COMPANY}`,
        },
      },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/invoices/:id/email', async (req, res, next) => {
  try {
    const invoice = await findInvoice(req.params.id)
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })

    const load = await findLoadForInvoice(invoice)
    if (!load) {
      return res.status(400).json({
        success: false,
        message: 'This invoice is not linked to a load. Open the load and upload shipper documents first.',
      })
    }

    ensureLoadDocuments(load)
    const paperworkMessage = invoiceShipperDocumentsMessage(load.documents || [])
    if (paperworkMessage) {
      return res.status(400).json({ success: false, message: paperworkMessage })
    }

    const toList = chosenRecipients(req.body || {})
    if (!toList.length) {
      return res.status(400).json({ success: false, message: 'Select at least one recipient with an email address.' })
    }

    const combinePdf = req.body?.combinePdf == null ? true : Boolean(req.body.combinePdf)
    const prependLoadNumber = Boolean(req.body?.prependLoadNumber)
    let attachments
    try {
      attachments = await buildInvoiceAttachments({ load, combinePdf, prependLoadNumber })
    } catch (error) {
      const status = error.status || 400
      return res.status(status).json({
        success: false,
        message: error.message || 'Unable to prepare the invoice attachments.',
      })
    }

    const invoiceNumber = invoice.invoiceNumber || invoice.id
    const subject = String(req.body?.subject || `Invoice ${invoiceNumber} from ${COMPANY}`).trim()
    const attachedNames = attachments.map((item) => item.label || item.filename).join('\n')
    const message = String(
      req.body?.message ||
        `Hello!\n\nPlease find the attached invoice for load ${load.id}.\n\nAttached Documents:\n${attachedNames}\n\nThanks,\n${COMPANY}`,
    ).trim()

    const senderName = req.user.name || req.user.email || 'AP Freight'
    const result = await sendMail({
      to: toList.join(', '),
      subject,
      text: message,
      attachments: attachments.map(({ filename, content, contentType }) => ({
        filename,
        content,
        contentType,
      })),
      fromName: `${senderName} (${COMPANY})`,
    })
    if (result.skipped || result.sent === false) {
      return res.status(502).json({
        success: false,
        message: result.message || result.error || 'Unable to send this email.',
      })
    }

    invoice.sentStatus = 'Sent to Customer'
    if (!invoice.invoiceDate) invoice.invoiceDate = new Date()
    await invoice.save()

    const entry = {
      id: `EM-${Date.now()}`,
      to: toList.join(', '),
      subject,
      message,
      documentName: attachments.map((item) => item.filename).join(', '),
      combinePdf,
      prependLoadNumber,
      sentAt: new Date().toISOString(),
      sentBy: senderName,
    }
    load.emailHistory = [...(load.emailHistory || []), entry]
    load.lastContact = `Emailed invoice ${new Date().toLocaleDateString()}`
    await load.save()
    await logActivity({
      req,
      action: 'Invoice Emailed',
      description: `Invoice ${invoiceNumber} emailed for load #${load.id} to ${entry.to}`,
      type: 'info',
      module: 'Accounting',
    })

    res.json({
      success: true,
      data: {
        ...entry,
        invoice: serializeInvoice(invoice),
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
