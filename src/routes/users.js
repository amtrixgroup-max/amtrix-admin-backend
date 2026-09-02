import express from 'express'
import User from '../models/User.js'
import { isPasswordValid } from '../utils/passwordPolicy.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'

const router = express.Router()
router.use(authenticate)

const sanitizeUser = (userDoc) => {
  if (!userDoc) return null
  const user = userDoc.toObject({ getters: true })
  delete user.password
  return user
}

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().select('-password')
    res.json(users)
  } catch (error) {
    next(error)
  }
})

router.get('/assignable', async (req, res, next) => {
  try {
    const users = await User.find({
      status: { $nin: ['INACTIVE', 'Inactive', 'DISABLED', 'SUSPENDED', 'Suspended'] },
    })
      .select('_id name email')
      .sort({ name: 1 })
      .lean()

    res.json({
      success: true,
      data: users.map((user) => ({
        id: String(user._id),
        _id: String(user._id),
        name: user.name || '',
        email: user.email || '',
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findOne({ id: req.params.id }).select('-password')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const payload = { ...req.body }

    if (!payload.systemRole) {
      if (payload.role === 'SUPER_ADMIN') payload.systemRole = 'SUPER_ADMIN'
      else if (String(payload.role || '').startsWith('ADMIN')) payload.systemRole = 'ADMIN'
      else payload.systemRole = 'USER'
    }

    if (payload.status === 'Active') payload.status = 'ACTIVE'
    if (payload.status === 'Inactive') payload.status = 'INACTIVE'

    // Enforce password policy only when password is provided (don't block legacy users)
    if (payload.password && !isPasswordValid(payload.password)) {
      return res.status(400).json({ error: 'Password does not meet complexity requirements' })
    }

    const user = new User(payload)
    await user.save()
    await logActivity({
      req,
      action: 'User Added',
      description: `New user ${user.name || user.email} created`,
      type: 'create',
      module: 'Users'
    })
    res.status(201).json(sanitizeUser(user))
  } catch (error) {
    next(error)
  }
})


router.put('/:id', async (req, res, next) => {
  try {
    const payload = { ...req.body }
    if (payload.password === '') {
      delete payload.password
    }
    if (payload.password && !isPasswordValid(payload.password)) {
      return res.status(400).json({ error: 'Password does not meet complexity requirements' })
    }
    const user = await User.findOneAndUpdate({ id: req.params.id }, payload, { new: true, runValidators: true }).select('-password')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  } catch (error) {
    next(error)
  }
})

export default router
