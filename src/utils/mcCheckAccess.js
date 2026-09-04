import User from '../models/User.js'
import Role from '../models/Role.js'
import Department from '../models/Department.js'

export const PENDING_REVIEW_STATUSES = ['PENDING', 'EXCEPTION_PENDING']
export const DOT_GATE_STATUSES = ['ADD_CARRIER_REQUESTED']
export const ADMIN_MC_APPROVED_STATUSES = ['APPROVED', 'EXCEPTION_APPROVED', 'ADD_CARRIER_REQUESTED', 'CARRIER_ADDED']

export const canOpenDotGate = (status) => DOT_GATE_STATUSES.includes(String(status || '').toUpperCase())

export const getRoleMeta = async (user) => {
  if (user?.systemRole === 'SUPER_ADMIN') return { name: 'SUPER_ADMIN', displayName: 'Super Admin' }
  if (user?.roleId) {
    const role = await Role.findById(user.roleId).select('name displayName').lean()
    if (role?.name) return { name: role.name, displayName: role.displayName || '' }
  }
  return { name: user?.role || null, displayName: '' }
}

export const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

export const isComplianceRole = (roleName, displayName = '') => {
  const name = normalizeRole(roleName)
  const display = normalizeRole(displayName)
  return name === 'COMPLIANCE' || name.includes('COMPLIANCE') || display === 'COMPLIANCE' || display.includes('COMPLIANCE')
}

export const isNormalUserRole = (roleName) => {
  const name = normalizeRole(roleName)
  return name === 'NORMAL_USER' || name === 'USER'
}

export const canBuildLoad = async (user) => {
  if (!user) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return true
  const meta = await getRoleMeta(user)
  return isNormalUserRole(meta.name)
}

export const isDeptAdminUser = async (user) => {
  if (!user) return false
  const meta = await getRoleMeta(user)
  const name = normalizeRole(meta.name)
  return name === 'DEPT_ADMIN' || name === 'DEPARTMENT_ADMIN'
}

export const isAccountsUser = async (user) => {
  if (!user || isSuperAdminUser(user)) return false
  const meta = await getRoleMeta(user)
  const name = normalizeRole(meta.name)
  const display = normalizeRole(meta.displayName)
  return name === 'ACCOUNTS' || name === 'ACCOUNT' || display === 'ACCOUNTS' || display === 'ACCOUNT'
}

export const canUploadLoadDocuments = async (user) => {
  if (!user) return false
  if (await isDeptAdminUser(user)) return true
  if (await isAccountsUser(user)) return true
  const meta = await getRoleMeta(user)
  return isNormalUserRole(meta.name)
}

export const canSendLoadToAccounting = async (user) => {
  if (!user) return false
  if (await isDeptAdminUser(user)) return true
  const meta = await getRoleMeta(user)
  return isNormalUserRole(meta.name)
}

export const canWriteCarrier = async (user) => {
  if (!user) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return true
  if (await isDeptAdminUser(user)) return true
  if (await isComplianceUser(user)) return true
  return false
}

export const isSuperAdminUser = (user) =>
  Boolean(user && (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN'))

export const isElevatedAdmin = async (user) => {
  if (!user) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return true
  const meta = await getRoleMeta(user)
  const name = normalizeRole(meta.name)
  return name === 'DEPT_ADMIN' || name === 'DEPARTMENT_ADMIN'
}

export const isComplianceUser = async (user) => {
  if (!user || isSuperAdminUser(user) || user.systemRole === 'ADMIN') return false
  const meta = await getRoleMeta(user)
  return isComplianceRole(meta.name, meta.displayName)
}

export const isComplianceHead = async (user) => {
  if (!(await isComplianceUser(user))) return false
  return normalizeRole(user.subRole) === 'HEAD'
}

export const canSubmitMcCheck = async (user) => {
  if (!user?.departmentId) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return false
  const meta = await getRoleMeta(user)
  const roleName = String(meta.name || '')
  if (['SUPER_ADMIN', 'DEPT_ADMIN', 'ACCOUNTS', 'ACCOUNT', 'COMPLIANCE', 'TL'].includes(normalizeRole(roleName))) {
    return false
  }
  return isNormalUserRole(roleName)
}

export const canReviewMcCheck = async (user) => {
  if (!user) return false
  if (await isElevatedAdmin(user)) return true
  return isComplianceUser(user)
}

export const canRevokeOrBlockMcCheck = async (user) => {
  if (!user) return false
  if (await isElevatedAdmin(user)) return true
  return isComplianceHead(user)
}

export const isAdminMcPreviewRole = async (user) => {
  if (!user) return false
  return isElevatedAdmin(user)
}

export const canAcceptRejectMcCheckStatus = async (user, status) => {
  const current = String(status || '').toUpperCase()
  if (await isComplianceUser(user)) return PENDING_REVIEW_STATUSES.includes(current)
  if (await isElevatedAdmin(user)) return current === 'EXCEPTION_PENDING'
  return false
}

export const canRevokeMcCheckStatus = async (user, status) => {
  const current = String(status || '').toUpperCase()
  if (!(await canRevokeOrBlockMcCheck(user))) return false
  if (await isElevatedAdmin(user)) {
    return [...ADMIN_MC_APPROVED_STATUSES, 'BLOCKED'].includes(current)
  }
  return ['APPROVED', 'REJECTED', 'EXCEPTION_APPROVED', 'EXCEPTION_REJECTED', 'CARRIER_ADDED', 'ADD_CARRIER_REQUESTED', 'BLOCKED'].includes(
    current,
  )
}

export const canBlockMcCheckStatus = async (user, status) => {
  const current = String(status || '').toUpperCase()
  if (current === 'BLOCKED') return false
  if (await isComplianceUser(user)) return true
  if (await isElevatedAdmin(user)) return ADMIN_MC_APPROVED_STATUSES.includes(current)
  return false
}

export const canSeeAllDepartments = (user) => isSuperAdminUser(user)

export const departmentFilterForViewer = (user) => {
  if (canSeeAllDepartments(user)) return {}
  if (user?.departmentId) return { departmentId: user.departmentId }
  return {}
}

/** Resolve Mongo department filter for list APIs. Super Admin may pass department/module code. */
export async function resolveDepartmentScopeFilter(user, query = {}) {
  if (!canSeeAllDepartments(user)) {
    return user?.departmentId ? { departmentId: user.departmentId } : {}
  }
  const requested = String(query.department || query.module || '')
    .trim()
    .toUpperCase()
  if (!requested || requested === 'ALL') return {}
  const department = await Department.findOne({
    $or: [{ code: requested }, { name: requested }, { displayName: requested }],
  })
    .select('_id code name displayName')
    .lean()
  if (!department?._id) return { departmentId: null }
  return { departmentId: department._id }
}

export async function resolveScopedDepartment(user, query = {}) {
  const filter = await resolveDepartmentScopeFilter(user, query)
  if (!filter.departmentId) return null
  return Department.findById(filter.departmentId).select('_id code name displayName').lean()
}

export const sameDepartment = (user, item) =>
  Boolean(user?.departmentId && item?.departmentId && String(user.departmentId) === String(item.departmentId))

export const canAccessDepartmentItem = async (user, item) => {
  if (!user || !item) return false
  if (canSeeAllDepartments(user)) return true
  if (await isElevatedAdmin(user)) {
    if (!user.departmentId) return true
    return sameDepartment(user, item)
  }
  return sameDepartment(user, item)
}

export const canViewRequest = async (user, item) => {
  if (!user || !item) return false
  if (String(item.requesterId) === String(user._id)) return true
  if (await isElevatedAdmin(user)) return canAccessDepartmentItem(user, item)
  const compliance = await isComplianceUser(user)
  return compliance && sameDepartment(user, item)
}

export const identifierLabel = (item) => {
  const parts = []
  if (item?.mcNo) parts.push(`MC ${item.mcNo}`)
  if (item?.dotNo) parts.push(`DOT ${item.dotNo}`)
  return parts.join(' / ') || 'carrier check'
}

const activeUserFilter = { status: { $in: ['ACTIVE', 'Active'] } }

export const findComplianceUsers = async (departmentId) => {
  const query = departmentId ? { ...activeUserFilter, departmentId } : activeUserFilter
  const users = await User.find(query).populate('roleId', 'name displayName').select('-password')

  let matches = users.filter(
    (user) =>
      isComplianceRole(user.roleId?.name || user.role, user.roleId?.displayName) ||
      user.systemRole === 'ADMIN' ||
      normalizeRole(user.roleId?.name || user.role) === 'DEPT_ADMIN' ||
      normalizeRole(user.roleId?.name || user.role) === 'DEPARTMENT_ADMIN',
  )

  if (!matches.length) {
    const allUsers = await User.find(activeUserFilter).populate('roleId', 'name displayName').select('-password')
    matches = allUsers.filter((user) =>
      isComplianceRole(user.roleId?.name || user.role, user.roleId?.displayName),
    )
  }

  return matches
}

export const findSuperAdminUsers = async () =>
  User.find({
    ...activeUserFilter,
    $or: [{ systemRole: 'SUPER_ADMIN' }, { role: 'SUPER_ADMIN' }],
  }).select('-password')

export const findAdminUsers = async () =>
  User.find({
    ...activeUserFilter,
    $or: [{ systemRole: 'ADMIN' }, { role: 'ADMIN' }],
  })
    .populate('roleId', 'name displayName')
    .select('-password')

export const canAssignBrokerTargets = async (user) => {
  if (!user) return false
  if (await isElevatedAdmin(user)) return true
  return isComplianceUser(user)
}

export const findPendingReviewRecipients = async (departmentId) => {
  const compliance = await findComplianceUsers(departmentId)
  const seen = new Set()
  return compliance.filter((user) => {
    const id = String(user?._id || '')
    if (!id || seen.has(id)) return false
    const roleName = user.roleId?.name || user.role
    const displayName = user.roleId?.displayName || ''
    if (!isComplianceRole(roleName, displayName)) return false
    seen.add(id)
    return true
  })
}

export const serializeRequest = (doc) => {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const status = String(obj.status || '').toUpperCase()
  return {
    ...obj,
    id: obj._id,
    canRequestAddCarrier: ['APPROVED', 'EXCEPTION_APPROVED'].includes(status),
    canRequestException: status === 'REJECTED',
    canShowDotGate: canOpenDotGate(status),
    canAccept: PENDING_REVIEW_STATUSES.includes(status),
    canReject: PENDING_REVIEW_STATUSES.includes(status),
    canRevoke: ['APPROVED', 'REJECTED', 'EXCEPTION_APPROVED', 'EXCEPTION_REJECTED', 'CARRIER_ADDED', 'BLOCKED'].includes(
      status,
    ),
    canBlock: status !== 'BLOCKED',
    preview: obj.dotGate?.preview || null,
  }
}
