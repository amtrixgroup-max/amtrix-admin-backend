import express from 'express'
import { authenticate } from './auth.js'
import Setting from '../models/Setting.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const setting = await Setting.findOne().lean()
    res.json(setting || {})
  } catch (error) {
    next(error)
  }
})

export default router
