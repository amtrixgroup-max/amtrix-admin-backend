import express from 'express'
import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import Role from '../models/Role.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

const getRoleName = async (user) => {
  if (user.systemRole === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (user.roleId) {
    const role = await Role.findById(user.roleId).select('name').lean()
    if (role?.name) return role.name
  }
  return user.role || null
}

const isAccountsUser = async (user) => {
  const name = String((await getRoleName(user)) || '').toUpperCase()
  return name === 'ACCOUNTS' || name === 'ACCOUNT'
}

function serializeCustomer(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return {
    ...obj,
    id: obj.id ?? obj._id,
    approvalStatus: obj.approvalStatus || obj.status || 'ACTIVE'
  }
}

function customerFromRequest(request) {
  const obj = typeof request.toObject === 'function' ? request.toObject() : { ...request }
  return {
    id: obj.customerId || `req-${obj._id}`,
    name: obj.companyName,
    email: obj.contactPersonEmail,
    contact: obj.contactPersonName,
    phone: obj.contactPersonNumber,
    telephone: obj.contactPersonNumber,
    address: obj.address,
    billingAddress: obj.address,
    usdotNumber: obj.dunsNumber,
    dunsNumber: obj.dunsNumber,
    availableCredit: obj.approvedCredit ?? obj.requiredLimit ?? null,
    creditLimit: obj.approvedCredit ?? obj.requiredLimit ?? '',
    departmentId: obj.departmentId,
    departmentName: obj.departmentName,
    approvalRequestId: obj._id,
    approvalStatus: obj.status,
    status: obj.status,
    agentName: obj.agentName,
    agentEmail: obj.agentEmail,
    source: 'approval-request',
    reviewNotes: obj.reviewNotes || '',
    prepaidCreditRequired: obj.prepaidCreditRequired ?? null,
    prepaidNotes: obj.prepaidNotes || '',
    prepaidDocuments: obj.prepaidDocuments || [],
    prepaidRequestedAt: obj.prepaidRequestedAt || null
  }
}

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
    const isSuperAdmin = req.user.systemRole === 'SUPER_ADMIN'
    const accounts = await isAccountsUser(req.user)
    const departmentId = req.query.departmentId
      || (!isSuperAdmin && req.user.departmentId ? req.user.departmentId : null)

    const filter = {}
    const requestFilter = {}
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
      requestFilter.departmentId = req.query.departmentId
    } else if (accounts && req.user.departmentId) {
      filter.departmentId = req.user.departmentId
      requestFilter.departmentId = req.user.departmentId
    } else if (departmentId) {
      requestFilter.departmentId = departmentId
    }

    const customers = await Customer.find(filter)
    const list = customers.map(serializeCustomer)

    const requests = await CustomerApprovalRequest.find(requestFilter).sort({ createdAt: -1 })
    const linked = new Set(
      list
        .map((item) => (item.approvalRequestId ? String(item.approvalRequestId) : ''))
        .filter(Boolean),
    )

    for (const request of requests) {
      const requestId = String(request._id)
      const existing = list.find(
        (item) =>
          String(item.approvalRequestId || '') === requestId ||
          String(item.id) === String(request.customerId || ''),
      )
      if (existing) {
        existing.approvalStatus = request.status
        existing.status = request.status
        existing.reviewNotes = request.reviewNotes || existing.reviewNotes
        existing.prepaidCreditRequired = request.prepaidCreditRequired
        existing.prepaidNotes = request.prepaidNotes
        existing.prepaidDocuments = request.prepaidDocuments
        existing.prepaidRequestedAt = request.prepaidRequestedAt
        existing.approvalRequestId = existing.approvalRequestId || request._id
        continue
      }
      if (!linked.has(requestId)) {
        list.push(customerFromRequest(request))
      }
    }

    res.json({ success: true, data: list })
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
    res.json(serializeCustomer(customer))
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

    if (payload.approvalRequestId) {
      const existing = await Customer.findOne({ approvalRequestId: payload.approvalRequestId })
      if (existing) {
        delete payload._id
        payload.id = existing.id
        const customer = await Customer.findByIdAndUpdate(existing._id, payload, {
          new: true,
          runValidators: true
        })
        await CustomerApprovalRequest.findByIdAndUpdate(payload.approvalRequestId, {
          customerId: customer.id,
          status: payload.approvalStatus || payload.status || 'APPROVED'
        })
        return res.status(200).json(serializeCustomer(customer))
      }
    }

    const customer = new Customer(payload)
    await customer.save()

    if (payload.approvalRequestId) {
      await CustomerApprovalRequest.findByIdAndUpdate(payload.approvalRequestId, {
        customerId: customer.id,
        status: payload.approvalStatus || payload.status || 'APPROVED'
      })
    }

    res.status(201).json(serializeCustomer(customer))
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
    res.json(serializeCustomer(customer))
  } catch (error) {
    next(error)
  }
})

export default router
