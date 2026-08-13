import express from 'express'
import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

async function findCustomerByParam(rawId) {
  if (rawId == null || rawId === '') return null
  let customer = await Customer.findOne({ id: rawId })
  if (!customer && /^[a-f\d]{24}$/i.test(String(rawId))) {
    customer = await Customer.findById(rawId)
  }
  return customer
}

router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
    }
    const customers = await Customer.find(filter)
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
    const customer = await findCustomerByParam(req.params.id)
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
    const payload = { ...req.body }
    if (payload.id == null || payload.id === '') {
      payload.id = `CUS-${Date.now()}`
    }
    const customer = new Customer(payload)
    await customer.save()

    if (payload.approvalRequestId) {
      await CustomerApprovalRequest.findByIdAndUpdate(payload.approvalRequestId, {
        customerId: customer.id,
        status: 'APPROVED'
      })
    }

    res.status(201).json(customer)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await findCustomerByParam(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    const payload = { ...req.body }
    delete payload._id

    const customer = await Customer.findByIdAndUpdate(existing._id, payload, {
      new: true,
      runValidators: true
    })
    res.json(customer)
  } catch (error) {
    next(error)
  }
})

export default router
