/**
 * Shared IP helpers for office-list + per-user WFH whitelist checks.
 */

export function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return ''
  const trimmed = ip.trim()
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7)
  if (trimmed === '::1') return '127.0.0.1'
  return trimmed
}

export function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'] || ''
  if (xf) {
    const first = String(xf).split(',')[0].trim()
    return normalizeIp(first)
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '')
}

export function isAdminLikeUser(user) {
  if (!user) return false
  return (
    user.systemRole === 'SUPER_ADMIN' ||
    user.systemRole === 'ADMIN' ||
    user.role === 'SUPER_ADMIN'
  )
}

export function parseListedIps(envValue) {
  return String(envValue || '')
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean)
}

export function collectUserAllowedIps(user) {
  return (user?.allowedIps || []).map((s) => normalizeIp(s)).filter(Boolean)
}

export function isIpAllowed({ clientIp, listedIps = [], userAllowedIps = [] }) {
  const ip = normalizeIp(clientIp)
  if (!ip) return false
  return listedIps.includes(ip) || userAllowedIps.includes(ip)
}

/**
 * Super Admin / Admin are unrestricted unless env flags force it.
 * Regular users are restricted only when a global office list (LISTED_IPS) is configured.
 * Per-user allowedIps are extra allow-list entries on top of that office list.
 */
export function shouldEnforceListedIp({
  isAdminLike,
  listedIpsCount,
  enforceForAll = false,
  restrictAdmins = false
}) {
  if (!listedIpsCount) return false
  if (!isAdminLike) return true
  return Boolean(enforceForAll || restrictAdmins)
}
