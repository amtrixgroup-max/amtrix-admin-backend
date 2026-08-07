import express from 'express'
import Role from '../models/Role.js'
import { authenticate } from './auth.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const roles = await Role.find()
    res.json(roles)
  } catch (error) {
    next(error)
  }
})

export default router
