import mongoose from 'mongoose'
import Customer from '../models/Customer.js'
import Load from '../models/Load.js'

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function asDepartmentId(value) {
  const raw = String(value || '').trim()
  if (mongoose.isValidObjectId(raw) && raw.length === 24) return raw
  return null
}

function customerPayloadFromLoad(load, fallbackDepartmentId) {
  const details = load?.customerDetails && typeof load.customerDetails === 'object' ? load.customerDetails : {}
  const name = String(load?.customer || details.name || '').trim()
  const departmentId = asDepartmentId(load?.departmentId) || asDepartmentId(fallbackDepartmentId)
  const phone = String(details.primaryPhone || details.contactPhone || details.phone || '').trim()
  const email = String(details.contactEmail || details.email || '').trim()
  const contact = String(details.contactName || details.contact || '').trim()
  const usdot = String(details.usdotNumber || details.dunsNumber || '').trim()
  const mc = String(details.mcNumber || details.docketNumber || '').trim()
  const credit = details.availableCredit ?? details.creditLimit ?? ''
  const address = String(details.address || details.billingAddress || '').trim()

  return {
    name,
    address,
    billingAddress: String(details.billingAddress || details.address || '').trim(),
    city: String(details.city || '').trim(),
    state: String(details.state || '').trim(),
    phone,
    telephone: phone,
    email,
    contact,
    usdotNumber: usdot,
    dunsNumber: usdot,
    mcNumber: mc,
    creditLimit: details.creditLimit != null && details.creditLimit !== '' ? String(details.creditLimit) : '',
    availableCredit: credit === '' || credit == null ? '' : credit,
    publicNotes: String(details.publicNotes || '').trim(),
    privateNotes: String(details.privateNotes || '').trim(),
    approvalStatus: 'APPROVED',
    status: 'APPROVED',
    ...(departmentId ? { departmentId } : {}),
  }
}

async function findExistingCustomer(load, payload) {
  const clauses = []
  const customerId = String(load?.customerId || '').trim()
  if (customerId) {
    clauses.push({ id: customerId })
    if (mongoose.isValidObjectId(customerId) && customerId.length === 24) {
      clauses.push({ _id: customerId })
    }
  }
  if (payload.name) {
    clauses.push({ name: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') })
  }
  if (!clauses.length) return null
  return Customer.findOne({ $or: clauses })
}

export async function upsertCustomerFromLoad(load, fallbackDepartmentId) {
  const payload = customerPayloadFromLoad(load, fallbackDepartmentId)
  if (!payload.name) return null

  const existing = await findExistingCustomer(load, payload)
  if (existing) {
    const updates = { ...payload }
    if (existing.approvalStatus) {
      updates.approvalStatus = existing.approvalStatus
      updates.status = existing.status || existing.approvalStatus
    }
    if (existing.departmentId) {
      delete updates.departmentId
    }
    await Customer.updateOne({ _id: existing._id }, { $set: updates })
    return existing.id || String(existing._id)
  }

  const created = await Customer.create({
    id: `CUS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...payload,
  })
  return created.id
}

export async function syncCustomersFromLoads(departmentId) {
  const dept = asDepartmentId(departmentId)
  const loadFilter = {
    customer: { $exists: true, $nin: [null, ''] },
  }
  if (dept) {
    loadFilter.$or = [
      { departmentId: dept },
      { departmentId: String(dept) },
      { departmentId: { $exists: false } },
      { departmentId: null },
      { departmentId: '' },
    ]
  }

  const loads = await Load.find(loadFilter)
    .select('customer customerId customerDetails departmentId')
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean()

  const seen = new Set()
  for (const load of loads) {
    const key = String(load.customer || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    await upsertCustomerFromLoad(load, dept)
  }
}
