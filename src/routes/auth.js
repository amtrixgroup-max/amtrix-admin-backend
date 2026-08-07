import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'amtrix-secret'

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    if (!token) {
      return res.status(401).json({ error: 'Authorization token missing' })
    }

    const payload = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(payload.userId).select('-password')
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await User.findOne({ email, password }).select('-password')
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: '12h'
    })

    res.json({
      user,
      token,
      loginTime: new Date().toISOString(),
      selectedModule: null,
      effectiveRole: user.role
    })
  } catch (error) {
    next(error)
  }
})

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user })
})

router.get('/profile', authenticate, (req, res) => {
  res.json({ profile: req.user })
})

export { authenticate }
export default router
