import express from 'express'
import mongoose from 'mongoose'
import Carrier from '../models/Carrier.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'
import {
  andFilter,
  listResponse,
  mongoSort,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'
import { canWriteCarrier } from '../utils/mcCheckAccess.js'

const router = express.Router()
router.use(authenticate)

const isSuperAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN'

function serialize(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return {
    ...obj,
    id: obj.id || String(obj._id),
    telephone: obj.telephone || obj.phone || '',
    phone: obj.phone || obj.telephone || '',
    contact: obj.contact || obj.contactName || '',
  }
}

function byPublicId(id) {
  if (mongoose.isValidObjectId(id) && String(id).length === 24) {
    return { $or: [{ id }, { _id: id }] }
  }
  return { id }
}

async function findCarrier(rawId) {
  if (rawId == null || rawId === '') return null
  return Carrier.findOne(byPublicId(rawId))
}

function departmentFilter(user, queryDepartmentId) {
  // Super Admin with no explicit department scope sees every carrier.
  if (isSuperAdmin(user) && !queryDepartmentId) return {}
  const departmentId = String(
    queryDepartmentId || (user?.departmentId ? String(user.departmentId) : '') || '',
  ).trim()
  if (!departmentId) return {}
  return {
    $or: [
      { departmentId },
      { departmentId: String(departmentId) },
      { departmentId: { $exists: false } },
      { departmentId: '' },
      { departmentId: null },
    ],
  }
}

function normalizeCarrierPayload(body = {}, user = null) {
  const payload = { ...(body || {}) }
  delete payload._id
  const primary = Array.isArray(payload.contacts) ? payload.contacts.find((item) => item?.name || item?.email || item?.phone) : null
  return {
    ...payload,
    name: String(payload.name || '').trim(),
    address: payload.address || '',
    city: payload.city || '',
    state: payload.state || '',
    mcNumber: payload.mcNumber || '',
    mcPrefix: payload.mcPrefix || 'MC',
    usdotNumber: payload.usdotNumber || '',
    phone: payload.phone || payload.telephone || primary?.phone || '',
    telephone: payload.telephone || payload.phone || primary?.phone || '',
    email: payload.email || primary?.email || '',
    contact: payload.contact || primary?.name || '',
    doNotLoad: Boolean(payload.doNotLoad),
    departmentId: payload.departmentId || (user?.departmentId ? String(user.departmentId) : ''),
    status: payload.status || 'ACTIVE',
  }
}

router.get('/', async (req, res, next) => {
  try {
    const list = parseListQuery(req.query)
    const filter = andFilter(
      departmentFilter(req.user, req.query.departmentId),
      textSearch(['name', 'mcNumber', 'usdotNumber', 'contact', 'address', 'email'], list.search),
    )
    const { items, total } = await paginateFind(Carrier, filter, {
      ...list,
      sort: mongoSort(req.query.sort || '-createdAt'),
    })
    res.json(listResponse(items.map(serialize), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || req.query.name || '').trim()
    const filter = { ...departmentFilter(req.user, req.query.departmentId) }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { name: regex },
            { mcNumber: regex },
            { usdotNumber: regex },
            { email: regex },
            { contact: regex },
            { city: regex },
            { state: regex },
          ],
        },
      ]
    }
    const carriers = await Carrier.find(filter).sort({ createdAt: -1 })
    res.json({ success: true, data: carriers.map(serialize) })
  } catch (error) {
    next(error)
  }
})

router.get('/documents', async (req, res, next) => {
  try {
    const carriers = await Carrier.find(departmentFilter(req.user)).select('id name documents').lean()
    const documents = carriers.flatMap((carrier) =>
      (carrier.documents || []).map((doc) => ({
        ...doc,
        carrierId: carrier.id,
        carrierName: carrier.name,
      })),
    )
    res.json({ success: true, data: documents })
  } catch (error) {
    next(error)
  }
})

router.post('/bulk', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.carriers) ? req.body.carriers : []
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'No carriers provided' })
    }
    if (!(await canWriteCarrier(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You can view carriers but do not have permission to change them.',
      })
    }

    const created = []
    const skipped = []
    for (const item of items.slice(0, 2000)) {
      const payload = normalizeCarrierPayload(item, req.user)
      if (!payload.name) {
        skipped.push({ reason: 'Carrier name is required', item })
        continue
      }
      const existing =
        (payload.mcNumber && (await Carrier.findOne({ mcNumber: payload.mcNumber }))) ||
        (payload.usdotNumber && (await Carrier.findOne({ usdotNumber: payload.usdotNumber })))
      if (existing) {
        Object.assign(existing, payload)
        await existing.save()
        created.push(serialize(existing))
        continue
      }
      const carrier = await Carrier.create({
        ...payload,
        id: payload.id || `CAR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdBy: String(req.user._id),
      })
      created.push(serialize(carrier))
    }

    await logActivity({
      req,
      action: 'Carriers Imported',
      description: `${created.length} carrier${created.length === 1 ? '' : 's'} imported`,
      type: 'create',
      module: 'Carriers',
    })

    res.status(201).json({ success: true, data: created, skippedCount: skipped.length })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const carrier = await findCarrier(req.params.id)
    if (!carrier) {
      return res.status(404).json({ success: false, message: 'Carrier not found' })
    }
    res.json({ success: true, data: serialize(carrier) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/documents', async (req, res, next) => {
  try {
    const carrier = await findCarrier(req.params.id)
    if (!carrier) {
      return res.status(404).json({ success: false, message: 'Carrier not found' })
    }
    res.json({ success: true, data: carrier.documents || [] })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/documents', async (req, res, next) => {
  try {
    if (!(await canWriteCarrier(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You can view this carrier but do not have permission to change it.',
      })
    }
    const carrier = await findCarrier(req.params.id)
    if (!carrier) {
      return res.status(404).json({ success: false, message: 'Carrier not found' })
    }
    const body = req.body || {}
    const document = {
      id: `DOC-${Date.now()}`,
      name: String(body.name || '').trim() || 'Untitled document',
      description: body.description || '',
      documentType: body.documentType || 'Other',
      status: body.status || 'Uploaded',
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user.name || req.user.email || '',
    }
    carrier.documents = [...(carrier.documents || []), document]
    await carrier.save()
    res.status(201).json({ success: true, data: document })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    if (!(await canWriteCarrier(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You can view carriers but do not have permission to change them.',
      })
    }
    const payload = normalizeCarrierPayload(req.body || {}, req.user)
    if (!payload.name) {
      return res.status(400).json({ success: false, message: 'Carrier name is required' })
    }
    const carrier = await Carrier.create({
      ...payload,
      id: payload.id || `CAR-${Date.now()}`,
      createdBy: String(req.user._id),
    })
    await logActivity({
      req,
      action: 'Carrier Added',
      description: `New carrier ${carrier.name || carrier.id} added`,
      type: 'create',
      module: 'Carriers',
    })
    res.status(201).json({ success: true, data: serialize(carrier) })
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    if (!(await canWriteCarrier(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You can view this carrier but do not have permission to change it.',
      })
    }
    const existing = await findCarrier(req.params.id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Carrier not found' })
    }
    const payload = normalizeCarrierPayload(req.body || {}, req.user)
    if (!payload.name) {
      return res.status(400).json({ success: false, message: 'Carrier name is required' })
    }
    payload.id = existing.id
    const carrier = await Carrier.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
    res.json({ success: true, data: serialize(carrier) })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    if (!(await canWriteCarrier(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You can view this carrier but do not have permission to change it.',
      })
    }
    const existing = await findCarrier(req.params.id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Carrier not found' })
    }
    await Carrier.deleteOne({ _id: existing._id })
    await logActivity({
      req,
      action: 'Carrier Removed',
      description: `Carrier ${existing.name || existing.id} removed`,
      type: 'warning',
      module: 'Carriers',
    })
    res.json({ success: true, message: 'Carrier deleted' })
  } catch (error) {
    next(error)
  }
})

export default router
