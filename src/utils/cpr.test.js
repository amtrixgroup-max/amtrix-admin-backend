import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCprDetailsFromLoad, mergeCprDetails, normalizeCprDocumentNames } from './cpr.js'

test('buildCprDetailsFromLoad maps CPR format fields from the load', () => {
  const details = buildCprDetailsFromLoad({
    id: 'LD-24937',
    pickDate: '2026-09-02',
    dropDate: '2026-09-03',
    picks: 'Laredo, TX',
    drops: 'Dallas, TX',
    commodity: 'Fresh Beef',
    equipmentType: 'Reefer',
    equipmentLength: '53',
    temperature: '24',
    expenses: 1675,
    driver: 'Manuel',
    driverPhone: '737 373 5609',
    powerUnit: '333',
    vin: '1FUJHHDR6MLMF7022',
    publicNote: 'Call before arrival',
    carrierDetails: {
      docket: 'MC-857351',
      contactName: 'Nadine Iovu',
      email: 'texolltruckingllc@gmail.com',
      phone: '210 964 5444',
      trailer: '1402',
    },
    stops: [
      { type: 'pickup', city: 'Laredo', state: 'TX', scheduled: '2026-09-02' },
      { type: 'delivery', city: 'Dallas', state: 'TX', scheduled: '2026-09-03' },
    ],
  })

  assert.equal(details.loadNo, 'LD-24937')
  assert.equal(details.pickupLocation, 'Laredo, TX')
  assert.equal(details.deliveryLocation, 'Dallas, TX')
  assert.equal(details.carrierMc, 'MC-857351')
  assert.equal(details.dispatcherName, 'Nadine Iovu')
  assert.match(details.dispatcherContact, /texolltruckingllc@gmail.com/)
  assert.match(details.dispatcherContact, /210 964 5444/)
  assert.equal(details.commodity, 'Fresh Beef')
  assert.match(details.equipment, /53/)
  assert.match(details.equipment, /Reefer/i)
  assert.equal(details.temperature, '24 F')
  assert.equal(details.carrierRate, '$1,675')
  assert.equal(details.driverName, 'Manuel')
  assert.equal(details.driverNumber, '737 373 5609')
  assert.equal(details.truckNo, '333')
  assert.equal(details.trailerNo, '1402')
  assert.equal(details.vin, '1FUJHHDR6MLMF7022')
  assert.equal(details.specialInstructions, 'Call before arrival')
})

test('mergeCprDetails prefers saved snapshot and fills blanks from the load', () => {
  const merged = mergeCprDetails(
    { loadNo: 'LD-1', driverName: 'Manuel' },
    { loadNo: 'LD-2', driverName: '', trailerNo: '1402' },
  )
  assert.equal(merged.loadNo, 'LD-1')
  assert.equal(merged.driverName, 'Manuel')
  assert.equal(merged.trailerNo, '1402')
})

test('normalizeCprDocumentNames treats client rate confirmation as rate confirmation', () => {
  assert.deepEqual(
    normalizeCprDocumentNames(['Client Rate Confirmation', 'Rate Confirmation', 'POD']),
    ['Rate Confirmation', 'POD'],
  )
})
