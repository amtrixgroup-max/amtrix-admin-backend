import express from 'express'
import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import Role from '../models/Role.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'
import {
  andFilter,
  listResponse,
  mongoSort,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'
import { syncCustomersFromLoads } from '../utils/customerFromLoad.js'

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
  const raw = String(obj.approvalStatus || obj.status || 'APPROVED').toUpperCase()
  const approvalStatus = raw === 'ACTIVE' ? 'APPROVED' : raw
  return {
    ...obj,
    id: obj.id ?? obj._id,
    status: approvalStatus,
    approvalStatus,
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
  const id = String(rawId).trim()
  const clauses = [{ id }]
  if (/^\d+$/.test(id)) clauses.push({ id: Number(id) })
  if (/^[a-f\d]{24}$/i.test(id)) clauses.push({ _id: id })
  return Customer.findOne({ $or: clauses })
}

async function findApprovalRequestByParam(rawId) {
  if (rawId == null || rawId === '') return null
  const id = String(rawId).trim()
  const clauses = [{ customerId: id }]
  if (/^\d+$/.test(id)) clauses.push({ customerId: Number(id) })
  if (/^[a-f\d]{24}$/i.test(id)) {
    clauses.push({ _id: id }, { customerId: id })
  }
  return CustomerApprovalRequest.findOne({ $or: clauses })
}

router.get('/', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.systemRole === 'SUPER_ADMIN'
    const accounts = await isAccountsUser(req.user)
    const departmentId = req.query.departmentId
      || (!isSuperAdmin && req.user.departmentId ? req.user.departmentId : null)

    await syncCustomersFromLoads(isSuperAdmin ? null : departmentId)

    const filter = {}
    const requestFilter = {}
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
      requestFilter.departmentId = req.query.departmentId
    } else if (accounts && req.user.departmentId) {
      const dept = String(req.user.departmentId)
      filter.$or = [{ departmentId: req.user.departmentId }, { departmentId: dept }]
      requestFilter.departmentId = req.user.departmentId
    } else if (departmentId) {
      requestFilter.departmentId = departmentId
    }

    const list = parseListQuery(req.query)
    const status = String(req.query.status || '').toUpperCase()
    const searchFilter = textSearch(
      ['name', 'contact', 'address', 'phone', 'email', 'usdotNumber', 'mcNumber', 'approvalStatus'],
      list.search,
    )
    const requestSearch = textSearch(
      ['companyName', 'contactPersonName', 'contactPersonNumber', 'address', 'status', 'requesterName'],
      list.search,
    )

    if (list.paginate && ['PENDING', 'REJECTED', 'PREPAID'].includes(status)) {
      const requestQuery = andFilter(requestFilter, { status }, requestSearch)
      const { items, total } = await paginateFind(CustomerApprovalRequest, requestQuery, {
        ...list,
        sort: mongoSort(req.query.sort || '-createdAt'),
      })
      return res.json(listResponse(items.map(customerFromRequest), { ...list, total }))
    }

    if (list.paginate) {
      const customerQuery = andFilter(
        filter,
        status === 'APPROVED' ? { approvalStatus: { $in: ['APPROVED', 'ACTIVE', null, ''] } } : {},
        searchFilter,
      )
      const { items, total } = await paginateFind(Customer, customerQuery, {
        ...list,
        sort: mongoSort(req.query.sort || 'name'),
      })
      const mapped = items.map(serializeCustomer)
      const requestIds = mapped
        .map((item) => item.approvalRequestId)
        .filter(Boolean)
      const customerIds = mapped.map((item) => item.id).filter(Boolean)
      if (requestIds.length || customerIds.length) {
        const requests = await CustomerApprovalRequest.find({
          $or: [
            ...(requestIds.length ? [{ _id: { $in: requestIds } }] : []),
            ...(customerIds.length ? [{ customerId: { $in: customerIds } }] : []),
          ],
        })
        for (const request of requests) {
          const requestId = String(request._id)
          const existing = mapped.find(
            (item) =>
              String(item.approvalRequestId || '') === requestId ||
              String(item.id) === String(request.customerId || ''),
          )
          if (!existing) continue
          existing.approvalStatus = request.status
          existing.status = request.status
          existing.reviewNotes = request.reviewNotes || existing.reviewNotes
          existing.prepaidCreditRequired = request.prepaidCreditRequired
          existing.prepaidNotes = request.prepaidNotes
          existing.prepaidDocuments = request.prepaidDocuments
          existing.prepaidRequestedAt = request.prepaidRequestedAt
          existing.approvalRequestId = existing.approvalRequestId || request._id
        }
      }
      return res.json(listResponse(mapped, { ...list, total }))
    }

    const customers = await Customer.find(filter)
    const resultList = customers.map(serializeCustomer)

    const requests = await CustomerApprovalRequest.find(requestFilter).sort({ createdAt: -1 })
    const linked = new Set(
      resultList
        .map((item) => (item.approvalRequestId ? String(item.approvalRequestId) : ''))
        .filter(Boolean),
    )

    for (const request of requests) {
      const requestId = String(request._id)
      const existing = resultList.find(
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
        resultList.push(customerFromRequest(request))
      }
    }

    res.json({ success: true, data: resultList })
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
    if (customer) {
      return res.json(serializeCustomer(customer))
    }
    const request = await findApprovalRequestByParam(req.params.id)
    if (request) {
      return res.json(customerFromRequest(request))
    }
    return res.status(404).json({ error: 'Customer not found' })
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

    await logActivity({
      req,
      action: 'Customer Added',
      description: `New customer ${customer.name || customer.id} onboarded`,
      type: 'create',
      module: 'Customers'
    })

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
