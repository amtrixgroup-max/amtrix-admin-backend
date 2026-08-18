import express from 'express'
import { authenticate } from '../middleware/auth.js'
import ActivityLog from '../models/ActivityLog.js'
import User from '../models/User.js'
import { deviceFromUserAgent, serializeActivity } from '../utils/activityLog.js'
import { buildDashboardPayload } from '../utils/dashboardStats.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const dashboard = await buildDashboardPayload(req)

    const recentActivityDocs = await ActivityLog.find({
      userId: { $exists: true, $ne: null }
    })
      .sort({ timestamp: -1 })
      .limit(6)
      .lean()

    const loginFilter = { lastLoginAt: { $ne: null } }
    if (
      req.user?.systemRole !== 'SUPER_ADMIN' &&
      req.user?.role !== 'SUPER_ADMIN' &&
      req.user?.departmentId
    ) {
      loginFilter.departmentId = req.user.departmentId
    }

    const recentUsers = await User.find(loginFilter)
      .sort({ lastLoginAt: -1 })
      .limit(10)
      .populate('roleId', 'name displayName')
      .select('name email role systemRole lastLoginAt lastLoginUserAgent roleId')
      .lean()

    const recentLogins = recentUsers.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.roleId?.name || user.role || user.systemRole,
      loginTime: user.lastLoginAt,
      device: deviceFromUserAgent(user.lastLoginUserAgent)
    }))

    res.json({
      ...dashboard,
      recentActivities: recentActivityDocs.map(serializeActivity),
      recentLogins
    })
  } catch (error) {
    next(error)
  }
})

export default router
