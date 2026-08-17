const MS_PER_DAY = 24 * 60 * 60 * 1000

export function daysPastDue(dueDate, now = new Date()) {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return 0

  const startOfDue = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const startOfNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((startOfNow - startOfDue) / MS_PER_DAY))
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

  return {
    ...invoice,
    id: invoice.id ?? String(invoice._id),
    invoiceTotal,
    paid,
    balance,
    daysPastDue: pastDue,
    ...agingBuckets(balance, pastDue),
  }
}
