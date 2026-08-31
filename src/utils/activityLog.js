import ActivityLog from '../models/ActivityLog.js'
import Role from '../models/Role.js'
import User from '../models/User.js'
import { isComplianceRole, isNormalUserRole } from './mcCheckAccess.js'

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

function canonicalActorRole(role) {
  if (role === 'BROKER' || role === 'USER') return 'NORMAL_USER'
  if (role === 'DEPARTMENT_ADMIN') return 'DEPT_ADMIN'
  if (role === 'TEAM_LEADER') return 'TL'
  if (role === 'ACCOUNT' || role === 'ACCOUNTING') return 'ACCOUNTS'
  return role
}

export function parseActorRoles(raw) {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map(normalizeRole)
      .map(canonicalActorRole)
      .filter((role) => role && role !== 'ALL'),
  )]
}

function actorRoleLabel(role, displayName) {
  if (role === 'NORMAL_USER') return 'Broker'
  if (role === 'COMPLIANCE') return 'Compliance'
  if (role === 'ACCOUNTS') return 'Accounts'
  if (role === 'DEPT_ADMIN') return 'Department Admin'
  if (role === 'TL') return 'Team Leader'
  if (role === 'SUPER_ADMIN') return 'Super Admin'
  if (role === 'ADMIN') return 'Admin'
  return displayName || role || 'User'
}

function resolveActorRole(user) {
  const roleName = user?.roleId?.name || user?.role || ''
  const displayName = user?.roleId?.displayName || ''
  if (user?.systemRole === 'SUPER_ADMIN' || roleName === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (isComplianceRole(roleName, displayName)) return 'COMPLIANCE'
  if (isNormalUserRole(roleName)) return 'NORMAL_USER'
  return canonicalActorRole(normalizeRole(roleName || user?.systemRole))
}

function roleMatchesWanted(user, wanted) {
  if (!wanted.size) return true
  const roleName = user?.roleId?.name || user?.role || ''
  const displayName = user?.roleId?.displayName || ''
  const resolved = resolveActorRole(user)
  const name = normalizeRole(roleName)
  const display = normalizeRole(displayName)
  if (wanted.has(resolved) || wanted.has(name) || wanted.has(display)) return true
  if (wanted.has('NORMAL_USER') && isNormalUserRole(roleName)) return true
  if (wanted.has('COMPLIANCE') && isComplianceRole(roleName, displayName)) return true
  return false
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
  const role = resolveActorRole(user)
  const displayName = user.roleId?.displayName || ''
  return {
    id: user._id,
    name: user.name || '',
    email: user.email || '',
    role,
    roleLabel: actorRoleLabel(role, displayName),
  }
}

export async function findUsersByActorRoles(roles, viewer) {
  const wanted = new Set(Array.isArray(roles) ? roles : parseActorRoles(roles))
  const filter = {}
  if (!isGlobalActivityViewer(viewer) && viewer?.departmentId) {
    filter.departmentId = viewer.departmentId
  }

  const users = await User.find(filter)
    .select('_id name email role systemRole roleId departmentId')
    .populate('roleId', 'name displayName')
    .sort({ name: 1 })
    .lean()

  if (!wanted.size) return users
  return users.filter((user) => roleMatchesWanted(user, wanted))
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
