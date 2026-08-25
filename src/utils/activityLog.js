import ActivityLog from '../models/ActivityLog.js'
import Role from '../models/Role.js'

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

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
