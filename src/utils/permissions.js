import Role from '../models/Role.js'
import Permission from '../models/Permission.js'
import Department from '../models/Department.js'
import User from '../models/User.js'

const SCOPE_RANK = {
  OWN: 1,
  TEAM: 2,
  DEPARTMENT: 3,
  ALL: 4
}

const normalizeStatus = (status) => String(status || '').toUpperCase()

const pickHigherScope = (current, next) => {
  if (!current) return next
  if (!next) return current
  return (SCOPE_RANK[next] || 0) >= (SCOPE_RANK[current] || 0) ? next : current
}

/**
 * Effective permissions =
 * role permissions (+ optional sub-role overrides)
 * + extraPermissions
 * - deniedPermissions
 *
 * Super Admin → ["*"] with scope ALL
 */
export async function getEffectivePermissions(user) {
  if (!user) return []

  if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN') {
    return [{ name: '*', scope: 'ALL', permissionId: null }]
  }

  const permissionMap = new Map()

  if (user.roleId) {
    const role = await Role.findById(user.roleId).lean()
    if (role && normalizeStatus(role.status) === 'ACTIVE') {
      for (const item of role.permissions || []) {
        const key = String(item.permissionId)
        permissionMap.set(key, {
          permissionId: item.permissionId,
          scope: item.scope || 'OWN'
        })
      }

      if (user.subRole && Array.isArray(role.subRoles)) {
        const sub = role.subRoles.find(
          (s) => String(s.name).toUpperCase() === String(user.subRole).toUpperCase()
        )
        if (sub?.permissions?.length) {
          for (const item of sub.permissions) {
            const key = String(item.permissionId)
            const existing = permissionMap.get(key)
            permissionMap.set(key, {
              permissionId: item.permissionId,
              scope: pickHigherScope(existing?.scope, item.scope || 'OWN')
            })
          }
        }
      }
    }
  }

  for (const permissionId of user.extraPermissions || []) {
    const key = String(permissionId)
    const existing = permissionMap.get(key)
    permissionMap.set(key, {
      permissionId,
      scope: pickHigherScope(existing?.scope, 'OWN')
    })
  }

  for (const permissionId of user.deniedPermissions || []) {
    permissionMap.delete(String(permissionId))
  }

  const ids = [...permissionMap.keys()]
  if (!ids.length) return []

  const docs = await Permission.find({
    _id: { $in: ids },
    status: 'ACTIVE'
  }).lean()

  const byId = new Map(docs.map((doc) => [String(doc._id), doc]))

  return [...permissionMap.entries()]
    .map(([id, value]) => {
      const doc = byId.get(id)
      if (!doc) return null
      return {
        name: doc.name,
        scope: value.scope,
        permissionId: doc._id,
        module: doc.module,
        action: doc.action
      }
    })
    .filter(Boolean)
}

export function hasPermission(effectivePermissions, permissionName) {
  if (!permissionName) return false
  if (effectivePermissions.some((p) => p.name === '*')) return true
  return effectivePermissions.some((p) => p.name === permissionName)
}

export function getPermissionScope(effectivePermissions, permissionName) {
  const star = effectivePermissions.find((p) => p.name === '*')
  if (star) return 'ALL'
  const match = effectivePermissions.find((p) => p.name === permissionName)
  return match?.scope || null
}

export async function isTargetInScope({ actor, targetUser, scope }) {
  if (!actor || !targetUser) return false
  if (scope === 'ALL') return true

  const actorId = String(actor._id)
  const targetId = String(targetUser._id)

  if (scope === 'OWN') {
    return actorId === targetId
  }

  if (scope === 'TEAM') {
    if (actorId === targetId) return true
    return String(targetUser.managerId || '') === actorId
  }

  if (scope === 'DEPARTMENT') {
    if (!actor.departmentId || !targetUser.departmentId) return false
    return String(actor.departmentId) === String(targetUser.departmentId)
  }

  return false
}

export async function buildAuthUserPayload(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc }
  delete user.password

  const [department, role, effectivePermissions] = await Promise.all([
    user.departmentId ? Department.findById(user.departmentId).lean() : null,
    user.roleId ? Role.findById(user.roleId).lean() : null,
    getEffectivePermissions(user)
  ])

  const permissionNames =
    effectivePermissions[0]?.name === '*'
      ? ['*']
      : effectivePermissions.map((p) => p.name)

  const systemRole = user.systemRole || (user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'USER')
  const roleName =
    systemRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : role?.name || user.role || null
  const departmentCode = department?.code || user.department || null

  return {
    ...user,
    id: user.id ?? user._id,
    systemRole,
    department: departmentCode,
    departmentId: user.departmentId || null,
    departmentInfo: department
      ? {
          id: department._id,
          name: department.name,
          displayName: department.displayName,
          code: department.code
        }
      : null,
    role: roleName,
    roleId: user.roleId || null,
    roleInfo: role
      ? {
          id: role._id,
          name: role.name,
          displayName: role.displayName,
          level: role.level,
          subRoles: role.subRoles || []
        }
      : null,
    subRole: user.subRole || null,
    permissions: permissionNames,
    permissionDetails: effectivePermissions,
    effectiveRole: systemRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : roleName
  }
}

export async function getTeamMemberIds(managerId) {
  const members = await User.find({ managerId }).select('_id').lean()
  return members.map((m) => String(m._id))
}
