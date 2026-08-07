import express from 'express'
import { authenticate } from './auth.js'
import ActivityLog from '../models/ActivityLog.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const activityLogs = await ActivityLog.find().sort({ timestamp: -1 })
    res.json(activityLogs)
  } catch (error) {
    next(error)
  }
})

export default router
