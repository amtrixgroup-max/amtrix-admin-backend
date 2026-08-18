import express from 'express'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Department from '../models/Department.js'
import { authenticate } from '../middleware/auth.js'
import { notifyUser, notifyUsers, notifyCustomerContact } from '../utils/notify.js'
import { sendMail } from '../utils/mailer.js'
import { logActivity } from '../utils/activityLog.js'
import Customer from '../models/Customer.js'
import { uploadPrepaidPdfs, PREPAID_UPLOAD_DIR } from '../middleware/uploadPrepaid.js'
import path from 'path'
import fs from 'fs'

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

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const isSuperAdminUser = (user) =>
  Boolean(user && (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN'))

const isElevatedAdmin = async (user) => {
  if (!user) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return true
  const name = normalizeRole(await getRoleName(user))
  return name === 'DEPT_ADMIN' || name === 'DEPARTMENT_ADMIN'
}

const isAccountsUser = async (user) => {
  if (!user || isSuperAdminUser(user) || user.systemRole === 'ADMIN') return false
  const name = normalizeRole(await getRoleName(user))
  return name === 'ACCOUNTS' || name === 'ACCOUNT'
}

const canReviewApprovals = async (user) => {
  if (!user) return false
  if (await isElevatedAdmin(user)) return true
  return isAccountsUser(user)
}

const canSubmitApproval = async (user) => {
  if (!user?.departmentId) return false
  if (isSuperAdminUser(user) || user.systemRole === 'ADMIN') return false
  const roleName = normalizeRole(await getRoleName(user))
  if (['SUPER_ADMIN', 'DEPT_ADMIN', 'ACCOUNTS', 'ACCOUNT'].includes(roleName)) return false
  return true
}

const departmentFilterForViewer = (user) => {
  if (isSuperAdminUser(user)) return {}
  if (user?.departmentId) return { departmentId: user.departmentId }
  return {}
}

const canAccessDepartmentItem = async (user, item) => {
  if (!user || !item) return false
  if (isSuperAdminUser(user)) return true
  if (await isElevatedAdmin(user)) {
    if (!user.departmentId) return true
    return sameDepartment(user, item)
  }
  return sameDepartment(user, item)
}

const findAccountsUsers = async (departmentId) => {
  if (!departmentId) return []
  const users = await User.find({
    departmentId,
    status: { $in: ['ACTIVE', 'Active'] }
  })
    .populate('roleId', 'name displayName')
    .select('-password')

  return users.filter((user) => {
    const roleName = String(user.roleId?.name || user.role || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
    const displayName = String(user.roleId?.displayName || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
    return (
      roleName === 'ACCOUNTS' ||
      roleName === 'ACCOUNT' ||
      displayName === 'ACCOUNTS' ||
      displayName === 'ACCOUNT' ||
      displayName.includes('ACCOUNT') ||
      roleName === 'DEPT_ADMIN' ||
      roleName === 'DEPARTMENT_ADMIN' ||
      user.systemRole === 'ADMIN'
    )
  })
}

const serializeRequest = (doc) => {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  return {
    ...obj,
    id: obj._id
  }
}

const sameDepartment = (user, item) =>
  Boolean(user?.departmentId && item?.departmentId && String(user.departmentId) === String(item.departmentId))

const canViewApprovalRequest = async (user, item) => {
  if (!user || !item) return false
  if (String(item.requesterId) === String(user._id)) return true
  if (await isElevatedAdmin(user)) return canAccessDepartmentItem(user, item)
  const accounts = await isAccountsUser(user)
  return accounts && sameDepartment(user, item)
}

async function syncCustomerFromRequest(request, extras = {}) {
  try {
    const payload = {
      name: request.companyName,
      email: request.contactPersonEmail,
      contact: request.contactPersonName,
      phone: request.contactPersonNumber,
      telephone: request.contactPersonNumber,
      address: request.address,
      billingAddress: request.address,
      usdotNumber: request.dunsNumber,
      dunsNumber: request.dunsNumber,
      agentName: request.agentName,
      agentEmail: request.agentEmail,
      loadApprovedByCustomer: request.loadApprovedByCustomer,
      departmentId: request.departmentId || undefined,
      branch: request.departmentName || request.departmentCode || '',
      approvalRequestId: request._id,
      approvalStatus: request.status,
      status: request.status,
      creditLimit:
        request.approvedCredit != null
          ? String(request.approvedCredit)
          : request.requiredLimit != null
            ? String(request.requiredLimit)
            : '',
      availableCredit: request.approvedCredit ?? request.requiredLimit ?? null,
      ...extras
    }

    delete payload._id
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key]
    })

    const existing = await Customer.findOne({
      $or: [
        { approvalRequestId: request._id },
        request.customerId ? { id: request.customerId } : null
      ].filter(Boolean)
    })

    if (existing) {
      await Customer.updateOne({ _id: existing._id }, { $set: payload })
      if (!request.customerId) {
        request.customerId = existing.id || String(existing._id)
        await request.save()
      }
      return existing
    }

    const customer = await Customer.create({
      ...payload,
      id: `CUS-${Date.now()}`
    })
    request.customerId = customer.id || String(customer._id)
    await request.save()
    return customer
  } catch (error) {
    console.error('syncCustomerFromRequest failed:', error?.message || error)
    return null
  }
}

async function notifyReviewOutcome({ item, action, actor }) {
  const actionLabel =
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'marked as prepaid'
  const typeMap = {
    approve: 'CUSTOMER_APPROVAL_APPROVED',
    reject: 'CUSTOMER_APPROVAL_REJECTED',
    prepaid: 'CUSTOMER_APPROVAL_PREPAID'
  }
  const reviewMessage = [
    `Customer request for ${item.companyName} was ${actionLabel} by ${actor?.name || 'Accounts'}.`,
    item.approvedCredit != null && action === 'approve' ? `Approved credit: ${item.approvedCredit}` : '',
    item.reviewNotes ? `Notes: ${item.reviewNotes}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const payload = {
    title: `Customer request ${actionLabel}`,
    message: `Accounts ${actionLabel} the customer request for ${item.companyName}.`,
    data: {
      type: typeMap[action] || 'CUSTOMER_APPROVAL_REVIEW',
      requestId: String(item._id),
      status: item.status,
      action
    },
    emailSubject: `[Amtrix] Customer request ${actionLabel} — ${item.companyName}`,
    emailText: reviewMessage
  }

  const actorId = actor?._id ? String(actor._id) : ''
  const actorEmail = String(actor?.email || '').trim().toLowerCase()

  if (item.requesterId && String(item.requesterId) !== actorId) {
    const requester = await User.findById(item.requesterId).select('-password')
    if (requester) {
      await notifyUser({ user: requester, ...payload })
    } else if (item.requesterEmail) {
      await sendMail({
        to: item.requesterEmail,
        subject: payload.emailSubject,
        text: reviewMessage
      }).catch((error) => {
        console.error('Failed to email requester:', error?.message || error)
      })
    }
  }

  const requesterEmail = String(item.requesterEmail || '').trim().toLowerCase()
  const contactEmail = String(item.contactPersonEmail || '').trim().toLowerCase()
  if (contactEmail && contactEmail !== requesterEmail && contactEmail !== actorEmail) {
    const customerUser = await User.findOne({ email: contactEmail }).select('-password')
    if (!customerUser || String(customerUser._id) !== actorId) {
      await notifyCustomerContact({
        email: item.contactPersonEmail,
        user: customerUser && String(customerUser._id) !== String(item.requesterId) ? customerUser : null,
        ...payload
      })
    }
  }
}

router.post('/', async (req, res, next) => {
  try {
    const allowed = await canSubmitApproval(req.user)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin, Admin, and Accounts users cannot submit customer approval requests'
      })
    }

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

    await syncCustomerFromRequest(request)

    try {
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
    } catch (notifyError) {
      console.error('Submit notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Customer Approval Submitted',
      description: `${req.user.name || 'A user'} submitted a customer approval request for ${request.companyName}`,
      type: 'create',
      module: 'Customers'
    })

    res.status(201).json({ success: true, data: serializeRequest(request) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const accounts = await isAccountsUser(req.user)
    const elevated = await isElevatedAdmin(req.user)
    if (!accounts && !elevated) {
      return res.status(403).json({ success: false, message: 'Only Accounts users or admins can view approval requests' })
    }

    const filter = departmentFilterForViewer(req.user)
    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase()
    }

    const items = await CustomerApprovalRequest.find(filter).sort({ createdAt: -1 }).limit(300)
    res.json({ success: true, data: items.map(serializeRequest) })
  } catch (error) {
    next(error)
  }
})

router.post(
  '/:id/prepaid-request',
  (req, res, next) => {
    uploadPrepaidPdfs.array('pdfs', 5)(req, res, (error) => {
      if (error) {
        error.status = 400
        return next(error)
      }
      next()
    })
  },
  async (req, res, next) => {
  try {
    const accounts = await isAccountsUser(req.user)
    if (accounts) {
      return res.status(403).json({
        success: false,
        message: 'Accounts users cannot submit prepaid requests'
      })
    }

    const allowed = await canSubmitApproval(req.user)
    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    const isRequester = String(item.requesterId) === String(req.user._id)
    if (!sameDepartment(req.user, item) || (!isRequester && !allowed)) {
      return res.status(403).json({ success: false, message: 'You cannot request prepaid for this customer' })
    }

    if (String(item.status).toUpperCase() !== 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Prepaid can only be requested for a rejected customer' })
    }

    const notes = String(req.body?.notes || '').trim()
    if (!notes) {
      return res.status(400).json({ success: false, message: 'Notes are required' })
    }
    if (notes.length < 5 || notes.length > 1000) {
      return res.status(400).json({ success: false, message: 'Notes must be between 5 and 1000 characters' })
    }

    const credit = Number(req.body?.creditRequired ?? req.body?.creditLimit ?? req.body?.requiredLimit)
    if (!Number.isFinite(credit) || credit < 0 || credit > 100000000) {
      return res.status(400).json({ success: false, message: 'Credit required must be a valid number' })
    }

    const files = Array.isArray(req.files) ? req.files : []
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'Please upload at least one PDF' })
    }
    if (files.length > 5) {
      return res.status(400).json({ success: false, message: 'You can upload a maximum of 5 PDFs' })
    }

    item.status = 'PREPAID'
    item.paymentMode = 'PREPAID'
    item.prepaidCreditRequired = credit
    item.requiredLimit = credit
    item.prepaidNotes = notes
    item.prepaidRequestedAt = new Date()
    item.prepaidRequestedBy = req.user._id
    item.prepaidRequestedByName = req.user.name || ''
    item.prepaidRequestedByEmail = req.user.email || ''
    item.prepaidDocuments = files.map((file) => ({
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    }))

    await item.save()
    await syncCustomerFromRequest(item, {
      paymentTerms: 'Prepaid',
      availableCredit: credit,
      creditLimit: String(credit)
    })

    try {
      const recipients = await findAccountsUsers(item.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'Prepaid request submitted',
          message: `${req.user.name || 'A teammate'} requested prepaid review for ${item.companyName}.`,
          data: {
            type: 'CUSTOMER_APPROVAL_PREPAID',
            requestId: String(item._id),
            status: 'PREPAID',
            action: 'prepaid-request'
          },
          emailSubject: `[Amtrix] Prepaid request — ${item.companyName}`,
          emailText: [
            `A prepaid request was submitted after rejection for ${item.companyName}.`,
            '',
            `Requested by: ${req.user.name || ''} (${req.user.email || ''})`,
            `Credit required: ${credit}`,
            item.prepaidNotes ? `Notes: ${item.prepaidNotes}` : '',
            `PDFs uploaded: ${files.map((file) => file.originalname).join(', ')}`,
            '',
            'Please review this prepaid request in Amtrix Admin → Customer Approval Requests.'
          ].filter(Boolean).join('\n')
        })
      }
    } catch (notifyError) {
      console.error('Prepaid request notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Prepaid Requested',
      description: `${req.user.name || 'A user'} requested prepaid review for ${item.companyName}`,
      type: 'info',
      module: 'Customers'
    })

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/documents/:storedName', async (req, res, next) => {
  try {
    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    const allowed = await canViewApprovalRequest(req.user, item)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this document' })
    }

    const storedName = path.basename(String(req.params.storedName || ''))
    const doc = (item.prepaidDocuments || []).find((file) => file.storedName === storedName)
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' })

    const filePath = path.join(PREPAID_UPLOAD_DIR, storedName)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File is missing on the server' })
    }

    res.download(filePath, doc.originalName || storedName)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    const allowed = await canViewApprovalRequest(req.user, item)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You cannot view this request' })
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/review', async (req, res, next) => {
  try {
    const allowedReviewer = await canReviewApprovals(req.user)
    if (!allowedReviewer) {
      return res.status(403).json({
        success: false,
        message: 'Only Accounts users or admins can review requests'
      })
    }

    const item = await CustomerApprovalRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const action = String(req.body?.action || '').toLowerCase()
    const notes = String(req.body?.notes || req.body?.reviewNotes || '').trim()
    const creditRaw = req.body?.creditLimit ?? req.body?.approvedCredit ?? req.body?.credit

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be approve or reject'
      })
    }

    item.reviewedBy = req.user._id
    item.reviewedByName = req.user.name || ''
    item.reviewedByEmail = req.user.email || ''
    item.reviewedAt = new Date()
    if (notes) item.reviewNotes = notes

    if (action === 'approve') {
      if (!['PENDING', 'PREPAID'].includes(item.status)) {
        return res.status(400).json({ success: false, message: 'Only pending or prepaid requests can be accepted' })
      }

      const credit = creditRaw === undefined || creditRaw === null || creditRaw === ''
        ? item.prepaidCreditRequired ?? item.requiredLimit
        : Number(creditRaw)

      if (!Number.isFinite(credit) || credit < 0) {
        return res.status(400).json({ success: false, message: 'A valid credit amount is required to approve' })
      }

      item.status = 'APPROVED'
      item.approvedCredit = credit
    } else {
      if (!['PENDING', 'PREPAID'].includes(item.status)) {
        return res.status(400).json({ success: false, message: 'Only pending or prepaid requests can be rejected' })
      }
      item.status = 'REJECTED'
    }

    await item.save()
    await syncCustomerFromRequest(item)

    try {
      await notifyReviewOutcome({
        item,
        action,
        actor: req.user
      })
    } catch (notifyError) {
      console.error('Review notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: action === 'approve' ? 'Customer Approved' : 'Customer Rejected',
      description: `${req.user.name || 'Accounts'} ${action === 'approve' ? 'approved' : 'rejected'} ${item.companyName}`,
      type: action === 'approve' ? 'success' : 'warning',
      module: 'Customers'
    })

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
