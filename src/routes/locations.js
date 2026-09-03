import express from 'express'
import mongoose from 'mongoose'
import Location from '../models/Location.js'
import { authenticate } from '../middleware/auth.js'
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

function serialize(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return {
    ...obj,
    id: obj.id || String(obj._id),
    requirements: {
      liftgate: Boolean(obj.requirements?.liftgate),
      appointment: Boolean(obj.requirements?.appointment),
      inside: Boolean(obj.requirements?.inside),
      callBefore: Boolean(obj.requirements?.callBefore),
    },
  }
}

function byPublicId(id) {
  if (mongoose.isValidObjectId(id) && String(id).length === 24) {
    return { $or: [{ id }, { _id: id }] }
  }
  return { id }
}

function uniqueLocationId() {
  return `LOC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeLocationPayload(body = {}, user = null) {
  const payload = { ...(body || {}) }
  delete payload._id
  const requirements = payload.requirements || {}
  return {
    ...payload,
    name: String(payload.name || '').trim(),
    address: String(payload.address || '').trim(),
    city: String(payload.city || '').trim(),
    state: String(payload.state || '').trim(),
    zip: String(payload.zip || '').trim(),
    country: String(payload.country || 'US').trim() || 'US',
    telephone: String(payload.telephone || payload.phone || '').trim(),
    phoneExt: String(payload.phoneExt || payload.ext || '').trim(),
    locationClass: String(payload.locationClass || 'None').trim() || 'None',
    requirements: {
      liftgate: Boolean(requirements.liftgate),
      appointment: Boolean(requirements.appointment),
      inside: Boolean(requirements.inside),
      callBefore: Boolean(requirements.callBefore),
    },
    contactName: String(payload.contactName || '').trim(),
    contactPhone: String(payload.contactPhone || '').trim(),
    contactExt: String(payload.contactExt || '').trim(),
    contactEmail: String(payload.contactEmail || '').trim(),
    contactFax: String(payload.contactFax || '').trim(),
    privateNotes: String(payload.privateNotes || ''),
    publicNotes: String(payload.publicNotes || ''),
    departmentId:
      payload.departmentId != null
        ? String(payload.departmentId)
        : user?.departmentId
          ? String(user.departmentId)
          : '',
    updatedBy: user?._id ? String(user._id) : '',
  }
}

router.get('/', async (req, res, next) => {
  try {
    const list = parseListQuery(req.query, { defaultSort: 'name' })
    const filter = andFilter(
      textSearch(['name', 'address', 'city', 'state', 'zip', 'telephone', 'contactName'], list.search),
    )
    const { items, total } = await paginateFind(Location, filter, {
      ...list,
      sort: mongoSort(req.query.sort || 'name'),
    })
    res.json(listResponse(items.map(serialize), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await Location.findOne(byPublicId(req.params.id))
    if (!item) return res.status(404).json({ message: 'Location not found' })
    res.json({ data: serialize(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const payload = normalizeLocationPayload(req.body, req.user)
    if (!payload.name) return res.status(400).json({ message: 'Location name is required' })
    const created = await Location.create({
      ...payload,
      id: uniqueLocationId(),
      createdBy: req.user?._id ? String(req.user._id) : '',
    })
    res.status(201).json({ data: serialize(created) })
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await Location.findOne(byPublicId(req.params.id))
    if (!existing) return res.status(404).json({ message: 'Location not found' })
    const payload = normalizeLocationPayload({ ...existing.toObject(), ...req.body }, req.user)
    Object.assign(existing, payload)
    await existing.save()
    res.json({ data: serialize(existing) })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await Location.findOne(byPublicId(req.params.id))
    if (!existing) return res.status(404).json({ message: 'Location not found' })
    await existing.deleteOne()
    res.json({ data: { id: existing.id } })
  } catch (error) {
    next(error)
  }
})

export default router
