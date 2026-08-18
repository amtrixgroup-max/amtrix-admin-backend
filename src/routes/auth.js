import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import User from '../models/User.js'
import { authenticate, JWT_SECRET } from '../middleware/auth.js'
import { buildAuthUserPayload } from '../utils/permissions.js'
import { isPasswordValid } from '../utils/passwordPolicy.js'
import {
  collectUserAllowedIps,
  getClientIp,
  isAdminLikeUser,
  isIpAllowed,
  parseListedIps,
  shouldEnforceListedIp
} from '../utils/ipAccess.js'
import { logActivity } from '../utils/activityLog.js'

const router = express.Router()

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const userDoc = await User.findOne({ email: String(email).toLowerCase().trim() })
    if (!userDoc) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // If account suspended or inactive
    const status = String(userDoc.status || '').toUpperCase()
    if (status && status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is not active' })
    }

    // If account is temporarily locked due to failed attempts
    // This check should only apply when the account is ACTIVE
    const now = new Date()
    if (status === 'ACTIVE' && userDoc.lockedUntil && new Date(userDoc.lockedUntil) > now) {
      const lockedUntil = new Date(userDoc.lockedUntil)
      return res.status(423).json({
        error: 'Account temporarily locked due to multiple failed login attempts',
        lockedUntil: lockedUntil.toISOString(),
        message: `Account locked until ${lockedUntil.toISOString()}`
      })
    }

    const clientIp = getClientIp(req)
    const listedIps = parseListedIps(process.env.LISTED_IPS || process.env.LISTED_IP || '')
    const enforceForAll = String(process.env.ENFORCE_LISTED_IP_FOR_ALL || 'false').toLowerCase() === 'true'
    // By default do NOT restrict admins/super-admins; set env var to 'true' to enable
    const restrictAdmins = String(process.env.ENFORCE_LISTED_IP_FOR_ADMINS || 'false').toLowerCase() === 'true'

    const userAllowedIps = collectUserAllowedIps(userDoc)
    const isListed = isIpAllowed({ clientIp, listedIps, userAllowedIps })
    const isAdminLike = isAdminLikeUser(userDoc)

    console.log('Login attempt:', {
      email: userDoc.email,
      clientIp,
      listedIps,
      userAllowedIps
    })

    if (userDoc.password !== password) {
      const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS || 3)
      const lockMinutes = Number(process.env.LOCK_MINUTES || 5)

      userDoc.failedLoginAttempts = (userDoc.failedLoginAttempts || 0) + 1

      userDoc.loginAttemptLogs = userDoc.loginAttemptLogs || []

      if (userDoc.failedLoginAttempts >= maxAttempts) {
        const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000)
        userDoc.lockedUntil = lockedUntil
        userDoc.failedLoginAttempts = 0
        userDoc.loginAttemptLogs.push({
          ip: clientIp,
          isListed,
          success: false,
          reason: `Locked for ${lockMinutes} minutes after ${maxAttempts} failed attempts`
        })
        await userDoc.save()
        return res.status(423).json({
          error: 'Account temporarily locked due to multiple failed login attempts',
          lockedUntil: lockedUntil.toISOString(),
          message: `Account locked for ${lockMinutes} minutes due to ${maxAttempts} failed attempts`
        })
      }

      const remaining = Math.max(0, (Number(process.env.MAX_LOGIN_ATTEMPTS || 3) - userDoc.failedLoginAttempts))
      userDoc.loginAttemptLogs.push({
        ip: clientIp,
        isListed,
        success: false,
        reason: `Invalid credentials, ${remaining} attempts remaining`
      })
      await userDoc.save()
      return res.status(401).json({ error: 'Invalid email or password', attemptsRemaining: remaining })
    }

    const shouldEnforceIp = shouldEnforceListedIp({
      isAdminLike,
      listedIpsCount: listedIps.length,
      enforceForAll,
      restrictAdmins
    })

    if (shouldEnforceIp && !isListed) {
      // Reject only — do not suspend. Admins can whitelist a home IP and the user can retry.
      userDoc.loginAttemptLogs = userDoc.loginAttemptLogs || []
      userDoc.loginAttemptLogs.push({
        ip: clientIp,
        isListed,
        success: false,
        reason: 'IP not listed'
      })
      await userDoc.save()
      return res.status(403).json({
        error: 'Login from this IP is not allowed. Contact your Admin to whitelist this address.'
      })
    }

    // Prevent concurrent sessions: allow only one active session per user
    // If existing sessions exist, clear them so the new login replaces previous sessions
    if ((userDoc.activeSessions || []).length > 0) {
      userDoc.activeSessions = []
    }

    const userAgent = String(req.headers['user-agent'] || '')
    userDoc.lastLoginAt = new Date()
    userDoc.lastLoginUserAgent = userAgent
    userDoc.failedLoginAttempts = 0
    userDoc.loginAttemptLogs = userDoc.loginAttemptLogs || []
    userDoc.loginAttemptLogs.push({
      ip: clientIp,
      isListed,
      success: true,
      reason: 'Login successful',
      userAgent
    })

    const user = await buildAuthUserPayload(userDoc)

    const jti = crypto.randomBytes(16).toString('hex')
    // Token expiry: 30 minutes default, 5 hours when logging in from listed IP
    const expiresIn = isListed ? '5h' : '30m'

    const token = jwt.sign(
      {
        userId: userDoc._id,
        systemRole: user.systemRole,
        role: user.role,
        jti
      },
      JWT_SECRET,
      { expiresIn }
    )

    // Persist new active session
    userDoc.activeSessions = userDoc.activeSessions || []
    userDoc.activeSessions.push({ jti, ip: clientIp, userAgent, createdAt: new Date() })
    await userDoc.save()

    await logActivity({
      user: userDoc,
      action: 'User Logged In',
      description: `${userDoc.name || userDoc.email} signed in`,
      type: 'success',
      module: 'Auth'
    })

    // Keep previous response fields for existing frontend + add RBAC fields
    res.json({
      success: true,
      user,
      token,
      loginTime: new Date().toISOString(),
      selectedModule: null,
      effectiveRole: user.effectiveRole,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          systemRole: user.systemRole,
          department: user.department,
          role: user.role,
          subRole: user.subRole,
          permissions: user.permissions
        },
        token
      }
    })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const payload = req.tokenPayload || {}
    const jti = payload.jti
    const user = req.user
    if (jti && user) {
      user.activeSessions = (user.activeSessions || []).filter((s) => s.jti !== jti)
      await user.save()
    }
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// Change password (authenticated)
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'oldPassword and newPassword are required' })
    }

    const userDoc = await User.findById(req.user._id)
    if (!userDoc) return res.status(404).json({ success: false, message: 'User not found' })

    if (userDoc.password !== oldPassword) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    if (!isPasswordValid(newPassword)) {
      return res.status(400).json({ success: false, message: 'New password does not meet complexity requirements' })
    }

    userDoc.password = newPassword
    // Clear sessions so user must re-login
    userDoc.activeSessions = []
    await userDoc.save()

    res.json({ success: true, message: 'Password changed successfully; all sessions cleared, please login again' })
  } catch (error) {
    next(error)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await buildAuthUserPayload(req.user)
    res.json({ success: true, user })
  } catch (error) {
    next(error)
  }
})

router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const profile = await buildAuthUserPayload(req.user)
    res.json({ success: true, profile })
  } catch (error) {
    next(error)
  }
})

export { authenticate }
export default router
