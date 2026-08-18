import express from 'express'
import { authenticate } from '../middleware/auth.js'
import ActivityLog from '../models/ActivityLog.js'
import { canViewAllActivityLogs, serializeActivity } from '../utils/activityLog.js'

const router = express.Router()
router.use(authenticate)

const genuineFilter = { userId: { $exists: true, $ne: null } }

const isGlobalAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' ||
  user?.role === 'SUPER_ADMIN' ||
  user?.systemRole === 'ADMIN'

router.get('/', async (req, res, next) => {
  try {
    const seeAll = await canViewAllActivityLogs(req.user)
    const filter = { ...genuineFilter }

    if (!isGlobalAdmin(req.user) && req.user?.departmentId) {
      filter.departmentId = req.user.departmentId
    }

    const query = ActivityLog.find(filter).sort({ timestamp: -1 })
    const logs = await (seeAll ? query.limit(500) : query.limit(6)).lean()

    res.json({
      success: true,
      data: logs.map(serializeActivity),
      limited: !seeAll
    })
  } catch (error) {
    next(error)
  }
})

export default router
