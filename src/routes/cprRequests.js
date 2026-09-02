import express from 'express'
import CprRequest from '../models/CprRequest.js'
import Load from '../models/Load.js'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'
import { notifyUser } from '../utils/notify.js'
import { logActivity } from '../utils/activityLog.js'
import { buildCprDetailsFromLoad, mergeCprDetails, serializeCprRequest } from '../utils/cpr.js'
import {
  andFilter,
  listResponse,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'
import {
  canAccessDepartmentItem,
  departmentFilterForViewer,
  isElevatedAdmin,
  isComplianceUser,
} from '../utils/mcCheckAccess.js'

const router = express.Router()
router.use(authenticate)

async function loadForCpr(item) {
  if (!item) return null
  if (item.loadMongoId) {
    const byMongoId = await Load.findById(item.loadMongoId)
    if (byMongoId) return byMongoId
  }
  if (item.loadId) return Load.findOne({ id: item.loadId })
  return null
}

async function serializeCprWithLoad(item) {
  const load = await loadForCpr(item)
  const details = mergeCprDetails(item.details, buildCprDetailsFromLoad(load))
  const payload = serializeCprRequest(item, { details })
  if (load) {
    payload.customer = payload.customer || load.customer || ''
    payload.carrier = payload.carrier || load.carrier || load.carrierDetails?.name || ''
  }
  return payload
}

async function canViewCpr(user, item) {
  if (!user || !item) return false
  if (String(item.requesterId) === String(user._id)) return true
  if (await isComplianceUser(user)) return true
  if (await isElevatedAdmin(user)) return canAccessDepartmentItem(user, item)
  return false
}

router.get('/', async (req, res, next) => {
  try {
    const compliance = await isComplianceUser(req.user)
    const elevated = await isElevatedAdmin(req.user)

    const filter = {}
    if (compliance) {
      // Compliance reviews CPR for the whole org, including unscoped / Shared loads.
    } else if (elevated) {
      Object.assign(filter, departmentFilterForViewer(req.user))
    } else {
      filter.requesterId = req.user._id
    }

    if (req.query.loadId) {
      filter.loadId = String(req.query.loadId).trim()
    }

    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase()
    }

    const list = parseListQuery(req.query)
    const fifo = String(req.query.sort || '').toLowerCase() !== 'newest'
    const queryFilter = andFilter(
      filter,
      textSearch(['loadId', 'carrier', 'customer', 'requesterName', 'status', 'departmentName'], list.search),
    )
    const { items, total } = await paginateFind(CprRequest, queryFilter, {
      ...list,
      sort: { createdAt: fifo ? 1 : -1 },
      statusPriority: ['PENDING'],
      unpaginatedLimit: 300,
    })
    const loadIds = [...new Set(items.map((item) => item.loadId).filter(Boolean))]
    const loads = loadIds.length
      ? await Load.find({ id: { $in: loadIds } }).select('id customer carrier carrierDetails').lean()
      : []
    const loadById = new Map(loads.map((load) => [load.id, load]))
    res.json(
      listResponse(
        items.map((item) => {
          const payload = serializeCprRequest(item)
          const load = loadById.get(item.loadId)
          if (load) {
            payload.customer = payload.customer || load.customer || ''
            payload.carrier = payload.carrier || load.carrier || load.carrierDetails?.name || ''
          }
          return payload
        }),
        { ...list, total },
      ),
    )
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const item = await CprRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'CPR request not found' })
    if (!(await canViewCpr(req.user, item))) {
      return res.status(403).json({ success: false, message: 'You cannot view this CPR request' })
    }
    res.json({ success: true, data: await serializeCprWithLoad(item) })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/review', async (req, res, next) => {
  try {
    if (!(await isComplianceUser(req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Only compliance team can review CPR requests',
      })
    }

    const item = await CprRequest.findById(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'CPR request not found' })
    if (!(await canViewCpr(req.user, item))) {
      return res.status(403).json({ success: false, message: 'Request is outside your department' })
    }

    const action = String(req.body?.action || '').toLowerCase()
    const notes = String(req.body?.reason || req.body?.notes || req.body?.reviewNotes || '').trim()
    if (!['approve', 'accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' })
    }

    const approved = action === 'approve' || action === 'accept'
    if (!approved && notes.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'A reason is required to reject a CPR request (minimum 5 characters).',
      })
    }
    if (String(item.status).toUpperCase() !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Only pending CPR requests can be reviewed' })
    }

    item.status = approved ? 'APPROVED' : 'REJECTED'
    item.reviewedBy = req.user._id
    item.reviewedByName = req.user.name || ''
    item.reviewedByEmail = req.user.email || ''
    item.reviewedAt = new Date()
    item.reviewNotes = notes
    await item.save()

    const load = await Load.findOne({
      $or: [{ id: item.loadId }, { id: String(item.loadId || '').trim() }],
    })
    if (load) {
      load.set({
        cprStatus: item.status,
        cprRequestId: item._id,
        cprReviewedAt: item.reviewedAt,
        cprReviewedByName: item.reviewedByName,
        cprApprovedAt: approved ? item.reviewedAt : load.cprApprovedAt || null,
      })
      load.markModified('cprStatus')
      load.markModified('cprRequestId')
      await load.save()
    }

    try {
      const requester = item.requesterId ? await User.findById(item.requesterId).select('-password') : null
      const payload = {
        title: approved ? 'CPR request approved' : 'CPR request rejected',
        message: approved
          ? `Compliance approved your CPR request for load ${item.loadId}. You can now email documents.`
          : `Compliance rejected your CPR request for load ${item.loadId}${notes ? `: ${notes}` : '.'}`,
        data: {
          type: approved ? 'CPR_APPROVED' : 'CPR_REJECTED',
          requestId: String(item._id),
          loadId: item.loadId,
          status: item.status,
        },
        emailSubject: approved
          ? `[Amtrix] CPR approved — Load ${item.loadId}`
          : `[Amtrix] CPR rejected — Load ${item.loadId}`,
        emailText: [
          approved
            ? `Your CPR request for load ${item.loadId} was approved.`
            : `Your CPR request for load ${item.loadId} was rejected.`,
          '',
          `Reviewed by: ${req.user.name || ''} (${req.user.email || ''})`,
          notes ? `Notes: ${notes}` : '',
          '',
          approved
            ? 'You can now email documents from Load Documents.'
            : 'You can submit a new CPR request after making any needed updates.',
        ]
          .filter(Boolean)
          .join('\n'),
      }
      if (requester) {
        await notifyUser({ user: requester, ...payload })
      }
    } catch (notifyError) {
      console.error('CPR review notification failed:', notifyError?.message || notifyError)
    }

    await logActivity({
      req,
      action: approved ? 'CPR Approved' : 'CPR Rejected',
      description: `${req.user.name || 'Reviewer'} ${approved ? 'approved' : 'rejected'} CPR for load ${item.loadId}`,
      type: approved ? 'success' : 'warning',
      module: 'Loads',
    })

    res.json({ success: true, data: await serializeCprWithLoad(item) })
  } catch (error) {
    next(error)
  }
})

export default router
