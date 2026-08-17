import express from 'express'
import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

function serialize(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return { ...obj, id: obj.id || String(obj._id) }
}

function createLoadDefaults(payload = {}) {
  const now = new Date()
  return {
    id: `LD-${Date.now()}`,
    tab: payload.tab || 'planning',
    loadStatus: payload.loadStatus || 'New',
    truckStatus: payload.truckStatus || '',
    customer: payload.customer || '',
    carrier: payload.carrier || '',
    driver: payload.driver || '',
    equipment: payload.equipment || '',
    powerUnit: payload.powerUnit || '',
    picks: payload.picks || '',
    drops: payload.drops || '',
    pickDate: payload.pickDate || null,
    dropDate: payload.dropDate || null,
    reference: payload.reference || payload.loadReference || '',
    loadReference: payload.loadReference || payload.reference || '',
    postedRate: payload.postedRate || 0,
    income: payload.income || 0,
    expenses: payload.expenses || 0,
    usersRoles: payload.usersRoles || '',
    branch: payload.branch || 'Shared',
    creationDate: payload.creationDate || now.toISOString().slice(0, 10),
    commodity: payload.commodity || '',
    loadSize: payload.loadSize || 'full',
    goodsCondition: payload.goodsCondition || 'new',
    customerDetails: payload.customerDetails || {},
    carrierDetails: payload.carrierDetails || {},
    stops: payload.stops || [],
    incomeLines: payload.incomeLines || [],
    expenseLines: payload.expenseLines || [],
    ...payload,
  }
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
    })
    res.status(201).json({ success: true, data: serialize(template) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const loads = await Load.find().sort({ createdAt: -1 })
    res.json({ success: true, data: loads.map(serialize) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const load = await Load.create(createLoadDefaults(req.body || {}))
    res.status(201).json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const load = await Load.findOne({ id: req.params.id })
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
    const existing = await Load.findOne({ id: req.params.id })
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Load not found' })
    }

    const payload = { ...(req.body || {}) }
    delete payload._id
    payload.id = existing.id

    const load = await Load.findByIdAndUpdate(
      existing._id,
      { $set: payload },
      { new: true },
    )
    res.json({ success: true, data: serialize(load) })
  } catch (error) {
    next(error)
  }
})

export default router
