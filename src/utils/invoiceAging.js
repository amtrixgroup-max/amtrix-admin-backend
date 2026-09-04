const MS_PER_DAY = 24 * 60 * 60 * 1000
export const PAYMENT_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000

function startOfUtcDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function parsePaymentTermDays(terms, fallback = 30) {
  const text = String(terms || '').trim()
  if (!text) return fallback
  if (/due on receipt|upon receipt|cod|prepaid|due now/i.test(text)) return 0
  const match = text.match(/(\d+)/)
  if (!match) return fallback
  const days = Number(match[1])
  return Number.isFinite(days) ? days : fallback
}

export function daysPastDue(dueDate, now = new Date()) {
  const startOfDue = startOfUtcDay(dueDate)
  const startOfNow = startOfUtcDay(now)
  if (startOfDue == null || startOfNow == null) return 0
  return Math.max(0, Math.floor((startOfNow - startOfDue) / MS_PER_DAY))
}

export function daysUntilDue(dueDate, now = new Date()) {
  const startOfDue = startOfUtcDay(dueDate)
  const startOfNow = startOfUtcDay(now)
  if (startOfDue == null || startOfNow == null) return null
  return Math.floor((startOfDue - startOfNow) / MS_PER_DAY)
}

export function dashboardAgingRange(pastDueDays) {
  const days = Math.max(0, Number(pastDueDays) || 0)
  if (days <= 30) return 'd0to30'
  if (days <= 60) return 'd31to60'
  if (days <= 90) return 'd61to90'
  return 'd90plus'
}

export function invoiceBalance(invoice) {
  const invoiceTotal = Number(invoice?.invoiceTotal) || 0
  const paid = Number(invoice?.paid) || 0
  if (invoice?.balance != null && invoice.balance !== '') return Number(invoice.balance) || 0
  return invoiceTotal - paid
}

export function isOpenInvoice(invoice) {
  if (invoiceBalance(invoice) <= 0) return false
  return String(invoice?.sentStatus || '') !== 'Factored'
}

export function shouldSendPaymentReminder(invoice, now = new Date()) {
  if (!isOpenInvoice(invoice)) return false
  if (daysPastDue(invoice?.dueDate, now) < 1) return false
  const last = invoice?.lastPaymentReminderAt ? new Date(invoice.lastPaymentReminderAt).getTime() : 0
  if (last && now.getTime() - last < PAYMENT_REMINDER_INTERVAL_MS) return false
  return true
}

export function agingBuckets(balance, pastDueDays) {
  const amount = Math.max(0, Number(balance) || 0)
  const buckets = {
    current: 0,
    pastDue0to29: 0,
    pastDue30: 0,
    pastDue60: 0,
    pastDue90: 0,
  }

  if (amount <= 0) return buckets
  if (pastDueDays <= 0) buckets.current = amount
  else if (pastDueDays < 30) buckets.pastDue0to29 = amount
  else if (pastDueDays < 60) buckets.pastDue30 = amount
  else if (pastDueDays < 90) buckets.pastDue60 = amount
  else buckets.pastDue90 = amount

  return buckets
}

export function serializeInvoice(doc) {
  const invoice = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const invoiceTotal = Number(invoice.invoiceTotal) || 0
  const paid = Number(invoice.paid) || 0
  const balance =
    invoice.balance != null && invoice.balance !== ''
      ? Number(invoice.balance)
      : invoiceTotal - paid
  const pastDue = daysPastDue(invoice.dueDate)
  const untilDue = daysUntilDue(invoice.dueDate)

  return {
    ...invoice,
    id: invoice.id ?? String(invoice._id),
    invoiceTotal,
    paid,
    balance,
    daysPastDue: pastDue,
    daysUntilDue: untilDue,
    agingRange: dashboardAgingRange(pastDue),
    paymentReminderCount: Number(invoice.paymentReminderCount) || 0,
    lastPaymentReminderAt: invoice.lastPaymentReminderAt || null,
    ...agingBuckets(balance, pastDue),
  }
}
