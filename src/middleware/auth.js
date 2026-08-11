import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'amtrix-secret'

export const authenticate = async (req, res, next) => {
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

    const status = String(user.status || '').toUpperCase()
    if (status && status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is not active' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

export { JWT_SECRET }
