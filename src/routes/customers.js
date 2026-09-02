import express from 'express'
import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import Role from '../models/Role.js'
import { authenticate } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLog.js'
import {
  isElevatedAdmin,
  isSuperAdminUser,
} from '../utils/mcCheckAccess.js'
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

function asId(value) {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.id || '')
  return String(value)
}

function isPrepaidApproval(item = {}) {
  const mode = String(item.paymentMode || item.paymentTerms || '').toUpperCase()
  if (mode.includes('PREPAID')) return true
  if (item.prepaidRequestedAt) return true
  const history = Array.isArray(item.reviewHistory) ? item.reviewHistory : []
  return history.some((entry) => String(entry?.action || '').toUpperCase() === 'PREPAID_SUBMITTED')
}

function serializeCustomer(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const raw = String(obj.approvalStatus || obj.status || 'APPROVED').toUpperCase()
  const approvalStatus = raw === 'ACTIVE' ? 'APPROVED' : raw
  const prepaidApproved = approvalStatus === 'APPROVED' && isPrepaidApproval(obj)
  return {
    ...obj,
    id: obj.id ?? obj._id,
    assignedUserId: asId(obj.assignedUserId),
    paymentMode: prepaidApproved ? 'PREPAID' : obj.paymentMode || '',
    prepaidApproved,
    status: approvalStatus,
    approvalStatus,
  }
}

function customerFromRequest(request) {
  const obj = typeof request.toObject === 'function' ? request.toObject() : { ...request }
  const requesterId = asId(obj.requesterId)
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
    assignedUserId: requesterId,
    assignedUserName: obj.requesterName || '',
    assignedUserEmail: obj.requesterEmail || '',
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
    prepaidRequestedAt: obj.prepaidRequestedAt || null,
    paymentMode: obj.paymentMode || '',
    prepaidApproved: String(obj.status).toUpperCase() === 'APPROVED' && isPrepaidApproval(obj),
  }
}

async function getViewerScope(user) {
  const isSuper = isSuperAdminUser(user)
  const elevated = await isElevatedAdmin(user)
  const accounts = await isAccountsUser(user)
  return {
    isSuper,
    elevated,
    accounts,
    canSeeAllAssigned: isSuper || elevated || accounts,
    departmentId: user?.departmentId || null,
    userId: asId(user?._id),
  }
}

function applyRequestOverlay(existing, request) {
  existing.approvalStatus = request.status
  existing.status = request.status
  existing.reviewNotes = request.reviewNotes || existing.reviewNotes
  existing.prepaidCreditRequired = request.prepaidCreditRequired
  existing.prepaidNotes = request.prepaidNotes
  existing.prepaidDocuments = request.prepaidDocuments
  existing.prepaidRequestedAt = request.prepaidRequestedAt
  existing.approvalRequestId = existing.approvalRequestId || request._id
  existing.paymentMode = request.paymentMode || existing.paymentMode || ''
  const requestObj = typeof request.toObject === 'function' ? request.toObject() : request
  const approved = String(request.status || '').toUpperCase() === 'APPROVED'
  existing.prepaidApproved = approved && isPrepaidApproval({ ...existing, ...requestObj })
  if (existing.prepaidApproved) existing.paymentMode = 'PREPAID'
}

function canAccessAssignedRecord(scope, assignedUserId) {
  if (scope.canSeeAllAssigned) return true
  return asId(assignedUserId) === scope.userId
}

function normalizeAssignment(payload = {}, actor = null) {
  payload.assignedUserId = asId(payload.assignedUserId)
  if (payload.assignedUserId && !payload.assignedUserName && payload.branch) {
    payload.assignedUserName = String(payload.branch)
  }
  if (!payload.createdBy && actor?._id) {
    payload.createdBy = asId(actor._id)
  }
  return payload
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
    const scope = await getViewerScope(req.user)
    const isSuperAdmin = scope.isSuper
    const accounts = scope.accounts
    const departmentId = req.query.departmentId
      || (!isSuperAdmin && req.user.departmentId ? req.user.departmentId : null)

    await syncCustomersFromLoads(isSuperAdmin ? null : departmentId)

    const filter = {}
    const requestFilter = {}
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId
      requestFilter.departmentId = req.query.departmentId
    } else if ((accounts || scope.elevated) && req.user.departmentId) {
      const dept = String(req.user.departmentId)
      filter.$or = [{ departmentId: req.user.departmentId }, { departmentId: dept }]
      requestFilter.departmentId = req.user.departmentId
    } else if (departmentId) {
      requestFilter.departmentId = departmentId
    }

    if (!scope.canSeeAllAssigned) {
      filter.assignedUserId = scope.userId
      requestFilter.requesterId = req.user._id
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

    if (list.paginate && (status === 'PREPAID_APPROVED' || status === 'APPROVED_PREPAID')) {
      const customerQuery = andFilter(
        filter,
        {
          approvalStatus: { $in: ['APPROVED', 'ACTIVE'] },
          $or: [
            { paymentMode: { $regex: /^prepaid$/i } },
            { paymentTerms: { $regex: /prepaid/i } },
          ],
        },
        searchFilter,
      )
      const requestQuery = andFilter(
        requestFilter,
        {
          status: 'APPROVED',
          $or: [
            { paymentMode: { $regex: /^prepaid$/i } },
            { prepaidRequestedAt: { $ne: null } },
            { 'reviewHistory.action': 'PREPAID_SUBMITTED' },
          ],
        },
        requestSearch,
      )
      const [{ items, total }, prepaidRequests] = await Promise.all([
        paginateFind(Customer, customerQuery, {
          ...list,
          sort: mongoSort(req.query.sort || 'name'),
        }),
        CustomerApprovalRequest.find(requestQuery).lean(),
      ])
      const mapped = items.map(serializeCustomer)
      for (const request of prepaidRequests) {
        const existing = mapped.find(
          (item) =>
            String(item.approvalRequestId || '') === String(request._id) ||
            String(item.id) === String(request.customerId || ''),
        )
        if (existing) {
          applyRequestOverlay(existing, request)
          continue
        }
        mapped.push(customerFromRequest(request))
      }
      return res.json(listResponse(mapped, { ...list, total: Math.max(total, mapped.length) }))
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
          applyRequestOverlay(existing, request)
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
        applyRequestOverlay(existing, request)
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
    const scope = await getViewerScope(req.user)
    const { name, email } = req.query
    const filter = { name, email }
    if (!scope.canSeeAllAssigned) {
      filter.assignedUserId = scope.userId
    }
    const customers = await Customer.find(filter)
    res.json(customers)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const scope = await getViewerScope(req.user)
    const customer = await findCustomerByParam(req.params.id)
    if (customer) {
      if (!canAccessAssignedRecord(scope, customer.assignedUserId)) {
        const linkedRequest = customer.approvalRequestId
          ? await CustomerApprovalRequest.findById(customer.approvalRequestId).select('requesterId').lean()
          : null
        const isRequester = asId(linkedRequest?.requesterId) === scope.userId
        if (!isRequester) {
          return res.status(404).json({ error: 'Customer not found' })
        }
      }
      const serialized = serializeCustomer(customer)
      const linked = customer.approvalRequestId
        ? await CustomerApprovalRequest.findById(customer.approvalRequestId)
        : await findApprovalRequestByParam(customer.id)
      if (linked) applyRequestOverlay(serialized, linked)
      return res.json(serialized)
    }
    const request = await findApprovalRequestByParam(req.params.id)
    if (request) {
      if (!canAccessAssignedRecord(scope, request.requesterId)) {
        return res.status(404).json({ error: 'Customer not found' })
      }
      return res.json(customerFromRequest(request))
    }
    return res.status(404).json({ error: 'Customer not found' })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const payload = normalizeAssignment({ ...req.body }, req.user)
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

    const scope = await getViewerScope(req.user)
    if (!canAccessAssignedRecord(scope, existing.assignedUserId)) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    const payload = normalizeAssignment({ ...req.body }, req.user)
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
