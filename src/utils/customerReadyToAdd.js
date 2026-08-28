import Customer from '../models/Customer.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'

export function customerProfileCompleted(customer) {
  return Boolean(String(customer?.paymentTerms || '').trim())
}

export async function readyToAddRequestIds(baseFilter = {}) {
  const requests = await CustomerApprovalRequest.find({ ...baseFilter, status: 'APPROVED' })
    .select('_id')
    .lean()
  const ids = requests.map((item) => item._id)
  if (!ids.length) return []

  const customers = await Customer.find({ approvalRequestId: { $in: ids } })
    .select('approvalRequestId paymentTerms')
    .lean()
  const completed = new Set(
    customers
      .filter((item) => customerProfileCompleted(item))
      .map((item) => String(item.approvalRequestId)),
  )
  return ids.filter((id) => !completed.has(String(id)))
}
