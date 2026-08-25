import Carrier from '../models/Carrier.js'
import Department from '../models/Department.js'

const DUMMY_CARRIER = {
  id: 'CAR-AMTRIX-INFOTECH',
  name: 'Amtrix Infotech',
  address: '1200 Innovation Drive, Suite 400, Dallas, TX 75201',
  city: 'Dallas',
  state: 'TX',
  mcPrefix: 'MC',
  mcNumber: '987654',
  usdotNumber: '3456789',
  phone: '214-555-0148',
  telephone: '214-555-0148',
  extension: '101',
  email: 'dispatch@amtrixinfotech.com',
  contact: 'Rahul Sharma',
  taxId: '88-1234567',
  paymentTerms: 'Net 30',
  vendor1099: true,
  paymentMethod: 'ACH',
  idReferenceValue: 'AMX-CAR-001',
  searchNumber: 'MC987654',
  doNotLoad: false,
  status: 'ACTIVE',
  contacts: [
    {
      name: 'Rahul Sharma',
      role: 'Dispatch',
      email: 'dispatch@amtrixinfotech.com',
      phone: '214-555-0148',
      afterHours: '214-555-0199',
    },
    {
      name: 'Priya Patel',
      role: 'Billing',
      email: 'billing@amtrixinfotech.com',
      phone: '214-555-0162',
      afterHours: '',
    },
  ],
  privateNotes: 'Dummy carrier created for Amtrix Infotech testing.',
  publicNotes: 'Reliable dry van and reefer coverage across TX, OK, and AR.',
  insuranceEntries: [
    {
      type: 'BIPD',
      effectiveDate: '2026-01-01',
      expirationDate: '2027-01-01',
      policyNumber: 'BIPD-AMX-1001',
      limitDescription: 'Liability Limit',
      amount: '1000000',
      underwriter: 'Great West Casualty',
      agent: 'North Texas Insurance',
      addressInfo: 'Dallas, TX',
      notes: 'Primary liability',
    },
    {
      type: 'Cargo',
      effectiveDate: '2026-01-01',
      expirationDate: '2027-01-01',
      policyNumber: 'CARGO-AMX-1002',
      limitDescription: 'Cargo Limit',
      amount: '250000',
      underwriter: 'Great West Casualty',
      agent: 'North Texas Insurance',
      addressInfo: 'Dallas, TX',
      notes: 'All-risk cargo',
    },
  ],
  freightModes: 'Truckload',
  truckTypes: [
    { truckType: 'Dry Van', size: '53', quantity: '12', specs: 'Air ride' },
    { truckType: 'Reefer', size: '53', quantity: '4', specs: 'Multi-temp' },
  ],
  ancillaryEquipment: 'Liftgate, Pallet jack',
  powerUnits: '16',
  trailers: '20',
  equipmentNotes: 'Most units ELD enabled.',
  commoditiesHauled: 'General freight, food-grade, retail',
  commoditiesNotes: 'No hazmat unless certified lane.',
  countryUsa: true,
  countryCanada: false,
  countryMexico: false,
  operatingAreas: 'TX, OK, AR, LA, NM',
  oceanPorts: 'Houston, TX',
  railRamps: 'Dallas, TX',
  lanesNotes: 'Primary lanes DFW to Houston and DFW to Oklahoma City.',
  driverTypeRows: [
    { driverType: 'Company Driver', quantity: '10' },
    { driverType: 'Owner Operator', quantity: '6' },
  ],
  driverInfoRows: [
    {
      name: 'James Cooper',
      type: 'Company Driver',
      phone: '214-555-0188',
      email: 'james.cooper@amtrixinfotech.com',
    },
  ],
  driversNotes: 'All drivers TWIC eligible.',
  selectedCertifications: ['Smartway', 'TWIC (Transportation Worker Identification Credential)'],
  unitPreferences: {
    weight: 'Lbs',
    distance: 'Miles',
    temperature: 'Fahrenheit',
    currency: 'USD',
  },
}

export async function seedCarrierData() {
  const apDept = await Department.findOne({ code: 'AP' }).lean()
  const departmentId = apDept?._id ? String(apDept._id) : ''

  const existing =
    (await Carrier.findOne({ name: 'Amtrix Infotech' })) ||
    (await Carrier.findOne({ id: DUMMY_CARRIER.id })) ||
    (await Carrier.findOne({ mcNumber: DUMMY_CARRIER.mcNumber }))

  const payload = {
    ...DUMMY_CARRIER,
    departmentId,
  }

  if (existing) {
    await Carrier.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...payload,
          id: existing.id || DUMMY_CARRIER.id,
        },
      },
    )
    console.log(`Updated dummy carrier Amtrix Infotech (${existing.id || DUMMY_CARRIER.id})`)
    return
  }

  await Carrier.create(payload)
  console.log(`Seeded dummy carrier Amtrix Infotech (${DUMMY_CARRIER.id})`)
}

export default seedCarrierData
