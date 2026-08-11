import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { authenticate, JWT_SECRET } from '../middleware/auth.js'
import { buildAuthUserPayload } from '../utils/permissions.js'

const router = express.Router()

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const userDoc = await User.findOne({
      email: String(email).toLowerCase().trim(),
      password
    })

    if (!userDoc) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const status = String(userDoc.status || '').toUpperCase()
    if (status && status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is not active' })
    }

    userDoc.lastLoginAt = new Date()
    await userDoc.save()

    const user = await buildAuthUserPayload(userDoc)

    const token = jwt.sign(
      {
        userId: userDoc._id,
        systemRole: user.systemRole,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    )

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
