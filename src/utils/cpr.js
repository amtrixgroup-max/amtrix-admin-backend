import { notifyUsers } from './notify.js'
import { findPendingReviewRecipients } from './mcCheckAccess.js'
import { lineTotal } from './loadValidation.js'

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

function firstText(...values) {
  for (const value of values) {
    const next = text(value)
    if (next) return next
  }
  return ''
}

function formatCprDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return date.toLocaleDateString('en-US')
}

function formatCprMoney(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return ''
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function stopOfType(load, type) {
  const stops = Array.isArray(load?.stops) ? load.stops : []
  return (
    stops.find((stop) => String(stop?.type || '').toLowerCase() === type && firstText(stop.location, stop.city, stop.company)) ||
    stops.find((stop) => String(stop?.type || '').toLowerCase() === type) ||
    null
  )
}

function stopPlace(stop, fallback = '') {
  if (!stop) return text(fallback)
  const cityState = [stop.city, stop.state].filter(Boolean).join(', ')
  return firstText(cityState, stop.location, stop.company, fallback)
}

function formatEquipment(load) {
  const length = text(load?.equipmentLength)
  const type = firstText(load?.equipmentType, load?.equipment)
  const lengthLabel = length && !/(ft|')/i.test(length) ? `${length} ft` : length
  return [lengthLabel, type].filter(Boolean).join(' ')
}

function formatTemperature(load) {
  const value = firstText(load?.temperature)
  if (!value) return ''
  if (/[fc]\b/i.test(value) || /°/.test(value)) return value
  if (/^\d+(\.\d+)?$/.test(value)) return `${value} F`
  return value
}

function formatHazmat(load) {
  const raw = load?.hazmat ?? load?.hazardous ?? load?.isHazmat
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  const value = text(raw)
  if (!value) return ''
  if (['y', 'yes', 'true', '1'].includes(value.toLowerCase())) return 'Yes'
  if (['n', 'no', 'false', '0'].includes(value.toLowerCase())) return 'No'
  return value
}

function carrierRateFromLoad(load) {
  const lines = Array.isArray(load?.expenseLines) ? load.expenseLines : []
  const fromLines = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  if (fromLines) return fromLines
  const expenses = Number(load?.expenses)
  if (Number.isFinite(expenses) && expenses) return expenses
  return 0
}

function dispatcherContact(details = {}, load = {}) {
  const email = firstText(details.email, details.dispatchEmail, load.carrierEmail)
  const phone = firstText(details.phone, details.telephone, details.dispatcherPhone)
  const ext = firstText(details.ext, details.extension)
  return [email, [phone, ext ? `EXT ${ext}` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' & ')
}

export function normalizeCprDocumentNames(names = []) {
  const seen = new Set()
  const out = []
  names.forEach((name) => {
    let label = text(name)
    if (!label) return
    const lower = label.toLowerCase()
    if (lower.includes('client rate confirmation')) label = 'Rate Confirmation'
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(label)
  })
  return out
}

export function buildCprDetailsFromLoad(load) {
  if (!load) return {}
  const details = load.carrierDetails || {}
  const pickup = stopOfType(load, 'pickup')
  const delivery = stopOfType(load, 'delivery')
  return {
    loadNo: firstText(load.id, load.loadId),
    pickupDate: formatCprDate(pickup?.scheduled || load.pickDate),
    pickupLocation: stopPlace(pickup, load.picks),
    deliveryDate: formatCprDate(delivery?.scheduled || load.dropDate),
    deliveryLocation: stopPlace(delivery, load.drops),
    hazmat: formatHazmat(load),
    carrierMc: firstText(details.docket, details.mc, details.mcNumber, load.carrierMc),
    dispatcherName: firstText(details.contactName, details.contact, details.dispatcher, details.primaryContact),
    dispatcherContact: dispatcherContact(details, load),
    commodity: firstText(load.commodity, load.commodityDescription),
    equipment: formatEquipment(load),
    temperature: formatTemperature(load),
    carrierRate: formatCprMoney(carrierRateFromLoad(load)),
    driverName: firstText(load.driver, details.drivers, details.driverName),
    driverNumber: firstText(load.driverPhone, details.driverPhone, details.driverCell),
    truckNo: firstText(load.powerUnit, details.powerUnit, details.truck, load.truck),
    trailerNo: firstText(details.trailer, load.trailer, details.trailerNumber),
    vin: firstText(load.vin, load.vinNumber, details.vin, details.vinNumber),
    specialInstructions: firstText(load.publicNote, load.postingNotes, load.specialInstructions, load.notes),
    customer: firstText(load.customer),
    carrier: firstText(load.carrier, details.name),
  }
}

export function mergeCprDetails(saved, fromLoad) {
  const current = saved && typeof saved === 'object' ? saved : {}
  const live = fromLoad && typeof fromLoad === 'object' ? fromLoad : {}
  const keys = [...new Set([...Object.keys(live), ...Object.keys(current)])]
  const merged = {}
  keys.forEach((key) => {
    merged[key] = firstText(current[key], live[key])
  })
  return merged
}

export function serializeCprRequest(doc, extras = {}) {
  if (!doc) return null
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const status = String(obj.status || '').toUpperCase()
  return {
    ...obj,
    id: String(obj._id || obj.id || ''),
    documentNames: normalizeCprDocumentNames(obj.documentNames || []),
    details: extras.details || obj.details || {},
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
      'Please review this request in Amtrix Admin → Carriers → CPR Approval Request.',
    ]
      .filter(Boolean)
      .join('\n'),
  })
}
