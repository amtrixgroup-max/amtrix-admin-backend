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

export function recalculateFinancials(payload = {}, existing = {}) {
  const incomeLines = Array.isArray(payload.incomeLines)
    ? payload.incomeLines
    : Array.isArray(existing.incomeLines)
      ? existing.incomeLines
      : []
  const expenseLines = Array.isArray(payload.expenseLines)
    ? payload.expenseLines
    : Array.isArray(existing.expenseLines)
      ? existing.expenseLines
      : []
  const income = incomeLines.reduce((sum, line) => sum + lineTotal(line), 0)
  const expenses = expenseLines.reduce((sum, line) => sum + lineTotal(line), 0)
  return {
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
  const raw = payload.palletCount !== undefined
    ? payload.palletCount
    : payload.quantity !== undefined
      ? payload.quantity
      : existing?.palletCount ?? existing?.quantity
  if (raw === '' || raw == null) return null
  if (String(raw).includes('.')) return 'No of pallets must be a whole number.'
  const count = Number(raw)
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    return 'No of pallets must be a whole number of at least 0.'
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
