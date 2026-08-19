import express from 'express'
import mongoose from 'mongoose'
import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'
import LoadSearchReport from '../models/LoadSearchReport.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'
import { defaultLoadStops, reeferTemperatureError } from '../utils/loadValidation.js'
import { defaultLoadDocuments, ensureLoadDocuments } from '../utils/loadDocuments.js'
import { LOAD_DOCS_UPLOAD_DIR, uploadLoadDocument } from '../middleware/uploadLoadDocs.js'
import { sendMail } from '../utils/mailer.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()
router.use(authenticate)

const isSuperAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN'

function serialize(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return { ...obj, id: obj.id || String(obj._id) }
}

function byPublicId(id) {
  if (mongoose.isValidObjectId(id) && String(id).length === 24) {
    return { $or: [{ id }, { _id: id }] }
  }
  return { id }
}

function mergeFilter(...filters) {
  const parts = filters.filter((item) => item && Object.keys(item).length)
  if (!parts.length) return {}
  if (parts.length === 1) return parts[0]
  return { $and: parts }
}

function valuesFor(value) {
  if (value == null || value === '') return []
  const str = String(value)
  const values = [str]
  if (mongoose.isValidObjectId(str) && str.length === 24) {
    values.push(new mongoose.Types.ObjectId(str))
  }
  return values
}

function tabFromLoadStatus(status, fallback = 'planning') {
  const value = String(status || '').toLowerCase()
  if (value.includes('invoice')) return 'accounting'
  if (value.includes('post')) return 'externally-posted'
  if (
    value.includes('ready') ||
    value.includes('driver assigned') ||
    value === 'dispatched' ||
    value.includes('transit') ||
    value === 'watch' ||
    value.includes('claim') ||
    value === 'delivered'
  ) {
    return 'active'
  }
  if (value === 'cancelled' || value === 'archived' || value === 'completed') return 'misc'
  if (
    value === 'new' ||
    value === 'open' ||
    value === 'planning' ||
    value === 'pending' ||
    value.includes('needs carrier') ||
    value.includes('needs driver') ||
    value.includes('booked')
  ) {
    return 'planning'
  }
  if (value.includes('ltl')) return 'ltl'
  return fallback || 'planning'
}

function userScopeFilter(user) {
  if (isSuperAdmin(user)) return {}
  const userIds = valuesFor(user._id)
  const departmentIds = valuesFor(user.departmentId)
  const or = [
    { createdBy: { $in: userIds } },
    { assignedUserId: { $in: userIds } },
    { createdBy: { $exists: false } },
    { createdBy: '' },
    { createdBy: null },
  ]
  if (departmentIds.length) or.push({ departmentId: { $in: departmentIds } })
  return { $or: or }
}

function createLoadDefaults(payload = {}, user = null) {
  const now = new Date()
  const userId = user?._id ? String(user._id) : ''
  const rest = { ...(payload || {}) }
  delete rest._id
  const loadStatus = rest.loadStatus || 'Pending'
  const id = rest.id || `LD-${Date.now()}`
  return {
    ...rest,
    id,
    tab: rest.tab || tabFromLoadStatus(loadStatus, 'planning'),
    loadStatus,
    truckStatus: rest.truckStatus || '',
    customer: rest.customer || '',
    carrier: rest.carrier || '',
    driver: rest.driver || '',
    equipment: rest.equipment || rest.equipmentType || '',
    equipmentType: rest.equipmentType || rest.equipment || '',
    equipmentLength: rest.equipmentLength || '',
    powerUnit: rest.powerUnit || '',
    picks: rest.picks || '',
    drops: rest.drops || '',
    pickDate: rest.pickDate || null,
    dropDate: rest.dropDate || null,
    reference: rest.reference || rest.loadReference || '',
    loadReference: rest.loadReference || rest.reference || '',
    postedRate: rest.postedRate || 0,
    income: rest.income || 0,
    expenses: rest.expenses || 0,
    usersRoles: rest.usersRoles || '',
    branch: rest.branch || 'Shared',
    assignedUserId: rest.assignedUserId ? String(rest.assignedUserId) : userId,
    createdBy: userId,
    departmentId: rest.departmentId || (user?.departmentId ? String(user.departmentId) : ''),
    creationDate: rest.creationDate || now.toISOString().slice(0, 10),
    commodity: rest.commodity || '',
    loadSize: rest.loadSize || 'full',
    goodsCondition: rest.goodsCondition || 'new',
    customerDetails: rest.customerDetails || {},
    carrierDetails: rest.carrierDetails || {},
    temperature: rest.temperature || '',
    lowerTemp: rest.lowerTemp || '',
    upperTemp: rest.upperTemp || '',
    stops: Array.isArray(rest.stops) && rest.stops.length ? rest.stops : defaultLoadStops(),
    incomeLines: rest.incomeLines || [],
    expenseLines: rest.expenseLines || [],
    errorMessage: rest.errorMessage || '',
    archived: Boolean(rest.archived),
    postedBoards: rest.postedBoards || [],
    documents: Array.isArray(rest.documents) && rest.documents.length ? rest.documents : defaultLoadDocuments(id),
    paperworkOk: Boolean(rest.paperworkOk),
    emailHistory: rest.emailHistory || [],
    documentRequests: rest.documentRequests || [],
    lastContact: rest.lastContact || '',
  }
}

function matchesBoardSearch(load, query = {}) {
  const status = String(load.loadStatus || '').toLowerCase()
  if (!status.includes('post') && load.tab !== 'externally-posted') return false

  const origin = String(query.origin || '').trim().toLowerCase()
  const destination = String(query.destination || '').trim().toLowerCase()
  const equipment = Array.isArray(query.equipment)
    ? query.equipment
    : String(query.equipment || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
  const loadType = String(query.loadType || 'both')
  const dateFrom = query.dateFrom ? String(query.dateFrom) : ''
  const dateTo = query.dateTo ? String(query.dateTo) : ''

  const picks = String(load.picks || '').toLowerCase()
  const drops = String(load.drops || '').toLowerCase()
  if (query.originMode !== 'anywhere' && origin && !picks.includes(origin)) return false
  if (query.destinationMode !== 'anywhere' && destination && !drops.includes(destination)) return false
  if (equipment.length) {
    const eq = String(load.equipment || load.equipmentType || '').toLowerCase()
    if (!equipment.some((item) => eq.includes(String(item).toLowerCase()))) return false
  }
  if (loadType === 'full' && load.loadSize && load.loadSize !== 'full') return false
  if (loadType === 'partial' && load.loadSize && load.loadSize !== 'partial') return false
  if (dateFrom && load.pickDate && String(load.pickDate).slice(0, 10) < dateFrom) return false
  if (dateTo && load.pickDate && String(load.pickDate).slice(0, 10) > dateTo) return false
  return true
}

router.get('/templates', async (req, res, next) => {
  try {
    const templates = await LoadTemplate.find().sort({ createdAt: -1 })
    res.json({ success: true, data: templates.map(serialize) })
  } catch (error) {
    next(error)
  }
})

router.post('/templates', async (req, res, next) => {
  try {
    const payload = req.body || {}
    const template = await LoadTemplate.create({
      ...payload,
      id: payload.id || `TPL-${Date.now()}`,
      templateName: payload.templateName || 'Untitled template',
      branch: payload.branch || 'Shared',
      assignedUserId: payload.assignedUserId || String(req.user._id),
      createdBy: String(req.user._id),
    })
    res.status(201).json({ success: true, data: serialize(template) })
  } catch (error) {
    next(error)
  }
})

router.put('/templates/:id', async (req, res, next) => {
  try {
    const existing = await LoadTemplate.findOne(byPublicId(req.params.id))
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Template not found' })
    }
    const payload = { ...(req.body || {}) }
    delete payload._id
    const template = await LoadTemplate.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
    res.json({ success: true, data: serialize(template) })
  } catch (error) {
    next(error)
  }
})

router.delete('/templates/:id', async (req, res, next) => {
  try {
    const existing = await LoadTemplate.findOne(byPublicId(req.params.id))
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Template not found' })
    }
    await LoadTemplate.deleteOne({ _id: existing._id })
    res.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    next(error)
  }
})

router.get('/reports', async (req, res, next) => {
  try {
    const reports = await LoadSearchReport.find({
      $or: [{ userId: req.user._id }, { userId: null }],
    }).sort({ createdAt: -1 })
    res.json({ success: true, data: reports.map(serialize) })
  } catch (error) {
    next(error)
  }
})

router.post('/reports', async (req, res, next) => {
  try {
    const report = await LoadSearchReport.create({
      name: req.body?.name || `Report ${new Date().toISOString().slice(0, 10)}`,
      userId: req.user._id,
      criteria: req.body?.criteria || {},
    })
    res.status(201).json({ success: true, data: serialize(report) })
  } catch (error) {
    next(error)
  }
})

router.post('/bulk', async (req, res, next) => {
  try {
    const { action, ids = [], updates = {} } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'No load ids provided' })
    }
    const scope = userScopeFilter(req.user)
    const filter = {
      ...scope,
      ...(ids.length ? { id: { $in: ids } } : {}),
    }
    let set = {}
    if (action === 'repost') {
      set = { loadStatus: 'Posted Loads', tab: 'externally-posted', errorMessage: '' }
    } else if (action === 'unpost') {
      set = { loadStatus: 'Planning', tab: 'planning' }
    } else if (action === 'clearErrors') {
      set = { errorMessage: '' }
    } else if (action === 'archive') {
      set = { archived: true, loadStatus: 'Archived', tab: 'misc' }
    } else if (action === 'cancel') {
      set = { loadStatus: 'Cancelled', tab: 'misc' }
    } else if (action === 'update') {
      set = updates
    } else {
      return res.status(400).json({ success: false, message: 'Unknown bulk action' })
    }

    const result = await Load.updateMany(filter, { $set: set })
    const loads = await Load.find(scope).sort({ createdAt: -1 })
    res.json({
      success: true,
      data: loads.map(serialize),
      modifiedCount: result.modifiedCount || 0,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/board-search', async (req, res, next) => {
  try {
    const loads = await Load.find(userScopeFilter(req.user)).sort({ createdAt: -1 })
    const matched = loads.filter((load) => matchesBoardSearch(load, req.query)).map(serialize)
    res.json({ success: true, data: matched })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const loads = await Load.find(userScopeFilter(req.user)).sort({ createdAt: -1 })
    res.json({ success: true, data: loads.map(serialize) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const payload = createLoadDefaults(req.body || {}, req.user)
    const tempError = reeferTemperatureError(payload)
    if (tempError) {
      return res.status(400).json({ success: false, message: tempError })
    }
    const load = await Load.create(payload)
    await logActivity({
      req,
      action: 'Load Created',
      description: `New load #${load.id} created${load.customer ? ` for ${load.customer}` : ''}`,
      type: 'create',
      module: 'Loads'
    })
    res.status(201).json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const load = await Load.findOne(mergeFilter(byPublicId(req.params.id), userScopeFilter(req.user)))
    if (!load) {
      return res.status(404).json({ success: false, message: 'Load not found' })
    }
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await Load.findOne(mergeFilter(byPublicId(req.params.id), userScopeFilter(req.user)))
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Load not found' })
    }

    const payload = { ...(req.body || {}) }
    delete payload._id
    payload.id = existing.id
    const tempError = reeferTemperatureError(payload, existing)
    if (tempError) {
      return res.status(400).json({ success: false, message: tempError })
    }
    if (!payload.tab && payload.loadStatus) {
      payload.tab = tabFromLoadStatus(payload.loadStatus, existing.tab)
    }
    if (payload.incomeLines || payload.expenseLines) {
      payload.income = (payload.incomeLines || existing.incomeLines || []).reduce(
        (sum, line) => sum + Number(line.rate || 0) * Number(line.quantity || 0),
        payload.income || 0,
      )
      payload.expenses = (payload.expenseLines || existing.expenseLines || []).reduce(
        (sum, line) => sum + Number(line.rate || 0) * Number(line.quantity || 0),
        payload.expenses || 0,
      )
    }

    const load = await Load.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
    const status = String(load?.loadStatus || '').toLowerCase()
    const previousStatus = String(existing.loadStatus || '').toLowerCase()
    if (status && status !== previousStatus) {
      let action = 'Load Updated'
      let type = 'update'
      if (status.includes('deliver')) {
        action = 'Load Delivered'
        type = 'success'
      } else if (status.includes('cancel')) {
        action = 'Load Cancelled'
        type = 'warning'
      } else if (status.includes('invoice')) {
        action = 'Invoice Generated'
        type = 'info'
      }
      await logActivity({
        req,
        action,
        description: `Load #${load.id} ${status.includes('deliver') ? 'delivered' : status.includes('cancel') ? 'cancelled' : `updated to ${load.loadStatus}`}${load.customer ? ` for ${load.customer}` : ''}`,
        type,
        module: 'Loads'
      })
    }
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await Load.findOne(mergeFilter(byPublicId(req.params.id), userScopeFilter(req.user)))
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Load not found' })
    }
    await Load.deleteOne({ _id: existing._id })
    res.json({ success: true, message: 'Load deleted' })
  } catch (error) {
    next(error)
  }
})

async function findScopedLoad(req) {
  return Load.findOne(mergeFilter(byPublicId(req.params.id), userScopeFilter(req.user)))
}

function serializeDocumentsPayload(load) {
  return {
    loadId: load.id,
    customer: load.customer || '',
    carrier: load.carrier || '',
    driver: load.driver || load.carrierDetails?.drivers || '',
    driverPhone: load.carrierDetails?.phone || '',
    loadStatus: load.loadStatus || '',
    paperworkOk: Boolean(load.paperworkOk),
    documents: load.documents || [],
    emailHistory: load.emailHistory || [],
    documentRequests: load.documentRequests || [],
    lastContact: load.lastContact || '',
  }
}

router.get('/:id/documents', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const before = (load.documents || []).length
    ensureLoadDocuments(load)
    if ((load.documents || []).length !== before) await load.save()
    res.json({ success: true, data: serializeDocumentsPayload(load) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/documents', (req, res, next) => {
  uploadLoadDocument.single('file')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ success: false, message: error.message || 'Upload failed' })
    }
    try {
      const load = await findScopedLoad(req)
      if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
      ensureLoadDocuments(load)
      const body = req.body || {}
      const file = req.file
      const document = {
        id: `DOC-${Date.now()}`,
        name: String(body.name || file?.originalname || 'Uploaded document').trim(),
        documentTypes: String(body.documentTypes || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        description: body.description || '',
        source: 'Uploaded',
        defaulted: false,
        companyDocument: body.companyDocument === 'true' || body.companyDocument === true,
        status: 'Uploaded',
        attachedTo: load.id,
        storedName: file?.filename || '',
        originalName: file?.originalname || '',
        mimeType: file?.mimetype || '',
        size: file?.size || 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.name || req.user.email || '',
      }
      load.documents = [...(load.documents || []), document]
      await load.save()
      res.status(201).json({ success: true, data: document })
    } catch (err) {
      next(err)
    }
  })
})

router.put('/:id/documents/:docId', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const docs = load.documents || []
    const index = docs.findIndex((item) => String(item.id) === String(req.params.docId))
    if (index < 0) return res.status(404).json({ success: false, message: 'Document not found' })
    const body = req.body || {}
    const current = typeof docs[index].toObject === 'function' ? docs[index].toObject() : { ...docs[index] }
    docs[index] = {
      ...current,
      name: body.name != null ? String(body.name).trim() : current.name,
      documentTypes: Array.isArray(body.documentTypes)
        ? body.documentTypes
        : body.documentTypes != null
          ? String(body.documentTypes).split(',').map((item) => item.trim()).filter(Boolean)
          : current.documentTypes,
      description: body.description != null ? body.description : current.description,
      companyDocument: body.companyDocument != null ? Boolean(body.companyDocument) : current.companyDocument,
    }
    load.documents = docs
    await load.save()
    res.json({ success: true, data: docs[index] })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id/documents/:docId', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const docs = load.documents || []
    const doc = docs.find((item) => String(item.id) === String(req.params.docId))
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' })
    if (doc.storedName) {
      const filePath = path.join(LOAD_DOCS_UPLOAD_DIR, path.basename(doc.storedName))
      fs.promises.unlink(filePath).catch(() => {})
    }
    load.documents = docs.filter((item) => String(item.id) !== String(req.params.docId))
    await load.save()
    res.json({ success: true, message: 'Document deleted' })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/documents/:docId/file', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const doc = (load.documents || []).find((item) => String(item.id) === String(req.params.docId))
    if (!doc?.storedName) {
      return res.status(404).json({ success: false, message: 'No file is attached to this document' })
    }
    const filePath = path.join(LOAD_DOCS_UPLOAD_DIR, path.basename(doc.storedName))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName || doc.name}"`)
    res.sendFile(filePath)
  } catch (error) {
    next(error)
  }
})

router.post('/:id/documents/:docId/email', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const doc = (load.documents || []).find((item) => String(item.id) === String(req.params.docId))
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' })
    const to = String(req.body?.to || '').trim()
    if (!to) return res.status(400).json({ success: false, message: 'Recipient email is required' })
    const subject = String(req.body?.subject || `Load ${load.id} — ${doc.name}`).trim()
    const message = String(req.body?.message || `Please find ${doc.name} for load ${load.id}.`).trim()
    await sendMail({ to, subject, text: message })
    const entry = {
      id: `EM-${Date.now()}`,
      to,
      subject,
      message,
      documentId: doc.id,
      documentName: doc.name,
      sentAt: new Date().toISOString(),
      sentBy: req.user.name || req.user.email || '',
    }
    load.emailHistory = [...(load.emailHistory || []), entry]
    await load.save()
    res.json({ success: true, data: entry })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/paperwork-ok', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    load.paperworkOk = true
    load.paperworkOkAt = new Date().toISOString()
    load.paperworkOkBy = req.user.name || req.user.email || ''
    await load.save()
    await logActivity({
      req,
      action: 'Paperwork Marked OK',
      description: `Paperwork marked OK for load #${load.id}`,
      type: 'success',
      module: 'Loads',
    })
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/send-accounting', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    if (!load.paperworkOk) {
      return res.status(400).json({
        success: false,
        message: 'Mark paperwork OK before sending this load to accounting',
      })
    }
    load.tab = 'accounting'
    load.loadStatus = load.loadStatus?.toLowerCase().includes('invoice') ? load.loadStatus : 'To Be Billed'
    load.sentToAccountingAt = new Date().toISOString()
    await load.save()
    await logActivity({
      req,
      action: 'Sent to Accounting',
      description: `Load #${load.id} sent to accounting`,
      type: 'info',
      module: 'Loads',
    })
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/document-requests', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []
    const valid = recipients.filter((item) => String(item?.name || '').trim() && String(item?.phone || '').trim())
    if (!valid.length) {
      return res.status(400).json({ success: false, message: 'Add at least one recipient with a name and phone number' })
    }
    const request = {
      id: `REQ-${Date.now()}`,
      message: String(req.body?.message || '').trim() || `Please send completed load docs for ${load.id}.`,
      recipients: valid.map((item) => ({
        name: String(item.name).trim(),
        phone: String(item.phone).trim(),
      })),
      requestedAt: new Date().toISOString(),
      requestedBy: req.user.name || req.user.email || '',
      status: 'Sent',
    }
    load.documentRequests = [...(load.documentRequests || []), request]
    load.lastContact = `Docs requested ${new Date().toLocaleDateString()}`
    await load.save()
    res.status(201).json({ success: true, data: request })
  } catch (error) {
    next(error)
  }
})

export default router
