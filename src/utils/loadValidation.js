export function isReeferEquipment(type) {
  return String(type || '').toLowerCase().includes('reefer')
}

export function reeferTemperatureError(payload = {}, existing = null) {
  const equipment =
    payload.equipmentType ??
    payload.equipment ??
    existing?.equipmentType ??
    existing?.equipment ??
    ''
  const temperature =
    payload.temperature !== undefined ? payload.temperature : existing?.temperature
  if (isReeferEquipment(equipment) && !String(temperature ?? '').trim()) {
    return 'Temperature is required when equipment type is Reefer.'
  }
  return null
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
      privateNotes: '',
      cargo: '',
      reference: '',
      showOn: 'Both',
    },
  ]
}
