import { notifyUsers } from './notify.js'
import { findPendingReviewRecipients } from './mcCheckAccess.js'

export function serializeCprRequest(doc) {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const status = String(obj.status || '').toUpperCase()
  return {
    ...obj,
    id: obj._id,
    canAccept: status === 'PENDING',
    canReject: status === 'PENDING',
  }
}

export function cprSummaryFromLoad(load) {
  const status = String(load?.cprStatus || 'NONE').toUpperCase() || 'NONE'
  return {
    id: load?.cprRequestId || null,
    status,
    requestedAt: load?.cprRequestedAt || null,
    reviewedAt: load?.cprReviewedAt || load?.cprApprovedAt || null,
    reviewedByName: load?.cprReviewedByName || '',
    approved: status === 'APPROVED',
  }
}

export function cprSummaryFromRequest(cpr, load) {
  if (!cpr) return cprSummaryFromLoad(load)
  const status = String(cpr.status || '').toUpperCase() || 'NONE'
  return {
    id: cpr._id || cpr.id || null,
    status,
    requestedAt: cpr.createdAt || load?.cprRequestedAt || null,
    reviewedAt: cpr.reviewedAt || load?.cprReviewedAt || load?.cprApprovedAt || null,
    reviewedByName: cpr.reviewedByName || load?.cprReviewedByName || '',
    approved: status === 'APPROVED',
  }
}

export async function notifyCprReviewers(request, actor) {
  const recipients = await findPendingReviewRecipients(request.departmentId)
  if (!recipients.length) return
  await notifyUsers(recipients, {
    title: 'New CPR approval request',
    message: `${actor?.name || 'A teammate'} requested CPR approval for load ${request.loadId}.`,
    data: {
      type: 'CPR_REQUEST',
      requestId: String(request._id),
      loadId: request.loadId,
      status: 'PENDING',
    },
    emailSubject: `[Amtrix] CPR approval request — Load ${request.loadId}`,
    emailText: [
      `A CPR approval request was submitted in the ${request.departmentName || request.departmentCode || 'department'} workspace.`,
      '',
      `Requester: ${request.requesterName} (${request.requesterEmail})`,
      `Load: ${request.loadId}`,
      request.customer ? `Customer: ${request.customer}` : '',
      request.carrier ? `Carrier: ${request.carrier}` : '',
      request.documentNames?.length ? `Documents: ${request.documentNames.join(', ')}` : '',
      '',
      'Please review this request in Amtrix Admin → Dashboard → CPR Approval Request.',
    ]
      .filter(Boolean)
      .join('\n'),
  })
}
