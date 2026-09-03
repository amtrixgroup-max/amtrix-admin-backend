import express from 'express'
import { authenticate } from '../middleware/auth.js'
import ActivityLog from '../models/ActivityLog.js'
import User from '../models/User.js'
import { deviceFromUserAgent, logActivity, serializeActivity } from '../utils/activityLog.js'
import {
  buildDashboardPayload,
  getDashboardConfig,
  resolveDashboardWorkspace,
  serializeDashboardConfig,
  upsertDashboardConfig,
} from '../utils/dashboardStats.js'
import { listResponse, paginateFind, parseListQuery } from '../utils/listQuery.js'
import { resolveDepartmentScopeFilter } from '../utils/mcCheckAccess.js'

const router = express.Router()
router.use(authenticate)

const isSuperAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN'

const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required',
    })
  }
  next()
}

function parseAmount(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function parseCardPayload(body = {}) {
  const title = String(body.title || '').trim()
  if (!title) {
    const error = new Error('Card title is required')
    error.status = 400
    throw error
  }
  const format = ['number', 'currency', 'percent'].includes(body.format) ? body.format : 'number'
  const trendRaw = body.trend
  const trend =
    trendRaw === '' || trendRaw == null || Number.isNaN(Number(trendRaw))
      ? null
      : Number(trendRaw)
  return {
    title,
    value: parseAmount(body.value) || 0,
    format,
    trend,
    trendLabel: String(body.trendLabel || 'vs last month').trim() || 'vs last month',
    icon: String(body.icon || 'Target').trim() || 'Target',
  }
}

async function recentLoginFilter(user, query = {}) {
  const filter = { lastLoginAt: { $ne: null } }
  Object.assign(filter, await resolveDepartmentScopeFilter(user, query))
  return filter
}

function serializeRecentLogin(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.roleId?.name || user.role || user.systemRole,
    loginTime: user.lastLoginAt,
    device: deviceFromUserAgent(user.lastLoginUserAgent),
  }
}

router.get('/', async (req, res, next) => {
  try {
    const dashboard = await buildDashboardPayload(req)
    const workspace = resolveDashboardWorkspace(req)
    const superAdmin = isSuperAdmin(req.user)
    const config = superAdmin ? await getDashboardConfig(workspace) : null
    const serialized = superAdmin ? serializeDashboardConfig(config) : null

    const loginFilter = await recentLoginFilter(req.user, req.query)

    const activityFilter = { userId: { $exists: true, $ne: null } }
    Object.assign(activityFilter, await resolveDepartmentScopeFilter(req.user, req.query))

    const recentActivityDocs = await ActivityLog.find(activityFilter)
      .sort({ timestamp: -1 })
      .limit(25)
      .lean()

    const recentUsers = await User.find(loginFilter)
      .sort({ lastLoginAt: -1 })
      .limit(10)
      .populate('roleId', 'name displayName')
      .select('name email role systemRole lastLoginAt lastLoginUserAgent roleId')
      .lean()

    const recentLogins = recentUsers.map(serializeRecentLogin)

    res.json({
      ...dashboard,
      ...(superAdmin
        ? {
            customCards: serialized.customCards,
            dashboardConfig: serialized,
          }
        : {}),
      recentActivities: recentActivityDocs.map(serializeActivity),
      recentLogins,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/recent-logins', async (req, res, next) => {
  try {
    const list = parseListQuery(req.query, { defaultLimit: 6, maxLimit: 100 })
    const filter = await recentLoginFilter(req.user, req.query)
    const { items, total } = await paginateFind(User, filter, {
      ...list,
      paginate: true,
      sort: { lastLoginAt: -1 },
      select: 'name email role systemRole lastLoginAt lastLoginUserAgent roleId',
      populate: { path: 'roleId', select: 'name displayName' },
      lean: true,
    })

    res.json(listResponse(items.map(serializeRecentLogin), { ...list, paginate: true, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/config', requireSuperAdmin, async (req, res, next) => {
  try {
    const workspace = resolveDashboardWorkspace(req)
    const config = await getDashboardConfig(workspace)
    res.json({
      success: true,
      data: {
        ...serializeDashboardConfig(config),
        workspace: config?.workspace || workspace,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.put('/config', requireSuperAdmin, async (req, res, next) => {
  try {
    const workspace = resolveDashboardWorkspace(req)
    const config = await upsertDashboardConfig(workspace)
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'monthlyTarget')) {
      config.monthlyTarget = parseAmount(req.body.monthlyTarget)
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'quarterlyTarget')) {
      config.quarterlyTarget = parseAmount(req.body.quarterlyTarget)
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'yearlyTarget')) {
      config.yearlyTarget = parseAmount(req.body.yearlyTarget)
    }
    config.updatedBy = req.user?._id || null
    await config.save()
    await logActivity({
      req,
      action: 'Updated dashboard targets',
      description: `Set plan targets for ${config.workspace} workspace`,
      type: 'update',
      module: 'Dashboard',
      metadata: {
        workspace: config.workspace,
        monthlyTarget: config.monthlyTarget,
        quarterlyTarget: config.quarterlyTarget,
        yearlyTarget: config.yearlyTarget,
      },
    })
    res.json({ success: true, data: serializeDashboardConfig(config) })
  } catch (error) {
    next(error)
  }
})

router.post('/config/cards', requireSuperAdmin, async (req, res, next) => {
  try {
    const workspace = resolveDashboardWorkspace(req)
    const config = await upsertDashboardConfig(workspace)
    const card = parseCardPayload(req.body)
    config.customCards.push(card)
    config.updatedBy = req.user?._id || null
    await config.save()
    const created = config.customCards[config.customCards.length - 1]
    await logActivity({
      req,
      action: 'Added dashboard card',
      description: `Added "${card.title}" on ${config.workspace} dashboard`,
      type: 'create',
      module: 'Dashboard',
      metadata: { workspace: config.workspace, cardId: String(created._id) },
    })
    res.status(201).json({ success: true, data: serializeDashboardConfig(config) })
  } catch (error) {
    next(error)
  }
})

router.put('/config/cards/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const workspace = resolveDashboardWorkspace(req)
    const config = await upsertDashboardConfig(workspace)
    const card = config.customCards.id(req.params.id)
    if (!card) {
      return res.status(404).json({ success: false, message: 'Dashboard card not found' })
    }
    const nextCard = parseCardPayload({ ...card.toObject(), ...req.body, title: req.body.title ?? card.title })
    card.title = nextCard.title
    card.value = nextCard.value
    card.format = nextCard.format
    card.trend = nextCard.trend
    card.trendLabel = nextCard.trendLabel
    card.icon = nextCard.icon
    config.updatedBy = req.user?._id || null
    await config.save()
    await logActivity({
      req,
      action: 'Updated dashboard card',
      description: `Updated "${card.title}" on ${config.workspace} dashboard`,
      type: 'update',
      module: 'Dashboard',
    })
    res.json({ success: true, data: serializeDashboardConfig(config) })
  } catch (error) {
    next(error)
  }
})

router.delete('/config/cards/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const workspace = resolveDashboardWorkspace(req)
    const config = await upsertDashboardConfig(workspace)
    const card = config.customCards.id(req.params.id)
    if (!card) {
      return res.status(404).json({ success: false, message: 'Dashboard card not found' })
    }
    const title = card.title
    card.deleteOne()
    config.updatedBy = req.user?._id || null
    await config.save()
    await logActivity({
      req,
      action: 'Removed dashboard card',
      description: `Removed "${title}" from ${config.workspace} dashboard`,
      type: 'update',
      module: 'Dashboard',
    })
    res.json({ success: true, data: serializeDashboardConfig(config) })
  } catch (error) {
    next(error)
  }
})

export default router
