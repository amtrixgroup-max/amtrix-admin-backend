import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'

export function customerProfileCompleted(customer) {
  return Boolean(String(customer?.paymentTerms || '').trim())
}

export async function readyToAddRequestIds(baseFilter = {}) {
  const requests = await CustomerApprovalRequest.find({ ...baseFilter, status: 'APPROVED' })
    .select('_id customerId')
    .lean()
  const pending = requests.filter((item) => item.customerId == null || item.customerId === '')
  const ids = pending.map((item) => item._id)
  if (!ids.length) return []

  const idStrings = ids.map((id) => String(id))
  const customers = await Customer.find({
    $or: [{ approvalRequestId: { $in: ids } }, { approvalRequestId: { $in: idStrings } }],
  })
    .select('approvalRequestId')
    .lean()
  const linked = new Set(customers.map((item) => String(item.approvalRequestId)))
  return ids.filter((id) => !linked.has(String(id)))
}
