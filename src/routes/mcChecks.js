import express from 'express'
import McCheckRequest from '../models/McCheckRequest.js'
import User from '../models/User.js'
import Department from '../models/Department.js'
import { authenticate } from '../middleware/auth.js'
import { notifyUser, notifyUsers } from '../utils/notify.js'
import { logActivity } from '../utils/activityLog.js'
import { upsertCarrierFromMcCheck } from '../utils/upsertCarrier.js'
import { getDotGateDummyPreview } from '../data/dotGateDummy.js'
import {
  canAccessDepartmentItem,
  canAcceptRejectMcCheckStatus,
  canBlockMcCheckStatus,
  canOpenDotGate,
  canReviewMcCheck,
  canRevokeMcCheckStatus,
  canRevokeOrBlockMcCheck,
  canSubmitMcCheck,
  canViewRequest,
  departmentFilterForViewer,
  findPendingReviewRecipients,
  identifierLabel,
  isComplianceUser,
  isElevatedAdmin,
  serializeRequest,
} from '../utils/mcCheckAccess.js'

const router = express.Router()
router.use(authenticate)

const notifyOptions = { skipEmail: true }

async function notifyRequester(item, payload) {
  if (!item?.requesterId) return
  const requester = await User.findById(item.requesterId).select('-password')
  if (requester) {
    await notifyUser({ user: requester, ...payload, ...notifyOptions })
  }
}

async function rejectIfBlockedIdentifier(mcNo, dotNo) {
  const clauses = []
  if (mcNo) clauses.push({ mcNo })
  if (dotNo) clauses.push({ dotNo })
  if (!clauses.length) return null
  return McCheckRequest.findOne({ status: 'BLOCKED', $or: clauses })
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
    const otherEquipment = String(body.equipmentOther || '').trim()
    let equipmentType = String(body.equipmentType || '').trim()
    if (equipmentType.toLowerCase() === 'other') equipmentType = otherEquipment
    const docketType = String(body.docketType || 'MC').trim().toUpperCase() || 'MC'
    const temperature = String(body.temperature || '').trim()
    const lowerTemp = String(body.lowerTemp || '').trim()
    const upperTemp = String(body.upperTemp || '').trim()
    const tempTolerance = String(body.tempTolerance || '').trim()

    if (!mcNo && !dotNo) {
      return res.status(400).json({
        success: false,
        message: 'Please enter MC No or DOT Number. At least one is required.'
      })
    }

    if (String(body.equipmentType || '').trim().toLowerCase() === 'other' && !equipmentType) {
      return res.status(400).json({
        success: false,
        message: 'Enter the equipment type.',
      })
    }

    if (equipmentType.toLowerCase().includes('reefer') && !temperature) {
      return res.status(400).json({
        success: false,
        message: 'Temperature is required for Reefer equipment.',
      })
    }

    const blocked = await rejectIfBlockedIdentifier(mcNo, dotNo)
    if (blocked) {
      return res.status(400).json({
        success: false,
        message: `This MC/DOT is blocked${blocked.blockReason ? `: ${blocked.blockReason}` : '.'}`
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
      temperature,
      lowerTemp,
      upperTemp,
      tempTolerance,
      status: 'PENDING'
    })

    try {
      const recipients = await findPendingReviewRecipients(req.user.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'New Check MC request',
          message: `${req.user.name || 'A teammate'} submitted a Check MC request for ${identifierLabel(request)}.`,
          data: {
            type: 'MC_CHECK_REQUEST',
            requestId: String(request._id),
            status: 'PENDING'
          },
          ...notifyOptions
        })
      }
    } catch (notifyError) {
      console.error('Check MC submit notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Check MC Submitted',
      description: `${req.user.name || 'A user'} submitted a Check MC request for ${identifierLabel(request)}`,
      type: 'create',
      module: 'Carriers'
    })

    res.status(201).json({ success: true, data: serializeRequest(request) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const compliance = await isComplianceUser(req.user)
    const elevated = await isElevatedAdmin(req.user)
    const normalUser = await canSubmitMcCheck(req.user)

    if (!compliance && !elevated && !normalUser) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view Check MC requests'
      })
    }

    const filter = {}
    if (compliance || elevated) {
      Object.assign(filter, departmentFilterForViewer(req.user))
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
    const allowedReviewer = await canReviewMcCheck(req.user)
    if (!allowedReviewer) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team or admins can review Check MC requests'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const action = String(req.body?.action || '').toLowerCase()
    const notes = String(req.body?.reason || req.body?.notes || req.body?.reviewNotes || '').trim()

    if (!['approve', 'reject', 'accept'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be approve or reject'
      })
    }

    const approved = action === 'approve' || action === 'accept'

    if (!approved && !notes) {
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

    if (!(await canAcceptRejectMcCheckStatus(req.user, currentStatus))) {
      return res.status(403).json({
        success: false,
        message: 'Admins can only accept or reject after an exception is requested'
      })
    }

    if (isExceptionReview) {
      item.exceptionReviewedBy = req.user._id
      item.exceptionReviewedByName = req.user.name || ''
      item.exceptionReviewedByEmail = req.user.email || ''
      item.exceptionReviewedAt = new Date()
      item.exceptionReviewNotes = notes
      item.status = approved ? 'EXCEPTION_APPROVED' : 'EXCEPTION_REJECTED'
    } else {
      item.reviewedBy = req.user._id
      item.reviewedByName = req.user.name || ''
      item.reviewedByEmail = req.user.email || ''
      item.reviewedAt = new Date()
      item.reviewNotes = notes
      item.status = approved ? 'APPROVED' : 'REJECTED'
    }

    item.lastPendingNotifiedAt = null
    await item.save()

    try {
      const actionLabel = approved ? 'accepted' : 'rejected'
      const type = isExceptionReview
        ? approved
          ? 'MC_CHECK_EXCEPTION_APPROVED'
          : 'MC_CHECK_EXCEPTION_REJECTED'
        : approved
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
          action: approved ? 'approve' : 'reject'
        }
      })
    } catch (notifyError) {
      console.error('Check MC review notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: isExceptionReview
        ? approved
          ? 'Check MC Exception Approved'
          : 'Check MC Exception Rejected'
        : approved
          ? 'Check MC Approved'
          : 'Check MC Rejected',
      description: `${req.user.name || 'Reviewer'} ${approved ? 'accepted' : 'rejected'} Check MC for ${identifierLabel(item)}`,
      type: approved ? 'success' : 'warning',
      module: 'Carriers'
    })

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
    item.lastPendingNotifiedAt = null
    await item.save()

    try {
      const recipients = await findPendingReviewRecipients(item.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'Check MC exception requested',
          message: `${req.user.name || 'A teammate'} requested an exception for ${identifierLabel(item)}.`,
          data: {
            type: 'MC_CHECK_EXCEPTION',
            requestId: String(item._id),
            status: 'EXCEPTION_PENDING'
          },
          ...notifyOptions
        })
      }
    } catch (notifyError) {
      console.error('Check MC exception notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Check MC Exception Requested',
      description: `${req.user.name || 'A user'} requested an exception for ${identifierLabel(item)}`,
      type: 'warning',
      module: 'Carriers'
    })

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
      const recipients = await findPendingReviewRecipients(item.departmentId)
      if (recipients.length) {
        await notifyUsers(recipients, {
          title: 'Request to Add Carrier',
          message: `${req.user.name || 'A teammate'} requested to add a carrier for ${identifierLabel(item)}.`,
          data: {
            type: 'MC_CHECK_ADD_CARRIER',
            requestId: String(item._id),
            status: 'ADD_CARRIER_REQUESTED'
          },
          ...notifyOptions
        })
      }
    } catch (notifyError) {
      console.error('Add carrier notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Add Carrier Requested',
      description: `${req.user.name || 'A user'} requested to add a carrier for ${identifierLabel(item)}`,
      type: 'info',
      module: 'Carriers'
    })

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/revoke', async (req, res, next) => {
  try {
    if (!(await canRevokeOrBlockMcCheck(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Only department admin, super admin, or compliance head can revoke a Check MC decision'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })
    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const currentStatus = String(item.status || '').toUpperCase()
    if (!(await canRevokeMcCheckStatus(req.user, currentStatus))) {
      return res.status(403).json({
        success: false,
        message: 'Admins can only revoke or unblock an approved MC check'
      })
    }
    const reason = String(req.body?.reason || req.body?.notes || '').trim()
    let nextStatus = 'PENDING'
    if (['EXCEPTION_APPROVED', 'EXCEPTION_REJECTED'].includes(currentStatus)) nextStatus = 'EXCEPTION_PENDING'
    else if (currentStatus === 'CARRIER_ADDED') nextStatus = 'ADD_CARRIER_REQUESTED'
    else if (currentStatus === 'BLOCKED') nextStatus = item.previousStatus || 'PENDING'
    else if (['APPROVED', 'REJECTED'].includes(currentStatus)) nextStatus = 'PENDING'
    else if (currentStatus === 'PENDING' || currentStatus === 'EXCEPTION_PENDING') {
      return res.status(400).json({ success: false, message: 'There is no decision to revoke on this request' })
    }

    item.previousStatus = currentStatus
    item.status = nextStatus
    item.revokedBy = req.user._id
    item.revokedByName = req.user.name || ''
    item.revokedByEmail = req.user.email || ''
    item.revokedAt = new Date()
    item.revokeReason = reason
    item.lastPendingNotifiedAt = null
    if (currentStatus === 'BLOCKED') {
      item.blockedBy = null
      item.blockedByName = ''
      item.blockedByEmail = ''
      item.blockedAt = null
      item.blockReason = ''
    }
    await item.save()

    try {
      await notifyRequester(item, {
        title: currentStatus === 'BLOCKED' ? 'Check MC unblocked' : 'Check MC decision revoked',
        message:
          currentStatus === 'BLOCKED'
            ? `${identifierLabel(item)} is no longer blocked and can be reviewed again.`
            : `A previous decision on ${identifierLabel(item)} was revoked. The request is open for review again.`,
        data: {
          type: 'MC_CHECK_REVOKED',
          requestId: String(item._id),
          status: item.status
        }
      })
    } catch (notifyError) {
      console.error('Check MC revoke notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: currentStatus === 'BLOCKED' ? 'Check MC Unblocked' : 'Check MC Decision Revoked',
      description: `${req.user.name || 'Admin'} revoked ${identifierLabel(item)} from ${currentStatus} to ${nextStatus}`,
      type: 'warning',
      module: 'Carriers'
    })

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/block', async (req, res, next) => {
  try {
    if (!(await canReviewMcCheck(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team or admins can block an MC'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })
    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    if (String(item.status).toUpperCase() === 'BLOCKED') {
      return res.status(400).json({ success: false, message: 'This MC is already blocked' })
    }

    if (!(await canBlockMcCheckStatus(req.user, item.status))) {
      return res.status(403).json({
        success: false,
        message: 'Admins can only block an approved MC check'
      })
    }

    const reason = String(req.body?.reason || req.body?.notes || '').trim()
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason is required to block an MC' })
    }

    item.previousStatus = item.status
    item.status = 'BLOCKED'
    item.blockedBy = req.user._id
    item.blockedByName = req.user.name || ''
    item.blockedByEmail = req.user.email || ''
    item.blockedAt = new Date()
    item.blockReason = reason
    item.lastPendingNotifiedAt = null
    await item.save()

    try {
      await notifyRequester(item, {
        title: 'MC blocked',
        message: `${identifierLabel(item)} was blocked. ${reason}`,
        data: {
          type: 'MC_CHECK_BLOCKED',
          requestId: String(item._id),
          status: 'BLOCKED'
        }
      })
    } catch (notifyError) {
      console.error('Check MC block notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'MC Blocked',
      description: `${req.user.name || 'Admin'} blocked ${identifierLabel(item)}`,
      type: 'warning',
      module: 'Carriers'
    })

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/dot-gate', async (req, res, next) => {
  try {
    const allowedReviewer = await canReviewMcCheck(req.user)
    if (!allowedReviewer || (await isElevatedAdmin(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team can submit DOT Gate Prequalification'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })

    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    if (!canOpenDotGate(item.status)) {
      return res.status(400).json({
        success: false,
        message: 'DOT Gate Prequalification is only available after the request is accepted'
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

    const preview = getDotGateDummyPreview(
      { docketType, docketNumber, usDotNumber, intrastateState, intrastateNumber },
      { name: req.user.name, email: req.user.email }
    )

    item.dotGate = {
      ...(item.dotGate?.toObject ? item.dotGate.toObject() : item.dotGate || {}),
      docketType,
      docketNumber,
      usDotNumber,
      intrastateState,
      intrastateNumber,
      searchedAt: new Date(),
      searchedBy: req.user._id,
      searchedByName: req.user.name || '',
      searchedByEmail: req.user.email || '',
      preview
    }
    await item.save()

    res.json({
      success: true,
      data: {
        ...serializeRequest(item),
        preview
      }
    })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/dot-gate/complete', async (req, res, next) => {
  try {
    const allowedReviewer = await canReviewMcCheck(req.user)
    if (!allowedReviewer || (await isElevatedAdmin(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team can complete DOT Gate Prequalification'
      })
    }

    const item = await McCheckRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'Request not found' })
    if (!(await canAccessDepartmentItem(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }
    if (!canOpenDotGate(item.status)) {
      return res.status(400).json({
        success: false,
        message: 'DOT Gate Prequalification is only available after the request is accepted'
      })
    }
    if (!item.dotGate?.preview) {
      return res.status(400).json({
        success: false,
        message: 'Search the carrier in DOT Gate before completing the invitation'
      })
    }

    const body = req.body || {}
    const invitation = {
      carrierName: String(body.carrierName || item.dotGate.preview?.invitation?.carrierName || '').trim(),
      clientInsuredNumber: String(body.clientInsuredNumber || '').trim(),
      carrierContact: String(body.carrierContact || item.dotGate.preview?.invitation?.carrierContact || '').trim(),
      carrierEmail: String(body.carrierEmail || item.dotGate.preview?.invitation?.carrierEmail || '').trim(),
      requesterName: String(body.requesterName || req.user.name || '').trim(),
      requesterEmail: String(body.requesterEmail || req.user.email || '').trim(),
      createdAt: new Date()
    }

    if (!invitation.carrierName || !invitation.carrierEmail) {
      return res.status(400).json({
        success: false,
        message: 'Carrier name and carrier email are required to create the invitation'
      })
    }

    item.invitation = invitation
    item.status = 'CARRIER_ADDED'
    await item.save()

    try {
      await upsertCarrierFromMcCheck(item, invitation, req.user)
    } catch (carrierError) {
      console.error('Carrier upsert after DOT Gate failed:', carrierError?.message || carrierError)
    }

    try {
      await notifyRequester(item, {
        title: 'Carrier add request completed',
        message: `Compliance completed DOT Gate Prequalification for ${identifierLabel(item)}.`,
        data: {
          type: 'MC_CHECK_CARRIER_ADDED',
          requestId: String(item._id),
          status: 'CARRIER_ADDED'
        }
      })
    } catch (notifyError) {
      console.error('DOT Gate notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: 'Carrier Added',
      description: `${req.user.name || 'Compliance'} completed DOT Gate Prequalification for ${identifierLabel(item)}`,
      type: 'success',
      module: 'Carriers'
    })

    res.json({ success: true, data: serializeRequest(item) })
  } catch (error) {
    next(error)
  }
})

export default router
