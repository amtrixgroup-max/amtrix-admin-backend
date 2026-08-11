import express from 'express'
import Role from '../models/Role.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
    }

    const roles = await Role.find(filter)
      .populate('departmentId', 'name code displayName')
      .sort({ level: 1, name: 1 })
    res.json(roles)
  } catch (error) {
    next(error)
  }
})

export default router
