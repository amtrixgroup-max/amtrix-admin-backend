import express from 'express'
import Customer from '../models/Customer.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const customers = await Customer.find()
    res.json(customers)
  } catch (error) {
    next(error)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const { name, email } = req.query
    const customers = await Customer.find({ name, email })
    res.json(customers)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ id: req.params.id })
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }
    res.json(customer)
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const customer = new Customer(req.body)
    await customer.save()
    res.status(201).json(customer)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate({ id: req.params.id }, req.body, {
      new: true,
      runValidators: true
    })
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' })
    }
    res.json(customer)
  } catch (error) {
    next(error)
  }
})

export default router
