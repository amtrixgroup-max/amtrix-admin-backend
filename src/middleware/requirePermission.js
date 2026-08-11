import {
  getEffectivePermissions,
  hasPermission,
  getPermissionScope,
  isTargetInScope
} from '../utils/permissions.js'
import User from '../models/User.js'

/**
 * Middleware: require a named permission (e.g. USER_UPDATE).
 * Super Admin always passes.
 */
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const user = req.user

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        })
      }

      if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN') {
        req.permissionScope = 'ALL'
        req.effectivePermissions = [{ name: '*', scope: 'ALL' }]
        return next()
      }

      const permissions = await getEffectivePermissions(user)
      req.effectivePermissions = permissions

      if (!hasPermission(permissions, permissionName)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action'
        })
      }

      req.permissionScope = getPermissionScope(permissions, permissionName)
      next()
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      })
    }
  }
}

/**
 * Optional: after requirePermission, ensure target user id is within scope.
 * Looks up target by Mongo _id or legacy numeric id.
 */
export const requireUserScope = (paramName = 'id') => {
  return async (req, res, next) => {
    try {
      if (req.user?.systemRole === 'SUPER_ADMIN' || req.permissionScope === 'ALL') {
        return next()
      }

      const rawId = req.params[paramName]
      let targetUser = null

      if (/^[a-f\d]{24}$/i.test(String(rawId))) {
        targetUser = await User.findById(rawId).select('-password')
      }

      if (!targetUser && !Number.isNaN(Number(rawId))) {
        targetUser = await User.findOne({ id: Number(rawId) }).select('-password')
      }

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'Target user not found'
        })
      }

      const allowed = await isTargetInScope({
        actor: req.user,
        targetUser,
        scope: req.permissionScope
      })

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Target is outside your permission scope'
        })
      }

      req.targetUser = targetUser
      next()
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Scope authorization failed'
      })
    }
  }
}

export default requirePermission
