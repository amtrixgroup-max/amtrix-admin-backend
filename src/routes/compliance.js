import express from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import BrokerTarget from '../models/BrokerTarget.js'
import Load from '../models/Load.js'
import { logActivity } from '../utils/activityLog.js'
import {
  parseListQuery,
  textSearch,
  andFilter,
  paginateFind,
  mongoSort,
  listResponse,
} from '../utils/listQuery.js'
import {
  canAssignBrokerTargets,
  isNormalUserRole,
  isSuperAdminUser,
  departmentFilterForViewer,
} from '../utils/mcCheckAccess.js'
import { buildDashboardPayload } from '../utils/dashboardStats.js'

const router = express.Router()
router.use(authenticate)

const requireTargetManager = async (req, res, next) => {
  try {
    if (await canAssignBrokerTargets(req.user)) return next()
    return res.status(403).json({
      success: false,
      message: 'Not authorized to manage broker targets',
    })
  } catch (error) {
    next(error)
  }
}

router.use(requireTargetManager)

function parseYear(value) {
  const year = Number.parseInt(value, 10)
  const current = new Date().getFullYear()
  if (!Number.isFinite(year) || year < current - 10 || year > current + 5) return current
  return year
}

function parseOptionalDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function brokerRoleIds() {
  const roles = await Role.find({}).select('name').lean()
  return roles.filter((role) => isNormalUserRole(role.name)).map((role) => role._id)
}

function viewerBrokerFilter(user) {
  if (isSuperAdminUser(user)) return {}
  return departmentFilterForViewer(user)
}

function roundMoney(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function pairFromTargets(monthlyTarget, yearlyTarget) {
  const monthly = roundMoney(monthlyTarget)
  const yearly = roundMoney(yearlyTarget)
  if (monthly != null && yearly != null) {
    return { monthlyTarget: monthly, yearlyTarget: yearly }
  }
  if (monthly != null) {
    return { monthlyTarget: monthly, yearlyTarget: roundMoney(monthly * 12) }
  }
  if (yearly != null) {
    return { monthlyTarget: roundMoney(yearly / 12), yearlyTarget: yearly }
  }
  return { monthlyTarget: null, yearlyTarget: null }
}

function serializeBroker(user, target = null, extras = {}) {
  const paired = pairFromTargets(target?.monthlyTarget, target?.yearlyTarget)
  const yearlyTarget = paired.yearlyTarget
  const achieved = Number.isFinite(Number(extras.achieved)) ? Math.round(Number(extras.achieved) * 100) / 100 : 0
  const remaining = yearlyTarget != null ? Math.max(0, Math.round((yearlyTarget - achieved) * 100) / 100) : null
  const previousPaired = pairFromTargets(extras.previousYearMonthlyTarget, extras.previousYearTarget)
  const previousYearAchieved = Number.isFinite(Number(extras.previousYearAchieved))
    ? Math.round(Number(extras.previousYearAchieved) * 100) / 100
    : 0
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    department: user.departmentId?.displayName || user.departmentId?.name || user.departmentId?.code || '',
    monthlyTarget: paired.monthlyTarget,
    yearlyTarget: paired.yearlyTarget,
    year: target?.year ?? extras.year ?? null,
    startDate: target?.startDate ?? null,
    endDate: target?.endDate ?? null,
    achieved,
    remaining,
    previousYearTarget: previousPaired.yearlyTarget,
    previousYearAchieved,
    hasTarget: Boolean(paired.monthlyTarget || paired.yearlyTarget),
  }
}

function queryIdsForUser(user) {
  const canonical = String(user?._id || user || '')
  const values = []
  if (!canonical) return { canonical, values }
  values.push(canonical)
  if (mongoose.isValidObjectId(canonical) && canonical.length === 24) {
    values.push(new mongoose.Types.ObjectId(canonical))
  }
  if (user?.id != null && String(user.id) !== canonical) {
    values.push(String(user.id))
    const numeric = Number(user.id)
    if (Number.isFinite(numeric)) values.push(numeric)
  }
  return { canonical, values }
}

async function yearlyAchievedByUser(users, year) {
  const map = new Map()
  const aliasToCanonical = new Map()
  const queryIds = []
  users.forEach((user) => {
    const { canonical, values } = queryIdsForUser(user)
    if (!canonical) return
    map.set(canonical, 0)
    values.forEach((value) => {
      aliasToCanonical.set(String(value), canonical)
      queryIds.push(value)
    })
  })
  if (!queryIds.length) return map

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year + 1, 0, 1)
  const loads = await Load.find({
    $or: [{ createdBy: { $in: queryIds } }, { assignedUserId: { $in: queryIds } }],
  })
    .select('createdBy assignedUserId income postedRate creationDate createdAt')
    .lean()

  const counted = new Set()
  loads.forEach((load) => {
    const loadKey = String(load._id || load.id || '')
    if (loadKey && counted.has(loadKey)) return
    if (loadKey) counted.add(loadKey)
    const dateValue = load.creationDate || load.createdAt
    const date = dateValue ? new Date(dateValue) : null
    if (!date || Number.isNaN(date.getTime()) || date < yearStart || date >= yearEnd) return
    const amount = Number(load.income) || Number(load.postedRate) || 0
    if (!Number.isFinite(amount) || amount <= 0) return
    const ownerId = [load.createdBy, load.assignedUserId]
      .map((id) => aliasToCanonical.get(String(id || '')))
      .find(Boolean)
    if (!ownerId) return
    map.set(ownerId, map.get(ownerId) + amount)
  })
  return map
}

async function findBrokerOr404(req, res) {
  const broker = await User.findById(req.params.id)
    .populate('roleId', 'name displayName')
    .populate('departmentId', 'name code displayName')
    .select('-password')
  if (!broker) {
    res.status(404).json({ success: false, message: 'Broker not found' })
    return null
  }
  if (!isNormalUserRole(broker.roleId?.name || broker.role)) {
    res.status(400).json({ success: false, message: 'Selected user is not a broker' })
    return null
  }
  if (!isSuperAdminUser(req.user) && req.user?.departmentId) {
    if (String(broker.departmentId?._id || broker.departmentId || '') !== String(req.user.departmentId)) {
      res.status(403).json({ success: false, message: 'Not authorized to manage this broker' })
      return null
    }
  }
  return broker
}

router.get('/brokers', async (req, res, next) => {
  try {
    const year = parseYear(req.query.year)
    const list = parseListQuery(req.query, { defaultLimit: 10, maxLimit: 50 })
    const roleIds = await brokerRoleIds()
    const filter = andFilter(
      viewerBrokerFilter(req.user),
      { status: { $in: ['ACTIVE', 'Active'] } },
      roleIds.length ? { roleId: { $in: roleIds } } : { _id: null },
      textSearch(['name', 'email', 'employeeId'], list.search),
    )

    const { items, total } = await paginateFind(User, filter, {
      ...list,
      paginate: true,
      sort: mongoSort(req.query.sort || 'name'),
      select: '-password',
      populate: [
        { path: 'departmentId', select: 'name code displayName' },
        { path: 'roleId', select: 'name displayName' },
      ],
    })

    const userIds = items.map((item) => item._id)
    const previousYear = year - 1
    const [targets, previousTargets, achievedMap, previousAchievedMap] = await Promise.all([
      BrokerTarget.find({ userId: { $in: userIds }, year }).lean(),
      BrokerTarget.find({ userId: { $in: userIds }, year: previousYear }).lean(),
      yearlyAchievedByUser(items, year),
      yearlyAchievedByUser(items, previousYear),
    ])
    const targetByUser = new Map(targets.map((doc) => [String(doc.userId), doc]))
    const previousTargetByUser = new Map(previousTargets.map((doc) => [String(doc.userId), doc]))

    res.json(
      listResponse(
        items.map((item) => {
          const previous = previousTargetByUser.get(String(item._id))
          return serializeBroker(item, targetByUser.get(String(item._id)) || null, {
            year,
            achieved: achievedMap.get(String(item._id)) || 0,
            previousYearMonthlyTarget: previous?.monthlyTarget,
            previousYearTarget: previous?.yearlyTarget,
            previousYearAchieved: previousAchievedMap.get(String(item._id)) || 0,
          })
        }),
        { ...list, paginate: true, total },
      ),
    )
  } catch (error) {
    next(error)
  }
})

router.get('/brokers/:id/target', async (req, res, next) => {
  try {
    const broker = await findBrokerOr404(req, res)
    if (!broker) return
    const year = parseYear(req.query.year)
    const previousYear = year - 1
    const [target, previousTarget, achievedMap, previousAchievedMap] = await Promise.all([
      BrokerTarget.findOne({ userId: broker._id, year }).lean(),
      BrokerTarget.findOne({ userId: broker._id, year: previousYear }).lean(),
      yearlyAchievedByUser([broker], year),
      yearlyAchievedByUser([broker], previousYear),
    ])
    res.json({
      success: true,
      data: serializeBroker(broker, target, {
        year,
        achieved: achievedMap.get(String(broker._id)) || 0,
        previousYearMonthlyTarget: previousTarget?.monthlyTarget,
        previousYearTarget: previousTarget?.yearlyTarget,
        previousYearAchieved: previousAchievedMap.get(String(broker._id)) || 0,
      }),
    })
  } catch (error) {
    next(error)
  }
})

router.put('/brokers/:id/target', async (req, res, next) => {
  try {
    const broker = await findBrokerOr404(req, res)
    if (!broker) return

    const year = parseYear(req.body?.year)
    const paired = pairFromTargets(req.body?.monthlyTarget, req.body?.yearlyTarget)
    if (paired.monthlyTarget == null && paired.yearlyTarget == null) {
      return res.status(400).json({
        success: false,
        message: 'Enter a monthly target or a yearly target.',
      })
    }

    const target = await BrokerTarget.findOneAndUpdate(
      { userId: broker._id, year },
      {
        $set: {
          monthlyTarget: paired.monthlyTarget,
          yearlyTarget: paired.yearlyTarget,
          startDate: parseOptionalDate(req.body?.startDate),
          endDate: parseOptionalDate(req.body?.endDate),
          assignedBy: req.user._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )

    await logActivity({
      req,
      action: 'Assigned broker target',
      description: `Set ${year} targets for ${broker.name || broker.email}`,
      type: 'update',
      module: 'Compliance',
      metadata: {
        brokerId: String(broker._id),
        year,
        monthlyTarget: paired.monthlyTarget,
        yearlyTarget: paired.yearlyTarget,
      },
    })

    const previousYear = year - 1
    const [achievedMap, previousTarget, previousAchievedMap] = await Promise.all([
      yearlyAchievedByUser([broker], year),
      BrokerTarget.findOne({ userId: broker._id, year: previousYear }).lean(),
      yearlyAchievedByUser([broker], previousYear),
    ])
    res.json({
      success: true,
      data: serializeBroker(broker, target, {
        year,
        achieved: achievedMap.get(String(broker._id)) || 0,
        previousYearMonthlyTarget: previousTarget?.monthlyTarget,
        previousYearTarget: previousTarget?.yearlyTarget,
        previousYearAchieved: previousAchievedMap.get(String(broker._id)) || 0,
      }),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/brokers/:id/performance', async (req, res, next) => {
  try {
    const broker = await findBrokerOr404(req, res)
    if (!broker) return
    const payload = await buildDashboardPayload({ user: broker, query: {} })
    const year = parseYear(req.query.year)
    res.json({
      success: true,
      data: {
        broker: {
          id: broker._id,
          name: broker.name,
          email: broker.email,
        },
        year,
        targets: payload.targets || {},
        monthlyByYear: payload.monthlyByYear || {},
        yearlySeries: payload.yearlySeries || [],
        targetYears: payload.targetYears || [year],
        hasTargetData: Boolean(payload.hasTargetData),
        targetsConfigured: Boolean(payload.targetsConfigured),
        assignedTarget: payload.assignedTarget || null,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
