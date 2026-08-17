import express from 'express'
import mongoose from 'mongoose'
import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'
import LoadSearchReport from '../models/LoadSearchReport.js'
import { authenticate } from '../middleware/auth.js'

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
  return {
    ...rest,
    id: rest.id || `LD-${Date.now()}`,
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
    stops: rest.stops || [],
    incomeLines: rest.incomeLines || [],
    expenseLines: rest.expenseLines || [],
    errorMessage: rest.errorMessage || '',
    archived: Boolean(rest.archived),
    postedBoards: rest.postedBoards || [],
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
    const load = await Load.create(createLoadDefaults(req.body || {}, req.user))
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

export default router
