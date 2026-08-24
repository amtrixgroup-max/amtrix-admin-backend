import McCheckRequest from '../models/McCheckRequest.js'
import { notifyUsers } from './notify.js'
import {
  PENDING_REVIEW_STATUSES,
  findPendingReviewRecipients,
  identifierLabel,
} from './mcCheckAccess.js'

function formatWaitingDuration(minutes) {
  const mins = Math.max(0, Math.floor(Number(minutes) || 0))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const CHECK_INTERVAL_MS = 30 * 1000

function pendingSince(item) {
  const status = String(item.status || '').toUpperCase()
  if (status === 'EXCEPTION_PENDING') {
    return item.exceptionRequestedAt || item.updatedAt || item.createdAt
  }
  return item.createdAt
}

export async function sendPendingMcCheckReminders() {
  const now = Date.now()
  const items = await McCheckRequest.find({
    status: { $in: PENDING_REVIEW_STATUSES },
  })

  for (const item of items) {
    const startedAt = pendingSince(item)
    if (!startedAt || now - new Date(startedAt).getTime() < FIVE_MINUTES_MS) continue

    const lastNotified = item.lastPendingNotifiedAt ? new Date(item.lastPendingNotifiedAt).getTime() : 0
    if (lastNotified && now - lastNotified < FIVE_MINUTES_MS) continue

    try {
      const recipients = await findPendingReviewRecipients(item.departmentId)
      if (recipients.length) {
        const minutesPending = Math.max(5, Math.floor((now - new Date(startedAt).getTime()) / 60000))
        await notifyUsers(recipients, {
          title: 'Check MC still pending review',
          message: `${identifierLabel(item)} has been waiting for review for ${formatWaitingDuration(minutesPending)}.`,
          data: {
            type: 'MC_CHECK_PENDING_REMINDER',
            requestId: String(item._id),
            status: item.status,
          },
          skipEmail: true,
        })
      }
      item.lastPendingNotifiedAt = new Date()
      await item.save()
    } catch (error) {
      console.error('Pending Check MC reminder failed:', error?.message || error)
    }
  }
}

export function startPendingMcCheckReminderJob() {
  sendPendingMcCheckReminders().catch((error) => {
    console.error('Pending Check MC reminder startup failed:', error?.message || error)
  })
  const timer = setInterval(() => {
    sendPendingMcCheckReminders().catch((error) => {
      console.error('Pending Check MC reminder failed:', error?.message || error)
    })
  }, CHECK_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
  return timer
}
