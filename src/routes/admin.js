import express from 'express'
import Department from '../models/Department.js'
import Role from '../models/Role.js'
import Permission from '../models/Permission.js'
import User from '../models/User.js'
import { isPasswordValid } from '../utils/passwordPolicy.js'
import { authenticate } from '../middleware/auth.js'
import { requirePermission, requireUserScope } from '../middleware/requirePermission.js'
import net from 'net'
import { getEffectivePermissions } from '../utils/permissions.js'
import { isAdminLikeUser, normalizeIp } from '../utils/ipAccess.js'
import { logActivity } from '../utils/activityLog.js'
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

const isSuperAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN'

const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required'
    })
  }
  next()
}

const requireAdminLike = (req, res, next) => {
  if (!isAdminLikeUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Admin or Super Admin access required'
    })
  }
  next()
}

async function isDeptAdminUser(user) {
  if (!user) return false
  if (String(user.role || '').toUpperCase() === 'DEPT_ADMIN') return true
  if (!user.roleId) return false
  const role = await Role.findById(user.roleId).select('name')
  return String(role?.name || '').toUpperCase() === 'DEPT_ADMIN'
}

async function applyDeptAdminSystemRole(payload = {}) {
  if (!payload?.roleId) return payload
  const role = await Role.findById(payload.roleId).select('name')
  if (role?.name === 'DEPT_ADMIN' && payload.systemRole !== 'SUPER_ADMIN') {
    payload.systemRole = 'ADMIN'
  }
  return payload
}

// ---------- Departments ----------
router.get('/departments', requirePermission('DEPARTMENT_VIEW'), async (req, res, next) => {
  try {
    const filter = isSuperAdmin(req.user)
      ? {}
      : { _id: req.user.departmentId }

    const departments = await Department.find(filter).sort({ name: 1 })
    res.json({ success: true, data: departments })
  } catch (error) {
    next(error)
  }
})

router.post('/departments', requireSuperAdmin, async (req, res, next) => {
  try {
    const department = await Department.create(req.body)
    res.status(201).json({ success: true, data: department })
  } catch (error) {
    next(error)
  }
})

router.put('/departments/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' })
    }
    res.json({ success: true, data: department })
  } catch (error) {
    next(error)
  }
})

// ---------- Roles ----------
router.get('/roles', async (req, res, next) => {
  try {
    const filter = {}
    if (!isSuperAdmin(req.user)) {
      if (!req.user.departmentId) {
        return res.json({ success: true, data: [] })
      }
      filter.departmentId = req.user.departmentId
    } else if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
    }

    const roles = await Role.find(filter)
      .populate('departmentId', 'name code displayName')
      .populate('permissions.permissionId', 'name displayName module action')
      .sort({ level: 1, name: 1 })

    res.json({ success: true, data: roles })
  } catch (error) {
    next(error)
  }
})

router.post('/roles', requireSuperAdmin, async (req, res, next) => {
  try {
    const role = await Role.create(req.body)
    res.status(201).json({ success: true, data: role })
  } catch (error) {
    next(error)
  }
})

router.put('/roles/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' })
    }
    res.json({ success: true, data: role })
  } catch (error) {
    next(error)
  }
})

router.put('/roles/:roleId/permissions', async (req, res, next) => {
  try {
    const superAdmin = isSuperAdmin(req.user)
    const deptAdmin = await isDeptAdminUser(req.user)
    if (!superAdmin && !deptAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not allowed to update role permissions'
      })
    }

    let { permissions } = req.body
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'permissions must be an array of { permissionId, scope }'
      })
    }

    const existing = await Role.findById(req.params.roleId)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Role not found' })
    }

    if (!superAdmin) {
      if (String(existing.departmentId || '') !== String(req.user.departmentId || '')) {
        return res.status(403).json({
          success: false,
          message: 'You can only update roles in your department'
        })
      }
      permissions = permissions.map((item) => ({
        ...item,
        scope: item?.scope === 'ALL' ? 'DEPARTMENT' : item?.scope || 'DEPARTMENT'
      }))
    }

    const role = await Role.findByIdAndUpdate(
      req.params.roleId,
      { permissions },
      { new: true, runValidators: true }
    ).populate('permissions.permissionId', 'name displayName module action')

    res.json({ success: true, data: role })
  } catch (error) {
    next(error)
  }
})

// ---------- Permissions ----------
router.get('/permissions', requirePermission('PERMISSION_VIEW'), async (req, res, next) => {
  try {
    const permissions = await Permission.find({ status: 'ACTIVE' }).sort({ module: 1, name: 1 })
    res.json({ success: true, data: permissions })
  } catch (error) {
    next(error)
  }
})

router.post('/permissions', requireSuperAdmin, async (req, res, next) => {
  try {
    const permission = await Permission.create(req.body)
    res.status(201).json({ success: true, data: permission })
  } catch (error) {
    next(error)
  }
})

// ---------- Users (admin) ----------
router.get('/users', requirePermission('USER_VIEW'), async (req, res, next) => {
  try {
    const filter = {}

    if (!isSuperAdmin(req.user)) {
      if (req.permissionScope === 'OWN') {
        filter._id = req.user._id
      } else if (req.permissionScope === 'TEAM') {
        filter.$or = [{ _id: req.user._id }, { managerId: req.user._id }]
      } else if (req.permissionScope === 'DEPARTMENT') {
        filter.departmentId = req.user.departmentId
      }
    } else if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
    }

    const list = parseListQuery(req.query)
    const queryFilter = andFilter(filter, textSearch(['name', 'email', 'employeeId'], list.search))
    const { items, total } = await paginateFind(User, queryFilter, {
      ...list,
      sort: mongoSort(list.sort),
      select: '-password',
      populate: [
        { path: 'departmentId', select: 'name code displayName' },
        { path: 'roleId', select: 'name displayName subRoles' },
        { path: 'managerId', select: 'name email' },
      ],
    })

    res.json(listResponse(items, { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.post('/users', requirePermission('USER_CREATE'), async (req, res, next) => {
  try {
    if (!isSuperAdmin(req.user)) {
      req.body.departmentId = req.user.departmentId
      if (req.body.systemRole === 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Cannot create Super Admin'
        })
      }
    }

    await applyDeptAdminSystemRole(req.body)

    // Enforce password policy only when password provided
    if (req.body.password && !isPasswordValid(req.body.password)) {
      return res.status(400).json({ success: false, message: 'Password does not meet complexity requirements' })
    }

    const user = await User.create(req.body)
    const safe = user.toJSON()
    await logActivity({
      req,
      action: 'User Added',
      description: `New user ${user.name || user.email} created`,
      type: 'create',
      module: 'Users'
    })
    res.status(201).json({ success: true, data: safe })
  } catch (error) {
    next(error)
  }
})

router.put('/users/:id', requirePermission('USER_UPDATE'), async (req, res, next) => {
  try {
    const payload = { ...req.body }
    if (payload.password === '') {
      delete payload.password
    }
    if (payload.password && !isPasswordValid(payload.password)) {
      return res.status(400).json({ success: false, message: 'Password does not meet complexity requirements' })
    }

    if (!isSuperAdmin(req.user) && payload.systemRole === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot promote to Super Admin'
      })
    }

    await applyDeptAdminSystemRole(payload)

    const query = /^[a-f\d]{24}$/i.test(req.params.id)
      ? { _id: req.params.id }
      : { id: Number(req.params.id) }

    const user = await User.findOneAndUpdate(query, payload, {
      new: true,
      runValidators: true
    }).select('-password')

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    res.json({ success: true, data: user })
  } catch (error) {
    next(error)
  }
})

// ---------- Per-user whitelisted IPs (admin / super admin) ----------
router.get(
  '/users/:userId/allowed-ips',
  requirePermission('USER_VIEW'),
  requireAdminLike,
  requireUserScope('userId'),
  async (req, res, next) => {
    try {
      const target = req.targetUser
      res.json({ success: true, data: (target.allowedIps || []).map((s) => String(s)) })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/users/:userId/allowed-ips',
  requirePermission('USER_UPDATE'),
  requireAdminLike,
  requireUserScope('userId'),
  async (req, res, next) => {
    try {
      const { ip } = req.body || {}
      if (!ip || typeof ip !== 'string') {
        return res.status(400).json({ success: false, message: 'ip is required' })
      }

      const normalized = normalizeIp(ip)
      if (!normalized || net.isIP(normalized) === 0) {
        return res.status(400).json({ success: false, message: 'Invalid IP address' })
      }

      const user = req.targetUser
      if (!user) return res.status(404).json({ success: false, message: 'User not found' })

      if (isAdminLikeUser(user)) {
        return res.status(400).json({
          success: false,
          message: 'Super Admin and Admin users are not IP-restricted and do not need a whitelist'
        })
      }

      user.allowedIps = user.allowedIps || []
      if (!user.allowedIps.map((s) => normalizeIp(s)).includes(normalized)) {
        user.allowedIps.push(normalized)
        await user.save()
      }

      res.status(200).json({ success: true, data: user.allowedIps })
    } catch (error) {
      next(error)
    }
  }
)

router.delete(
  '/users/:userId/allowed-ips',
  requirePermission('USER_UPDATE'),
  requireAdminLike,
  requireUserScope('userId'),
  async (req, res, next) => {
    try {
      const ip = req.body?.ip || req.query?.ip
      if (!ip || typeof ip !== 'string') {
        return res.status(400).json({ success: false, message: 'ip is required' })
      }

      const normalized = normalizeIp(ip)
      if (!normalized) {
        return res.status(400).json({ success: false, message: 'Invalid IP address' })
      }

      const user = req.targetUser
      if (!user) return res.status(404).json({ success: false, message: 'User not found' })

      user.allowedIps = user.allowedIps || []
      user.allowedIps = user.allowedIps.filter((s) => normalizeIp(s) !== normalized)
      await user.save()

      res.json({ success: true, data: user.allowedIps })
    } catch (error) {
      next(error)
    }
  }
)

router.delete('/users/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const query = /^[a-f\d]{24}$/i.test(req.params.id)
      ? { _id: req.params.id }
      : { id: Number(req.params.id) }

    const user = await User.findOneAndDelete(query)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    res.json({ success: true, message: 'User deleted' })
  } catch (error) {
    next(error)
  }
})

router.put('/users/:userId/permissions', requireSuperAdmin, async (req, res, next) => {
  try {
    const { extraPermissions = [], deniedPermissions = [] } = req.body

    const query = /^[a-f\d]{24}$/i.test(req.params.userId)
      ? { _id: req.params.userId }
      : { id: Number(req.params.userId) }

    const user = await User.findOneAndUpdate(
      query,
      { extraPermissions, deniedPermissions },
      { new: true, runValidators: true }
    )
      .select('-password')
      .populate('extraPermissions', 'name displayName')
      .populate('deniedPermissions', 'name displayName')

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const effective = await getEffectivePermissions(user)
    res.json({
      success: true,
      data: {
        user,
        effectivePermissions: effective
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router
