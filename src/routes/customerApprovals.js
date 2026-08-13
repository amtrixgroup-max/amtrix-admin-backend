import express from 'express'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Department from '../models/Department.js'
import { authenticate } from '../middleware/auth.js'
import { notifyUsers } from '../utils/notify.js'

const router = express.Router()
router.use(authenticate)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const getRoleName = async (user) => {
  if (user.systemRole === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (user.roleId) {
    const role = await Role.findById(user.roleId).select('name').lean()
    if (role?.name) return role.name
  }
  return user.role || null
}

const isAccountsUser = async (user) => (await getRoleName(user)) === 'ACCOUNTS'

const findAccountsUsers = async (departmentId) => {
  if (!departmentId) return []
  const accountsRole = await Role.findOne({ name: 'ACCOUNTS', departmentId }).select('_id')
  if (!accountsRole) return []
  return User.find({
    departmentId,
    roleId: accountsRole._id,
    status: { $in: ['ACTIVE', 'Active'] }
  }).select('-password')
}

const serializeRequest = (doc) => {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  return {
    ...obj,
    id: obj._id
  }
}

router.post('/', async (req, res, next) => {
  try {
    if (!req.user.departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Your account is not assigned to a department'
      })
    }

    const body = req.body || {}
    const required = [
      'agentName',
      'agentEmail',
      'companyName',
      'contactPersonName',
      'dunsNumber',
      'loadApprovedByCustomer',
      'contactPersonNumber',
      'contactPersonEmail',
      'requiredLimit',
      'address'
    ]

    for (const field of required) {
      if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '') {
        return res.status(400).json({ success: false, message: `${field} is required` })
      }
    }

    if (!EMAIL_RE.test(String(body.agentEmail).trim())) {
      return res.status(400).json({ success: false, message: 'Agent email is invalid' })
    }
    if (!EMAIL_RE.test(String(body.contactPersonEmail).trim())) {
      return res.status(400).json({ success: false, message: 'Contact person email is invalid' })
    }

    const loadApproved = String(body.loadApprovedByCustomer).trim()
    if (!['Yes', 'No'].includes(loadApproved)) {
      return res.status(400).json({ success: false, message: 'Load Approved by Customer must be Yes or No' })
    }

    const contactNumber = String(body.contactPersonNumber).replace(/\s/g, '')
    if (!/^\+?\d{7,15}$/.test(contactNumber)) {
      return res.status(400).json({ success: false, message: 'Contact person number must be a valid number' })
    }

    const requiredLimit = Number(body.requiredLimit)
    if (!Number.isFinite(requiredLimit) || requiredLimit < 0) {
      return res.status(400).json({ success: false, message: 'Required limit must be a number' })
    }

    const department = await Department.findById(req.user.departmentId).lean()

    const request = await CustomerApprovalRequest.create({
      requesterId: req.user._id,
      requesterName: req.user.name || '',
      requesterEmail: req.user.email || '',
      departmentId: req.user.departmentId,
      departmentCode: department?.code || req.user.department || '',
      departmentName: department?.displayName || department?.name || '',
      agentName: String(body.agentName).trim(),
      agentEmail: String(body.agentEmail).trim().toLowerCase(),
      companyName: String(body.companyName).trim(),
      contactPersonName: String(body.contactPersonName).trim(),
      dunsNumber: String(body.dunsNumber).trim(),
      loadApprovedByCustomer: loadApproved,
      contactPersonNumber: contactNumber,
      contactPersonEmail: String(body.contactPersonEmail).trim().toLowerCase(),
      requiredLimit,
      address: String(body.address).trim(),
      status: 'PENDING'
    })

    const recipients = await findAccountsUsers(req.user.departmentId)

    if (recipients.length) {
      await notifyUsers(recipients, {
        title: 'New customer approval request',
        message: `${req.user.name || 'A teammate'} submitted a customer approval request for ${request.companyName}.`,
        data: {
          type: 'CUSTOMER_APPROVAL_REQUEST',
          requestId: String(request._id),
          status: 'PENDING'
        },
        emailSubject: `[Amtrix] New customer approval request — ${request.companyName}`,
        emailText: [
          `A new customer approval request was submitted in the ${request.departmentName || request.departmentCode || 'department'} workspace.`,
          '',
          `Requester: ${request.requesterName} (${request.requesterEmail})`,
          `Company: ${request.companyName}`,
          `Contact: ${request.contactPersonName}`,
          `Required limit: ${request.requiredLimit}`,
          `DUNS: ${request.dunsNumber}`,
          '',
          'Please review this request in Amtrix Admin → Customer Approval Requests.'
        ].join('\n')
      })
    }

    res.status(201).json({ success: true, data: serializeRequest(request) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const accounts = await isAccountsUser(req.user)
    if (!accounts) {
      return res.status(403).json({ success: false, message: 'Only Accounts users can view approval requests' })
    }

    const filter = {}
    if (req.user.departmentId) {
      filter.departmentId = req.user.departmentId
    }
    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase()
    }

    const items = await CustomerApprovalRequest.find(filter).sort({ createdAt: -1 }).limit(300)
    res.json({ success: true, data: items.map(serializeRequest) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    const accounts = await isAccountsUser(req.user)
    const sameDept = req.user.departmentId && String(item.departmentId) === String(req.user.departmentId)

    if (!accounts || !sameDept) {
      return res.status(403).json({ success: false, message: 'Only Accounts users can view this request' })
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/review', async (req, res, next) => {
  try {
    const accounts = await isAccountsUser(req.user)
    if (!accounts) {
      return res.status(403).json({
        success: false,
        message: 'Only Accounts users can review requests'
      })
    }

    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!req.user.departmentId || String(item.departmentId) !== String(req.user.departmentId)) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const action = String(req.body?.action || '').toLowerCase()
    const notes = String(req.body?.notes || req.body?.reviewNotes || '').trim()
    const creditRaw = req.body?.creditLimit ?? req.body?.approvedCredit ?? req.body?.credit

    if (!['approve', 'reject', 'prepaid'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be approve, reject, or prepaid'
      })
    }

    item.reviewedBy = req.user._id
    item.reviewedByName = req.user.name || ''
    item.reviewedAt = new Date()
    if (notes) item.reviewNotes = notes

    if (action === 'approve') {
      if (!['PENDING', 'PREPAID'].includes(item.status)) {
        return res.status(400).json({ success: false, message: 'Only pending or prepaid requests can be accepted' })
      }

      const credit = creditRaw === undefined || creditRaw === null || creditRaw === ''
        ? item.requiredLimit
        : Number(creditRaw)

      if (!Number.isFinite(credit) || credit < 0) {
        return res.status(400).json({ success: false, message: 'A valid credit amount is required to approve' })
      }

      item.status = 'APPROVED'
      item.approvedCredit = credit
    } else if (action === 'reject') {
      if (item.status !== 'PENDING') {
        return res.status(400).json({ success: false, message: 'Only pending requests can be rejected' })
      }
      item.status = 'REJECTED'
    } else {
      if (item.status !== 'REJECTED') {
        return res.status(400).json({ success: false, message: 'Prepaid can only be applied to a rejected request' })
      }
      item.status = 'PREPAID'
      item.paymentMode = 'PREPAID'
      item.approvedCredit = 0
    }

    await item.save()

    res.json({
      success: true,
      data: serializeRequest(item),
      redirectTo:
        action === 'approve'
          ? `/customers/add?requestId=${item._id}`
          : null
    })
  } catch (error) {
    next(error)
  }
})

export default router
