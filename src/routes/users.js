import express from 'express'
import User from '../models/User.js'
import { authenticate } from './auth.js'

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
    const payload = req.body
    const user = new User(payload)
    await user.save()
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
