import express from 'express'
import mongoose from 'mongoose'
import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'
import LoadSearchReport from '../models/LoadSearchReport.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'
import {
  defaultLoadStops,
  deriveStopSummary,
  firstErrorMessage,
  isPostedLoad,
  recalculateFinancials,
  resolvedEquipmentType,
  validateLoadDraft,
  validateLoadPost,
} from '../utils/loadValidation.js'
import { defaultLoadDocuments, ensureLoadDocuments } from '../utils/loadDocuments.js'
import { buildLoadDocumentPdf, pdfFilename } from '../utils/loadPdf.js'
import { upsertLoadBillingRecords } from '../utils/loadBilling.js'
import { LOAD_DOCS_UPLOAD_DIR, uploadLoadDocument } from '../middleware/uploadLoadDocs.js'
import { sendMail } from '../utils/mailer.js'
import {
  andFilter,
  escapeRegex,
  listResponse,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'
import CprRequest from '../models/CprRequest.js'
import Department from '../models/Department.js'
import { cprSummaryFromRequest, notifyCprReviewers } from '../utils/cpr.js'
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
  delete rest.draft
  const loadStatus = rest.loadStatus || 'Pending'
  const id = rest.id || `LD-${Date.now()}`
  const equipmentType = resolvedEquipmentType(rest)
  return {
    ...rest,
    id,
    tab: rest.tab || tabFromLoadStatus(loadStatus, 'planning'),
    loadStatus,
    truckStatus: rest.truckStatus || '',
    customer: rest.customer || '',
    carrier: rest.carrier || '',
    driver: rest.driver || '',
    equipment: equipmentType,
    equipmentType,
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
    cprStatus: rest.cprStatus || 'NONE',
    cprRequestId: rest.cprRequestId || null,
    cprRequestedAt: rest.cprRequestedAt || null,
    cprApprovedAt: rest.cprApprovedAt || null,
    cprReviewedAt: rest.cprReviewedAt || null,
    cprReviewedByName: rest.cprReviewedByName || '',
    isDraft: true,
    postedAt: null,
    postedBy: '',
    updatedBy: userId,
    quantity: rest.quantity || '',
    weightUnit: rest.weightUnit || 'lbs',
    commodityDescription: rest.commodityDescription || '',
  }
}

function mergeLoadData(existing, payload = {}) {
  const current = typeof existing.toObject === 'function' ? existing.toObject() : { ...existing }
  const next = { ...current, ...(payload || {}) }
  delete next._id
  delete next.draft
  next.id = existing.id
  const money = recalculateFinancials(next, current)
  const stops = deriveStopSummary(next, current)
  const equipmentType = resolvedEquipmentType(next)
  return {
    ...next,
    ...money,
    ...stops,
    equipment: equipmentType,
    equipmentType,
  }
}

function postedFields(user) {
  return {
    isDraft: false,
    loadStatus: 'Posted Loads',
    tab: 'externally-posted',
    errorMessage: '',
    postedAt: new Date(),
    postedBy: user?._id ? String(user._id) : '',
    updatedBy: user?._id ? String(user._id) : '',
  }
}

function validationResponse(errors, statusMessage) {
  return {
    success: false,
    message: statusMessage || firstErrorMessage(errors),
    errors,
  }
}

function duplicateLoadResponse() {
  return {
    success: false,
    message: 'A load with this number already exists.',
    errors: { id: 'A load with this number already exists.' },
  }
}

function isDuplicateKeyError(error) {
  return Boolean(error && (error.code === 11000 || error.code === '11000'))
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
    const docs = await Load.find({ ...scope, id: { $in: ids } })
    const failed = []
    let postedCount = 0
    let skippedCount = 0

    if (action === 'post' || action === 'repost') {
      for (const existing of docs) {
        if (isPostedLoad(existing)) {
          skippedCount += 1
          continue
        }
        const merged = mergeLoadData(existing, {})
        const errors = validateLoadPost(merged, existing)
        if (Object.keys(errors).length) {
          existing.errorMessage = firstErrorMessage(errors)
          await existing.save()
          failed.push({ id: existing.id, message: existing.errorMessage, errors })
          continue
        }
        Object.assign(existing, merged, postedFields(req.user))
        ensureLoadDocuments(existing)
        await existing.save()
        await upsertLoadBillingRecords(existing)
        postedCount += 1
        await logActivity({
          req,
          action: 'Load Posted',
          description: `Load #${existing.id} posted`,
          type: 'success',
          module: 'Loads',
        })
      }
    } else {
      let set = {}
      if (action === 'unpost') {
        set = { loadStatus: 'Pending', tab: 'planning', isDraft: true, errorMessage: '' }
      } else if (action === 'clearErrors') {
        set = { errorMessage: '' }
      } else if (action === 'archive') {
        set = { archived: true, loadStatus: 'Archived', tab: 'misc', isDraft: false }
      } else if (action === 'cancel') {
        set = { loadStatus: 'Cancelled', tab: 'misc', isDraft: false }
      } else if (action === 'update') {
        set = { ...updates, updatedBy: String(req.user._id) }
      } else {
        return res.status(400).json({ success: false, message: 'Unknown bulk action' })
      }
      await Load.updateMany({ ...scope, id: { $in: ids } }, { $set: set })
    }

    const loads = await Load.find(scope).sort({ createdAt: -1 })
    res.json({
      success: true,
      data: loads.map(serialize),
      postedCount,
      skippedCount,
      failed,
      modifiedCount: action === 'post' || action === 'repost' ? postedCount : docs.length,
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

function loadTabFilter(tabId, user) {
  if (!tabId || tabId === 'all') return {}
  if (tabId === 'my') {
    const ids = valuesFor(user._id)
    return { $or: [{ assignedUserId: { $in: ids } }, { createdBy: { $in: ids } }] }
  }
  const patterns = {
    active: /ready|driver assigned|dispatched|transit|watch|claim|delivered/i,
    planning: /new|open|planning|pending|needs carrier|needs driver|booked/i,
    'externally-posted': /post/i,
    accounting: /invoice/i,
    misc: /cancel|archiv|complet/i,
    ltl: /ltl/i,
  }
  const pattern = patterns[tabId]
  if (pattern) return { $or: [{ tab: tabId }, { loadStatus: pattern }] }
  return { tab: tabId }
}

function loadStatusFilter(status) {
  if (!status) return {}
  if (status === 'Posted Loads') {
    return { $or: [{ loadStatus: /post/i }, { tab: 'externally-posted' }] }
  }
  return { loadStatus: new RegExp(`^${escapeRegex(status)}$`, 'i') }
}

const LOAD_LIST_SELECT =
  'id tab loadStatus isDraft lastContact customer picks pickDate drops dropDate usersRoles carrier driver equipment powerUnit income expenses reference postedRate assignedUserId createdBy createdAt departmentId'

router.get('/', async (req, res, next) => {
  try {
    const list = parseListQuery(req.query, { defaultLimit: 50, maxLimit: 100 })
    const filter = andFilter(
      userScopeFilter(req.user),
      loadTabFilter(req.query.tab, req.user),
      loadStatusFilter(req.query.status),
      textSearch(['id', 'customer', 'carrier', 'picks', 'drops', 'reference', 'loadStatus'], list.search),
    )

    if (req.query.idsOnly) {
      const docs = await Load.find(filter).select('id').limit(5000).lean()
      return res.json({ success: true, data: docs.map((item) => item.id).filter(Boolean) })
    }

    const { items, total } = await paginateFind(Load, filter, {
      ...list,
      sort: { createdAt: -1 },
      select: list.paginate ? LOAD_LIST_SELECT : undefined,
    })
    res.json(listResponse(items.map(serialize), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const payload = createLoadDefaults(req.body || {}, req.user)
    Object.assign(payload, recalculateFinancials(payload), deriveStopSummary(payload))
    const errors = validateLoadDraft(payload)
    if (Object.keys(errors).length) {
      return res.status(400).json(validationResponse(errors))
    }
    const load = await Load.create(payload)
    await logActivity({
      req,
      action: 'Load Created',
      description: `New load #${load.id} created as draft${load.customer ? ` for ${load.customer}` : ''}`,
      type: 'create',
      module: 'Loads'
    })
    res.status(201).json({ success: true, data: serialize(load) })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json(duplicateLoadResponse())
    }
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

    const body = { ...(req.body || {}) }
    const requestedDraft = body.draft === true || body.isDraft === true
    delete body.draft
    delete body.isDraft
    delete body.postedAt
    delete body.postedBy
    const alreadyPosted = isPostedLoad(existing)
    const payload = mergeLoadData(existing, body)
    payload.updatedBy = String(req.user._id)
    const terminalStatus = /cancel|archiv|complet/i.test(String(payload.loadStatus || ''))

    if (alreadyPosted) {
      payload.isDraft = false
      payload.postedAt = existing.postedAt
      payload.postedBy = existing.postedBy
    } else if (terminalStatus) {
      payload.isDraft = false
      payload.postedAt = null
      payload.postedBy = ''
    } else {
      payload.isDraft = true
      payload.postedAt = null
      payload.postedBy = ''
      if (String(payload.loadStatus || '').toLowerCase().includes('post')) {
        const previous = String(existing.loadStatus || '')
        payload.loadStatus = previous.toLowerCase().includes('post') ? 'Pending' : (previous || 'Pending')
        payload.tab = tabFromLoadStatus(payload.loadStatus, 'planning')
      }
    }

    const errors = alreadyPosted
      ? validateLoadPost(payload, existing)
      : validateLoadDraft(payload, existing)
    if (Object.keys(errors).length) {
      return res.status(400).json(validationResponse(errors))
    }

    const draftSave = requestedDraft && !alreadyPosted
    if (!payload.tab && payload.loadStatus) {
      payload.tab = tabFromLoadStatus(payload.loadStatus, existing.tab)
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
    } else if (draftSave) {
      await logActivity({
        req,
        action: 'Draft Saved',
        description: `Draft saved for load #${load.id}`,
        type: 'update',
        module: 'Loads',
      })
    }
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json(duplicateLoadResponse())
    }
    next(error)
  }
})

router.post('/:id/post', async (req, res, next) => {
  try {
    const existing = await Load.findOne(mergeFilter(byPublicId(req.params.id), userScopeFilter(req.user)))
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Load not found' })
    }
    if (isPostedLoad(existing)) {
      return res.status(409).json(validationResponse(
        { loadStatus: 'This load is already posted.' },
        'This load is already posted.',
      ))
    }

    const body = { ...(req.body || {}) }
    delete body.draft
    delete body.isDraft
    delete body.postedAt
    delete body.postedBy
    delete body._id
    const payload = mergeLoadData(existing, body)
    const errors = validateLoadPost(payload, existing)
    if (Object.keys(errors).length) {
      return res.status(400).json(validationResponse(errors))
    }

    Object.assign(existing, payload, postedFields(req.user))
    ensureLoadDocuments(existing)
    const load = await existing.save()
    await upsertLoadBillingRecords(load)
    await logActivity({
      req,
      action: 'Load Posted',
      description: `Load #${load.id} posted${load.customer ? ` for ${load.customer}` : ''}`,
      type: 'success',
      module: 'Loads',
    })
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

function serializeDocumentsPayload(load, cpr = null) {
  const details = load.customerDetails || {}
  const carrier = load.carrierDetails || {}
  const cprRequest = cprSummaryFromRequest(cpr, load)
  return {
    loadId: load.id,
    customer: load.customer || '',
    carrier: load.carrier || '',
    driver: load.driver || carrier.drivers || '',
    driverPhone: carrier.phone || '',
    customerEmail: details.contactEmail || details.email || '',
    customerContact: details.contactName || details.contact || '',
    carrierEmail: carrier.email || carrier.contactEmail || '',
    carrierContact: carrier.contactName || carrier.contact || load.carrier || '',
    loadStatus: load.loadStatus || '',
    paperworkOk: Boolean(load.paperworkOk),
    documents: load.documents || [],
    emailHistory: load.emailHistory || [],
    documentRequests: load.documentRequests || [],
    lastContact: load.lastContact || '',
    cprStatus: cprRequest.status || 'NONE',
    cprRequest,
  }
}

async function latestCprForLoad(load, paramId) {
  const ids = [
    paramId,
    load?.id,
    typeof load?.get === 'function' ? load.get('id') : null,
    load?._id,
  ]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean)
  const unique = [...new Set(ids)]
  if (!unique.length) return null
  return CprRequest.findOne({ loadId: { $in: unique } }).sort({ updatedAt: -1, createdAt: -1 })
}

async function resolveDocumentFile(load, doc) {
  if (doc.storedName) {
    const filePath = path.join(LOAD_DOCS_UPLOAD_DIR, path.basename(doc.storedName))
    if (fs.existsSync(filePath)) {
      return {
        buffer: await fs.promises.readFile(filePath),
        mimeType: doc.mimeType || 'application/octet-stream',
        filename: doc.originalName || doc.name || 'document',
      }
    }
    if (doc.source === 'Uploaded' || doc.defaulted === false) return null
  }
  const buffer = await buildLoadDocumentPdf(load, doc)
  return {
    buffer,
    mimeType: 'application/pdf',
    filename: pdfFilename(doc, load),
  }
}

router.get('/:id/documents', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    const beforeCount = (load.documents || []).length
    ensureLoadDocuments(load)
    if (load.isModified?.('documents') || (load.documents || []).length !== beforeCount) {
      load.markModified?.('documents')
      await load.save()
    }
    const cpr = await latestCprForLoad(load, req.params.id)
    res.json({ success: true, data: serializeDocumentsPayload(load, cpr) })
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
    ensureLoadDocuments(load)
    const doc = (load.documents || []).find((item) => String(item.id) === String(req.params.docId))
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' })
    const file = await resolveDocumentFile(load, doc)
    if (!file) {
      return res.status(404).json({ success: false, message: 'No file is attached to this document' })
    }
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Length', String(file.buffer.length))
    res.end(file.buffer)
  } catch (error) {
    next(error)
  }
})

router.post('/:id/documents/:docId/email', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })
    ensureLoadDocuments(load)
    const extraIds = Array.isArray(req.body?.documentIds) ? req.body.documentIds.map(String) : []
    const docIds = [...new Set([String(req.params.docId), ...extraIds].filter(Boolean))]
    const docs = (load.documents || []).filter((item) => docIds.includes(String(item.id)))
    if (!docs.length) return res.status(404).json({ success: false, message: 'Document not found' })

    if (String(load.cprStatus || '').toUpperCase() !== 'APPROVED') {
      const cpr = await latestCprForLoad(load, req.params.id)
      if (String(cpr?.status || '').toUpperCase() !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          message: 'Email documents is available after the CPR request is approved.',
        })
      }
    }

    const recipientRows = Array.isArray(req.body?.recipients) ? req.body.recipients : []
    const toFromRows = recipientRows
      .filter((row) => row && row.send !== false && String(row.email || '').trim())
      .map((row) => String(row.email).trim())
    const to = toFromRows.length
      ? toFromRows.join(', ')
      : String(req.body?.to || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .join(', ')
    if (!to) return res.status(400).json({ success: false, message: 'Recipient email is required' })

    const company = 'AP FREIGHT INC'
    const subject = String(req.body?.subject || `Document(s) from ${company}`).trim()
    const attachedNames = docs.map((doc) => doc.name).join('\n')
    const message = String(
      req.body?.message ||
        `Hello!\n\nPlease respond to this email if you do not receive, are unable to open, or have any questions about the attached file(s).\n\nAttached Documents:\n${attachedNames}\n\nThanks,\n${company}`,
    ).trim()

    const attachments = []
    for (const doc of docs) {
      const file = await resolveDocumentFile(load, doc)
      if (file) {
        attachments.push({
          filename: file.filename,
          content: file.buffer,
          contentType: file.mimeType || 'application/pdf',
        })
      }
    }
    if (!attachments.length) {
      return res.status(400).json({ success: false, message: 'No PDF could be generated for the selected documents.' })
    }

    const senderName = req.user.name || req.user.email || 'AP Freight'
    const result = await sendMail({
      to,
      subject,
      text: message,
      attachments,
      fromName: `${senderName} (${company})`,
    })
    if (result.skipped || result.sent === false) {
      return res.status(502).json({
        success: false,
        message: result.message || result.error || 'Unable to send this email.',
      })
    }

    const entry = {
      id: `EM-${Date.now()}`,
      to,
      subject,
      message,
      documentId: docs[0].id,
      documentIds: docs.map((doc) => doc.id),
      documentName: docs.map((doc) => doc.name).join(', '),
      sentAt: new Date().toISOString(),
      sentBy: senderName,
    }
    load.emailHistory = [...(load.emailHistory || []), entry]
    load.lastContact = `Emailed ${new Date().toLocaleDateString()}`
    await load.save()
    await logActivity({
      req,
      action: 'Document Emailed',
      description: `${entry.documentName} emailed for load #${load.id} to ${to}`,
      type: 'info',
      module: 'Loads',
    })
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
    ensureLoadDocuments(load)
    await load.save()
    await upsertLoadBillingRecords(load)
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

router.post('/:id/cpr-request', async (req, res, next) => {
  try {
    const load = await findScopedLoad(req)
    if (!load) return res.status(404).json({ success: false, message: 'Load not found' })

    const currentStatus = String(load.cprStatus || 'NONE').toUpperCase()
    if (currentStatus === 'PENDING') {
      return res.status(400).json({ success: false, message: 'A CPR request is already pending for this load.' })
    }
    if (currentStatus === 'APPROVED') {
      return res.status(400).json({ success: false, message: 'CPR is already approved for this load.' })
    }

    const pending = await CprRequest.findOne({ loadId: load.id, status: 'PENDING' })
    if (pending) {
      return res.status(400).json({ success: false, message: 'A CPR request is already pending for this load.' })
    }

    let departmentName = ''
    let departmentCode = load.departmentCode || req.user.department || ''
    if (req.user.departmentId) {
      const department = await Department.findById(req.user.departmentId).lean()
      departmentName = department?.displayName || department?.name || ''
      departmentCode = department?.code || departmentCode
    }

    const documentNames = (load.documents || []).map((doc) => doc.name).filter(Boolean)
    const notes = String(req.body?.notes || '').trim()
    const request = await CprRequest.create({
      loadId: load.id,
      loadMongoId: load._id,
      customer: load.customer || '',
      carrier: load.carrier || '',
      documentNames,
      requesterId: req.user._id,
      requesterName: req.user.name || '',
      requesterEmail: req.user.email || '',
      departmentId: req.user.departmentId || null,
      departmentCode,
      departmentName,
      status: 'PENDING',
      notes,
    })

    load.cprStatus = 'PENDING'
    load.cprRequestId = request._id
    load.cprRequestedAt = request.createdAt
    load.cprReviewedAt = null
    load.cprApprovedAt = null
    load.cprReviewedByName = ''
    await load.save()

    try {
      await notifyCprReviewers(request, req.user)
    } catch (notifyError) {
      console.error('CPR submit notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'CPR Requested',
      description: `${req.user.name || 'A user'} requested CPR approval for load ${load.id}`,
      type: 'info',
      module: 'Loads',
    })

    res.status(201).json({
      success: true,
      data: {
        requestId: request._id,
        ...cprSummaryFromRequest(request, load),
        status: 'PENDING',
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
