import express from 'express'
import { authenticate } from './auth.js'
import Onboarding from '../models/Onboarding.js'
import Career from '../models/Career.js'
import Customer from '../models/Customer.js'

const router = express.Router()
router.use(authenticate)

router.get('/user-types', async (req, res, next) => {
  try {
    const onboarding = await Onboarding.findOne().lean()
    res.json(onboarding?.userTypes || [])
  } catch (error) {
    next(error)
  }
})

router.get('/careers', async (req, res, next) => {
  try {
    const careers = await Career.find().lean()
    res.json(careers)
  } catch (error) {
    next(error)
  }
})

router.get('/customers', async (req, res, next) => {
  try {
    const customers = await Customer.find().lean()
    res.json(customers)
  } catch (error) {
    next(error)
  }
})

router.get('/all', async (req, res, next) => {
  try {
    const [onboarding, careers, customers] = await Promise.all([
      Onboarding.findOne().lean(),
      Career.find().lean(),
      Customer.find().lean()
    ])

    res.json({
      userTypes: onboarding?.userTypes || [],
      careers: careers || [],
      customers: customers || []
    })
  } catch (error) {
    next(error)
  }
})

export default router
