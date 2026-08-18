import express from 'express'
import McCheckRequest from '../models/McCheckRequest.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Department from '../models/Department.js'
import { authenticate } from '../middleware/auth.js'
import { notifyUser, notifyUsers } from '../utils/notify.js'

const router = express.Router()
router.use(authenticate)

const getRoleMeta = async (user) => {
  if (user.systemRole === 'SUPER_ADMIN') return { name: 'SUPER_ADMIN', displayName: 'Super Admin' }
  if (user.roleId) {
    const role = await Role.findById(user.roleId).select('name displayName').lean()
    if (role?.name) return { name: role.name, displayName: role.displayName || '' }
  }
  return { name: user.role || null, displayName: '' }
}

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const isComplianceRole = (roleName, displayName = '') => {
  const name = normalizeRole(roleName)
  const display = normalizeRole(displayName)
  return (
    name === 'COMPLIANCE' ||
    display === 'COMPLIANCE' ||
    display.includes('COMPLIANCE')
  )
}

const isNormalUserRole = (roleName) => {
  const name = normalizeRole(roleName)
  return name === 'NORMAL_USER' || name === 'USER'
}

const isComplianceUser = async (user) => {
  if (!user || user.systemRole === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') return false
  const meta = await getRoleMeta(user)
  return isComplianceRole(meta.name, meta.displayName)
}

const canSubmitMcCheck = async (user) => {
  if (!user?.departmentId) return false
  if (user.systemRole === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') return false
  const meta = await getRoleMeta(user)
  const roleName = String(meta.name || '')
  if (['SUPER_ADMIN', 'DEPT_ADMIN', 'ACCOUNTS', 'ACCOUNT', 'COMPLIANCE', 'TL'].includes(normalizeRole(roleName))) {
    return false
  }
  return isNormalUserRole(roleName)
}

const findComplianceUsers = async (departmentId) => {
  const activeFilter = { status: { $in: ['ACTIVE', 'Active'] } }
  const query = departmentId ? { ...activeFilter, departmentId } : activeFilter
  const users = await User.find(query)
    .populate('roleId', 'name displayName')
    .select('-password')

  let matches = users.filter((user) =>
    isComplianceRole(user.roleId?.name || user.role, user.roleId?.displayName)
  )

  if (!matches.length) {
    const allUsers = await User.find(activeFilter)
      .populate('roleId', 'name displayName')
      .select('-password')
    matches = allUsers.filter((user) =>
      isComplianceRole(user.roleId?.name || user.role, user.roleId?.displayName)
    )
  }

  return matches
}

const serializeRequest = (doc) => {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const status = String(obj.status || '').toUpperCase()
  return {
    ...obj,
    id: obj._id,
    canRequestAddCarrier: ['APPROVED', 'EXCEPTION_APPROVED'].includes(status),
    canRequestException: status === 'REJECTED',
    canShowDotGate: status === 'ADD_CARRIER_REQUESTED'
  }
}

const sameDepartment = (user, item) =>
  Boolean(user?.departmentId && item?.departmentId && String(user.departmentId) === String(item.departmentId))

const canViewRequest = async (user, item) => {
  if (!user || !item) return false
  if (String(item.requesterId) === String(user._id)) return true
  const compliance = await isComplianceUser(user)
  return compliance && sameDepartment(user, item)
}

const identifierLabel = (item) => {
  const parts = []
  if (item.mcNo) parts.push(`MC ${item.mcNo}`)
  if (item.dotNo) parts.push(`DOT ${item.dotNo}`)
  return parts.join(' / ') || 'carrier check'
}

async function notifyRequester(item, payload) {
  if (!item?.requesterId) return
  const requester = await User.findById(item.requesterId).select('-password')
  if (requester) {
    await notifyUser({ user: requester, ...payload })
  }
}

router.post('/', async (req, res, next) => {
  try {
    const allowed = await canSubmitMcCheck(req.user)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Only normal users can submit a Check MC request'
      })
    }

    if (!req.user.departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Your account is not assigned to a department'
      })
    }

    const body = req.body || {}
    const mcNo = String(body.mcNo || body.mcNumber || '').trim()
    const dotNo = String(body.dotNo || body.dotNumber || body.dotno || '').trim()
    const equipmentType = String(body.equipmentType || '').trim()
    const docketType = String(body.docketType || 'MC').trim().toUpperCase() || 'MC'

    if (!mcNo && !dotNo) {
      return res.status(400).json({
        success: false,
        message: 'Please enter MC No or DOT Number. At least one is required.'
      })
    }

    const department = await Department.findById(req.user.departmentId).lean()

    const request = await McCheckRequest.create({
      requesterId: req.user._id,
      requesterName: req.user.name || '',
      requesterEmail: req.user.email || '',
      departmentId: req.user.departmentId,
      departmentCode: department?.code || req.user.department || '',
      departmentName: department?.displayName || department?.name || '',
      mcNo,
      docketType,
      dotNo,
      equipmentType,
      status: 'PENDING'
    })

    try {
      const recipients = await findComplianceUsers(req.user.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'New Check MC request',
          message: `${req.user.name || 'A teammate'} submitted a Check MC request for ${identifierLabel(request)}.`,
          data: {
            type: 'MC_CHECK_REQUEST',
            requestId: String(request._id),
            status: 'PENDING'
          },
          emailSubject: `[Amtrix] New Check MC request — ${identifierLabel(request)}`,
          emailText: [
            `A new Check MC request was submitted in the ${request.departmentName || request.departmentCode || 'department'} workspace.`,
            '',
            `Requester: ${request.requesterName} (${request.requesterEmail})`,
            request.mcNo ? `MC No: ${request.mcNo}` : '',
            request.dotNo ? `DOT Number: ${request.dotNo}` : '',
            request.equipmentType ? `Equipment Type: ${request.equipmentType}` : '',
            '',
            'Please review this request in Amtrix Admin → MC Check Requests.'
          ]
            .filter(Boolean)
            .join('\n')
        })
      }
    } catch (notifyError) {
      console.error('Check MC submit notification failed:', notifyError?.message || notifyError)
    }

    res.status(201).json({ success: true, data: serializeRequest(request) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const compliance = await isComplianceUser(req.user)
    const normalUser = await canSubmitMcCheck(req.user)

    if (!compliance && !normalUser) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view Check MC requests'
      })
    }

    const filter = {}
    if (compliance) {
      if (req.user.departmentId) filter.departmentId = req.user.departmentId
    } else {
      filter.requesterId = req.user._id
    }

    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase()
    }

    const items = await McCheckRequest.find(filter).sort({ createdAt: -1 }).limit(300)
    res.json({ success: true, data: items.map(serializeRequest) })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    const allowed = await canViewRequest(req.user, item)
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
    const compliance = await isComplianceUser(req.user)
    if (!compliance) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team can review Check MC requests'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!sameDepartment(req.user, item)) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const action = String(req.body?.action || '').toLowerCase()
    const notes = String(req.body?.reason || req.body?.notes || req.body?.reviewNotes || '').trim()

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be approve or reject'
      })
    }

    if (action === 'reject' && !notes) {
      return res.status(400).json({
        success: false,
        message: 'A reason is required when rejecting a request'
      })
    }

    const currentStatus = String(item.status || '').toUpperCase()
    const isExceptionReview = currentStatus === 'EXCEPTION_PENDING'

    if (!['PENDING', 'EXCEPTION_PENDING'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Only pending Check MC or exception requests can be reviewed'
      })
    }

    if (isExceptionReview) {
      item.exceptionReviewedBy = req.user._id
      item.exceptionReviewedByName = req.user.name || ''
      item.exceptionReviewedAt = new Date()
      item.exceptionReviewNotes = notes
      item.status = action === 'approve' ? 'EXCEPTION_APPROVED' : 'EXCEPTION_REJECTED'
    } else {
      item.reviewedBy = req.user._id
      item.reviewedByName = req.user.name || ''
      item.reviewedAt = new Date()
      item.reviewNotes = notes
      item.status = action === 'approve' ? 'APPROVED' : 'REJECTED'
    }

    await item.save()

    try {
      const actionLabel = action === 'approve' ? 'approved' : 'rejected'
      const type = isExceptionReview
        ? action === 'approve'
          ? 'MC_CHECK_EXCEPTION_APPROVED'
          : 'MC_CHECK_EXCEPTION_REJECTED'
        : action === 'approve'
          ? 'MC_CHECK_APPROVED'
          : 'MC_CHECK_REJECTED'

      await notifyRequester(item, {
        title: isExceptionReview
          ? `Check MC exception ${actionLabel}`
          : `Check MC request ${actionLabel}`,
        message: isExceptionReview
          ? `Compliance ${actionLabel} your exception request for ${identifierLabel(item)}.`
          : `Compliance ${actionLabel} your Check MC request for ${identifierLabel(item)}.`,
        data: {
          type,
          requestId: String(item._id),
          status: item.status,
          action
        },
        emailSubject: `[Amtrix] Check MC ${isExceptionReview ? 'exception ' : ''}${actionLabel} — ${identifierLabel(item)}`,
        emailText: [
          `Your Check MC ${isExceptionReview ? 'exception ' : ''}request for ${identifierLabel(item)} was ${actionLabel} by ${req.user.name || 'Compliance'}.`,
          notes ? `Reason: ${notes}` : '',
          action === 'approve'
            ? 'You can now use Request to Add Carrier from your Check MC requests.'
            : isExceptionReview
              ? 'This request is closed. No further exception can be submitted.'
              : 'You can submit a Request Exception with a reason if you want Compliance to review it again.'
        ]
          .filter(Boolean)
          .join('\n')
      })
    } catch (notifyError) {
      console.error('Check MC review notification failed:', notifyError?.message || notifyError)
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/exception', async (req, res, next) => {
  try {
    const allowed = await canSubmitMcCheck(req.user)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Only normal users can request an exception'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (String(item.requesterId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You can only request an exception for your own request' })
    }

    if (String(item.status).toUpperCase() !== 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: 'Exception can only be requested for a rejected Check MC request'
      })
    }

    const reason = String(req.body?.reason || req.body?.exceptionReason || '').trim()
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason for Exception is required' })
    }
    if (reason.length < 5 || reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Reason for Exception must be between 5 and 1000 characters'
      })
    }

    item.status = 'EXCEPTION_PENDING'
    item.exceptionReason = reason
    item.exceptionRequestedAt = new Date()
    item.exceptionRequestedBy = req.user._id
    await item.save()

    try {
      const recipients = await findComplianceUsers(item.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'Check MC exception requested',
          message: `${req.user.name || 'A teammate'} requested an exception for ${identifierLabel(item)}.`,
          data: {
            type: 'MC_CHECK_EXCEPTION',
            requestId: String(item._id),
            status: 'EXCEPTION_PENDING'
          },
          emailSubject: `[Amtrix] Check MC exception — ${identifierLabel(item)}`,
          emailText: [
            `An exception was requested after a Check MC rejection for ${identifierLabel(item)}.`,
            '',
            `Requested by: ${req.user.name || ''} (${req.user.email || ''})`,
            `Reason for Exception: ${reason}`,
            '',
            'Please review this exception in Amtrix Admin → MC Check Requests.'
          ].join('\n')
        })
      }
    } catch (notifyError) {
      console.error('Check MC exception notification failed:', notifyError?.message || notifyError)
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/add-carrier', async (req, res, next) => {
  try {
    const allowed = await canSubmitMcCheck(req.user)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Only normal users can request to add a carrier'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (String(item.requesterId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You can only request to add a carrier for your own request' })
    }

    const status = String(item.status).toUpperCase()
    if (!['APPROVED', 'EXCEPTION_APPROVED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Request to Add Carrier is only available after Compliance approval'
      })
    }

    item.status = 'ADD_CARRIER_REQUESTED'
    item.addCarrierRequestedAt = new Date()
    item.addCarrierRequestedBy = req.user._id
    await item.save()

    try {
      const recipients = await findComplianceUsers(item.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'Request to Add Carrier',
          message: `${req.user.name || 'A teammate'} requested to add a carrier for ${identifierLabel(item)}.`,
          data: {
            type: 'MC_CHECK_ADD_CARRIER',
            requestId: String(item._id),
            status: 'ADD_CARRIER_REQUESTED'
          },
          emailSubject: `[Amtrix] Request to Add Carrier — ${identifierLabel(item)}`,
          emailText: [
            `A Request to Add Carrier was submitted for ${identifierLabel(item)}.`,
            '',
            `Requested by: ${req.user.name || ''} (${req.user.email || ''})`,
            item.mcNo ? `MC No: ${item.mcNo}` : '',
            item.dotNo ? `DOT Number: ${item.dotNo}` : '',
            item.equipmentType ? `Equipment Type: ${item.equipmentType}` : '',
            '',
            'Open this request in Amtrix Admin → MC Check Requests to complete DOT Gate Prequalification.'
          ]
            .filter(Boolean)
            .join('\n')
        })
      }
    } catch (notifyError) {
      console.error('Add carrier notification failed:', notifyError?.message || notifyError)
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/dot-gate', async (req, res, next) => {
  try {
    const compliance = await isComplianceUser(req.user)
    if (!compliance) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team can submit DOT Gate Prequalification'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!sameDepartment(req.user, item)) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    if (String(item.status).toUpperCase() !== 'ADD_CARRIER_REQUESTED') {
      return res.status(400).json({
        success: false,
        message: 'DOT Gate Prequalification is only available after Request to Add Carrier'
      })
    }

    const body = req.body || {}
    const docketType = String(body.docketType || item.docketType || 'MC').trim().toUpperCase()
    const docketNumber = String(body.docketNumber || body.mcNo || item.mcNo || '').trim()
    const usDotNumber = String(body.usDotNumber || body.dotNo || item.dotNo || '').trim()
    const intrastateState = String(body.intrastateState || '').trim().toUpperCase()
    const intrastateNumber = String(body.intrastateNumber || '').trim()

    if (!docketNumber && !usDotNumber && !(intrastateState && intrastateNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter one carrier identifier: US Docket, US DOT Number, or Intrastate Carrier'
      })
    }

    item.dotGate = {
      docketType,
      docketNumber,
      usDotNumber,
      intrastateState,
      intrastateNumber,
      searchedAt: new Date(),
      searchedBy: req.user._id,
      searchedByName: req.user.name || ''
    }
    item.status = 'CARRIER_ADDED'
    await item.save()

    try {
      await notifyRequester(item, {
        title: 'Carrier add request completed',
        message: `Compliance completed DOT Gate Prequalification for ${identifierLabel(item)}.`,
        data: {
          type: 'MC_CHECK_CARRIER_ADDED',
          requestId: String(item._id),
          status: 'CARRIER_ADDED'
        },
        emailSubject: `[Amtrix] Carrier add completed — ${identifierLabel(item)}`,
        emailText: [
          `DOT Gate Prequalification was completed for ${identifierLabel(item)} by ${req.user.name || 'Compliance'}.`,
          docketNumber ? `US Docket: ${docketType} ${docketNumber}` : '',
          usDotNumber ? `US DOT Number: ${usDotNumber}` : '',
          intrastateNumber ? `Intrastate: ${intrastateState} ${intrastateNumber}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      })
    } catch (notifyError) {
      console.error('DOT Gate notification failed:', notifyError?.message || notifyError)
    }

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

export default router
