import express from 'express'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'
import { requirePermission } from '../middleware/requirePermission.js'
import {
  listResponse,
  paginateFind,
  parseListQuery,
} from '../utils/listQuery.js'

const router = express.Router()

router.use(authenticate)

// Create notification (admins/allowed users)
router.post('/', requirePermission('USER_UPDATE'), async (req, res, next) => {
  try {
    const { userId, title, message, data } = req.body
    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, message: 'userId, title and message are required' })
    }

    // ensure target user exists
    const target = await User.findById(userId).select('-password')
    if (!target) return res.status(404).json({ success: false, message: 'Target user not found' })

    const n = await Notification.create({ userId, title, message, data })
    res.status(201).json({ success: true, data: n })
  } catch (error) {
    next(error)
  }
})

// List notifications for current user (admins can query other users)
router.get('/', async (req, res, next) => {
  try {
    const { userId, unread } = req.query
    let query = {}

    if (userId) {
      // only super admin or users with permission can query others
      if (req.user.systemRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Not authorized to view other users notifications' })
      }
      query.userId = userId
    } else {
      query.userId = req.user._id
    }

    if (unread === 'true') query.read = false

    const list = parseListQuery(req.query, { defaultLimit: 50, maxLimit: 100 })
    const options = list.paginate ? list : { ...list, paginate: true, page: 1, limit: 200, skip: 0 }
    const { items, total } = await paginateFind(Notification, query, {
      ...options,
      sort: { createdAt: -1 },
    })
    res.json(list.paginate ? listResponse(items, { ...options, total }) : { success: true, data: items })
  } catch (error) {
    next(error)
  }
})

router.put('/read-all', async (req, res, next) => {
  try {
    const typePrefix = String(req.query.typePrefix || req.body?.typePrefix || '').trim()
    const filter = { userId: req.user._id, read: false }
    if (typePrefix) {
      filter['data.type'] = { $regex: `^${typePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
    }

    const result = await Notification.updateMany(filter, { $set: { read: true } })
    res.json({ success: true, modified: result.modifiedCount || 0 })
  } catch (error) {
    next(error)
  }
})

// Mark as read
router.put('/:id/read', async (req, res, next) => {
  try {
    const n = await Notification.findById(req.params.id)
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' })

    // Only owner or super admin can mark
    if (String(n.userId) !== String(req.user._id) && req.user.systemRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Not authorized' })
    }

    n.read = true
    await n.save()
    res.json({ success: true, data: n })
  } catch (error) {
    next(error)
  }
})

export default router
