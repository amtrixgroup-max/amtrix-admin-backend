export function isReeferEquipment(type) {
  return String(type || '').toLowerCase().includes('reefer')
}

export function isPostedLoad(load = {}) {
  if (load.postedAt) return true
  if (load.isDraft === false && String(load.tab || '') === 'externally-posted') return true
  const status = String(load.loadStatus || '').toLowerCase()
  return status.includes('posted') && load.isDraft !== true
}

export function lineTotal(line = {}) {
  return Number(line.rate || 0) * Number(line.quantity || 0)
}

export function normalizeChargeLine(line = {}, index = 0) {
  const rate = Number(line.rate)
  const quantity = Number(line.quantity)
  return {
    ...line,
    id: String(line.id || `line-${Date.now()}-${index}`),
    company: String(line.company || '').trim(),
    partyId: line.partyId != null ? String(line.partyId) : '',
    description: String(line.description || '').trim(),
    notes: String(line.notes || ''),
    rate: Number.isFinite(rate) ? rate : 0,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    currency: String(line.currency || 'USD').trim() || 'USD',
    includeOnDocs: Boolean(line.includeOnDocs),
  }
}

export function normalizeChargeLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map((line, index) => normalizeChargeLine(line, index))
}

export function recalculateFinancials(payload = {}, existing = {}) {
  const incomeLines = normalizeChargeLines(
    Array.isArray(payload.incomeLines)
      ? payload.incomeLines
      : Array.isArray(existing.incomeLines)
        ? existing.incomeLines
        : [],
  )
  const expenseLines = normalizeChargeLines(
    Array.isArray(payload.expenseLines)
      ? payload.expenseLines
      : Array.isArray(existing.expenseLines)
        ? existing.expenseLines
        : [],
  )
  const income = incomeLines.reduce((sum, line) => sum + lineTotal(line), 0)
  const expenses = expenseLines.reduce((sum, line) => sum + lineTotal(line), 0)
  return {
    incomeLines,
    expenseLines,
    income,
    expenses,
    profit: income - expenses,
    postedRate: Number(
      payload.postedRate != null ? payload.postedRate : existing.postedRate != null ? existing.postedRate : income,
    ) || 0,
  }
}

export function deriveStopSummary(payload = {}, existing = {}) {
  const stops = Array.isArray(payload.stops) ? payload.stops : existing.stops || []
  const pickup = stops.find((stop) => stop.type === 'pickup' && String(stop.location || '').trim()) || {}
  const delivery = stops.find((stop) => stop.type === 'delivery' && String(stop.location || '').trim()) || {}
  return {
    picks: pickup.location || payload.picks || existing.picks || '',
    drops: delivery.location || payload.drops || existing.drops || '',
    pickDate: pickup.scheduled || payload.pickDate || existing.pickDate || null,
    dropDate: delivery.scheduled || payload.dropDate || existing.dropDate || null,
  }
}

export function resolvedEquipmentType(payload = {}, existing = null) {
  const raw = String(
    payload.equipmentType ??
      payload.equipment ??
      existing?.equipmentType ??
      existing?.equipment ??
      '',
  ).trim()
  if (raw.toLowerCase() === 'other') {
    return String(payload.equipmentOther ?? existing?.equipmentOther ?? '').trim()
  }
  return raw
}

export function reeferTemperatureError(payload = {}, existing = null) {
  const equipment = resolvedEquipmentType(payload, existing)
  const temperature =
    payload.temperature !== undefined ? payload.temperature : existing?.temperature
  if (isReeferEquipment(equipment) && !String(temperature ?? '').trim()) {
    return 'Temperature is required when equipment type is Reefer.'
  }
  return null
}

export const MAX_DECLARED_LOAD_VALUE = 100000

export function declaredValueError(payload = {}, existing = null) {
  const raw = payload.declaredValue !== undefined ? payload.declaredValue : existing?.declaredValue
  if (raw === '' || raw == null) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) {
    return 'Declared load value must be a valid amount.'
  }
  if (amount > MAX_DECLARED_LOAD_VALUE) {
    return 'Declared load value cannot exceed 1 lakh (100,000).'
  }
  return null
}

export function palletCountError(payload = {}, existing = null) {
  const loadSize = String(payload.loadSize ?? existing?.loadSize ?? '').toLowerCase()
  if (loadSize !== 'partial') return null
  const raw = payload.palletCount !== undefined
    ? payload.palletCount
    : payload.quantity !== undefined
      ? payload.quantity
      : existing?.palletCount ?? existing?.quantity
  if (raw === '' || raw == null) {
    return 'No of pallets is required for a partial load.'
  }
  if (String(raw).includes('.')) return 'No of pallets must be a whole number.'
  const count = Number(raw)
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
    return 'No of pallets must be a whole number of at least 1.'
  }
  return null
}

export function validateLoadDraft(payload = {}, existing = null) {
  const errors = {}
  const tempError = reeferTemperatureError(payload, existing)
  if (tempError) errors.temperature = tempError
  const valueError = declaredValueError(payload, existing)
  if (valueError) errors.declaredValue = valueError
  const palletsError = palletCountError(payload, existing)
  if (palletsError) errors.quantity = palletsError
  return errors
}

export function validateLoadPost(payload = {}, existing = null) {
  const merged = { ...(existing || {}), ...(payload || {}) }
  const errors = validateLoadDraft(payload, existing)

  if (!String(merged.customer || '').trim()) {
    errors.customer = 'Customer is required before posting.'
  }
  const equipment = resolvedEquipmentType(merged)
  if (!equipment || equipment.toLowerCase() === 'other') {
    errors.equipmentType = 'Equipment type is required before posting.'
  }

  const stops = Array.isArray(merged.stops) ? merged.stops : []
  const pickup = stops.find((stop) => stop.type === 'pickup' && String(stop.location || '').trim())
  const delivery = stops.find((stop) => stop.type === 'delivery' && String(stop.location || '').trim())
  if (!pickup) errors.stops = 'Add at least one pickup with a location before posting.'
  else if (!String(pickup.scheduled || '').trim()) {
    errors.pickupDate = 'Pickup date/time is required before posting.'
  }
  if (!delivery) {
    errors.stops = errors.stops || 'Add at least one delivery with a location before posting.'
  }

  return errors
}

export function firstErrorMessage(errors = {}) {
  const values = Object.values(errors).filter(Boolean)
  return values[0] || 'Validation failed'
}

export function defaultLoadStops() {
  const stamp = Date.now()
  return [
    {
      id: `stop-pickup-${stamp}`,
      type: 'pickup',
      scheduled: '',
      actual: '',
      location: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      contactName: '',
      contactPhone: '',
      appointment: '',
      instructions: '',
      privateNotes: '',
      cargo: '',
      reference: '',
      showOn: 'Both',
    },
    {
      id: `stop-delivery-${stamp}`,
      type: 'delivery',
      scheduled: '',
      actual: '',
      location: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      contactName: '',
      contactPhone: '',
      appointment: '',
      instructions: '',
      privateNotes: '',
      cargo: '',
      reference: '',
      showOn: 'Both',
    },
  ]
}

export function normalizeStop(stop = {}, index = 0) {
  const type = String(stop.type || 'other').toLowerCase()
  const normalizedType = ['pickup', 'delivery', 'other'].includes(type) ? type : 'other'
  const showOnRaw = String(stop.showOn || 'Both')
  const showOn =
    /customer/i.test(showOnRaw) && !/both/i.test(showOnRaw)
      ? 'Customer'
      : /carrier/i.test(showOnRaw) && !/both/i.test(showOnRaw)
        ? 'Carrier'
        : 'Both'
  const unloading = Number(stop.unloadingMinutes)
  return {
    ...stop,
    id: String(stop.id || `stop-${normalizedType}-${Date.now()}-${index}`),
    type: normalizedType,
    locationId: stop.locationId != null ? String(stop.locationId) : '',
    location: String(stop.location || stop.locationName || '').trim(),
    address: String(stop.address || '').trim(),
    city: String(stop.city || '').trim(),
    state: String(stop.state || '').trim(),
    zip: String(stop.zip || '').trim(),
    country: String(stop.country || 'US').trim() || 'US',
    scheduled: stop.scheduled || '',
    scheduledEnd: stop.scheduledEnd || '',
    useScheduleWindow: Boolean(stop.useScheduleWindow),
    actual: stop.actual || '',
    actualArrival: stop.actualArrival || stop.actual || '',
    actualDeparture: stop.actualDeparture || '',
    unloadingMinutes: Number.isFinite(unloading) ? unloading : '',
    contactName: String(stop.contactName || '').trim(),
    contactPhone: String(stop.contactPhone || '').trim(),
    appointment: String(stop.appointment || '').trim(),
    instructions: String(stop.instructions || '').trim(),
    privateNotes: String(stop.privateNotes || '').trim(),
    publicNotes: String(stop.publicNotes || '').trim(),
    cargo: String(stop.cargo || '').trim(),
    reference: String(stop.reference || '').trim(),
    showOn,
    showOnCustomerDocs:
      stop.showOnCustomerDocs != null
        ? Boolean(stop.showOnCustomerDocs)
        : showOn === 'Both' || showOn === 'Customer',
  }
}

export function normalizeStops(stops) {
  if (!Array.isArray(stops)) return []
  return stops.map((stop, index) => normalizeStop(stop, index))
}

export function normalizeCarrierDetails(details = {}) {
  const src = details && typeof details === 'object' ? details : {}
  return {
    ...src,
    name: String(src.name || '').trim(),
    address: String(src.address || '').trim(),
    city: String(src.city || '').trim(),
    state: String(src.state || '').trim(),
    zip: String(src.zip || '').trim(),
    docket: String(src.docket || '').trim(),
    dot: String(src.dot || '').trim(),
    phone: String(src.phone || '').trim(),
    email: String(src.email || '').trim(),
    contactName: String(src.contactName || '').trim(),
    publicNotes: String(src.publicNotes || ''),
    privateNotes: String(src.privateNotes || ''),
    includePublicNotesOnDocs: Boolean(src.includePublicNotesOnDocs),
    drivers: String(src.drivers || '').trim(),
    powerUnit: String(src.powerUnit || '').trim(),
    trailer: String(src.trailer || '').trim(),
    loadLength: src.loadLength === '' || src.loadLength == null ? '' : Number(src.loadLength) || 0,
    loadWidth: src.loadWidth === '' || src.loadWidth == null ? 0 : Number(src.loadWidth) || 0,
    loadHeight: src.loadHeight === '' || src.loadHeight == null ? 0 : Number(src.loadHeight) || 0,
    grossWeight: src.grossWeight === '' || src.grossWeight == null ? 0 : Number(src.grossWeight) || 0,
  }
}
