import Carrier from '../models/Carrier.js'

function serialize(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return { ...obj, id: obj.id || String(obj._id) }
}

export async function upsertCarrierFromMcCheck(item, invitation = {}, user = null) {
  const name = String(
    invitation.carrierName ||
      item?.dotGate?.preview?.invitation?.carrierName ||
      item?.dotGate?.preview?.legalName ||
      '',
  ).trim()
  if (!name) return null

  const mcNumber = String(item?.mcNo || '').trim()
  const usdotNumber = String(item?.dotNo || '').trim()

  let existing = null
  if (item?._id) existing = await Carrier.findOne({ mcCheckRequestId: String(item._id) })
  if (!existing && mcNumber) existing = await Carrier.findOne({ mcNumber })
  if (!existing && usdotNumber) existing = await Carrier.findOne({ usdotNumber })

  const payload = {
    name,
    email: String(invitation.carrierEmail || '').trim(),
    contact: String(invitation.carrierContact || '').trim(),
    mcNumber,
    mcPrefix: item?.docketType || 'MC',
    usdotNumber,
    departmentId: item?.departmentId ? String(item.departmentId) : '',
    mcCheckRequestId: item?._id ? String(item._id) : '',
    status: 'ACTIVE',
    source: 'dot-gate',
  }

  if (existing) {
    Object.assign(existing, payload)
    await existing.save()
    return serialize(existing)
  }

  const created = await Carrier.create({
    ...payload,
    id: `CAR-${Date.now()}`,
    createdBy: user?._id ? String(user._id) : '',
  })
  return serialize(created)
}
