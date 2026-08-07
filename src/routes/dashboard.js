import express from 'express'
import { authenticate } from './auth.js'
import Dashboard from '../models/Dashboard.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const dashboard = await Dashboard.findOne().lean()
    res.json(dashboard || {})
  } catch (error) {
    next(error)
  }
})

export default router
