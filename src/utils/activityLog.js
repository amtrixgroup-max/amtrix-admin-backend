import ActivityLog from '../models/ActivityLog.js'
import Role from '../models/Role.js'
import User from '../models/User.js'
import { isComplianceRole, isNormalUserRole } from './mcCheckAccess.js'

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

export function parseActorRoles(raw) {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map(normalizeRole)
      .map((role) => {
        if (role === 'BROKER' || role === 'USER') return 'NORMAL_USER'
        return role
      })
      .filter((role) => role === 'NORMAL_USER' || role === 'COMPLIANCE'),
  )]
}

function isGlobalActivityViewer(user) {
  return (
    user?.systemRole === 'SUPER_ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.systemRole === 'ADMIN'
  )
}

export function serializeActor(user) {
  if (!user) return null
  const roleName = user.roleId?.name || user.role || ''
  const displayName = user.roleId?.displayName || ''
  const compliance = isComplianceRole(roleName, displayName)
  return {
    id: user._id,
    name: user.name || '',
    email: user.email || '',
    role: compliance ? 'COMPLIANCE' : 'NORMAL_USER',
    roleLabel: compliance ? 'Compliance' : 'Normal User',
  }
}

export async function findUsersByActorRoles(roles, viewer) {
  const wanted = new Set(Array.isArray(roles) ? roles : parseActorRoles(roles))
  if (!wanted.size) return []

  const roleDocs = await Role.find({}).select('name displayName').lean()
  const matchingRoleIds = roleDocs
    .filter((role) => {
      if (wanted.has('COMPLIANCE') && isComplianceRole(role.name, role.displayName)) return true
      if (wanted.has('NORMAL_USER') && isNormalUserRole(role.name)) return true
      return false
    })
    .map((role) => role._id)

  const or = []
  if (matchingRoleIds.length) or.push({ roleId: { $in: matchingRoleIds } })
  if (wanted.has('NORMAL_USER')) or.push({ role: { $in: ['NORMAL_USER', 'USER'] } })
  if (wanted.has('COMPLIANCE')) or.push({ role: { $regex: /compliance/i } })
  if (!or.length) return []

  const filter = {
    $and: [
      { $or: or },
      { systemRole: { $nin: ['SUPER_ADMIN', 'ADMIN'] } },
    ],
  }
  if (!isGlobalActivityViewer(viewer) && viewer?.departmentId) {
    filter.$and.push({ departmentId: viewer.departmentId })
  }

  return User.find(filter)
    .select('_id name email role roleId')
    .populate('roleId', 'name displayName')
    .sort({ name: 1 })
    .lean()
}

export function deviceFromUserAgent(ua = '') {
  const value = String(ua || '').trim()
  if (!value) return 'Unknown'
  const browser = /Edg\//i.test(value)
    ? 'Edge'
    : /Chrome\//i.test(value)
      ? 'Chrome'
      : /Firefox\//i.test(value)
        ? 'Firefox'
        : /Safari\//i.test(value)
          ? 'Safari'
          : value
            ? 'Browser'
            : 'Unknown'
  const os = /Windows/i.test(value)
    ? 'Windows'
    : /Mac OS|Macintosh/i.test(value)
      ? 'macOS'
      : /Android/i.test(value)
        ? 'Android'
        : /Linux/i.test(value)
          ? 'Linux'
          : 'Unknown'
  return `${browser} / ${os}`
}

export function serializeActivity(log) {
  if (!log) return null
  const obj = log.toObject ? log.toObject() : { ...log }
  return {
    id: obj._id || obj.id,
    action: obj.action || '',
    description: obj.description || '',
    user: obj.user || '',
    userEmail: obj.userEmail || '',
    timestamp: obj.timestamp || obj.createdAt,
    type: String(obj.type || 'info').toLowerCase(),
    module: obj.module || 'System',
    metadata: obj.metadata || null,
  }
}

async function getRoleName(user) {
  if (!user) return null
  if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (user.roleId) {
    if (typeof user.roleId === 'object' && user.roleId.name) return user.roleId.name
    const role = await Role.findById(user.roleId).select('name').lean()
    if (role?.name) return role.name
  }
  return user.role || null
}

export async function canViewAllActivityLogs(user) {
  if (!user) return false
  if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') {
    return true
  }
  const name = normalizeRole(await getRoleName(user))
  return name === 'DEPT_ADMIN' || name === 'DEPARTMENT_ADMIN'
}

export async function logActivity({
  req,
  user,
  action,
  description,
  type = 'info',
  module = 'System',
  metadata = null,
} = {}) {
  try {
    const actor = user || req?.user
    if (!action) return null
    return await ActivityLog.create({
      action,
      description: description || '',
      user: actor?.name || 'System',
      userId: actor?._id || null,
      userEmail: actor?.email || '',
      timestamp: new Date(),
      type: String(type || 'info').toLowerCase(),
      module: module || 'System',
      departmentId: actor?.departmentId || null,
      metadata: metadata || null,
    })
  } catch (error) {
    console.error('Activity log failed:', error?.message || error)
    return null
  }
}
