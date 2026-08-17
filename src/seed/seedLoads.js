import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'

const SAMPLE_LOADS = [
  {
    id: 'LD-88421',
    tab: 'active',
    loadStatus: 'Posted Loads',
    customer: 'Midwest Logistics LLC',
    carrier: 'Blue Ridge Carriers',
    driver: 'James Cole',
    equipment: 'Van',
    powerUnit: 'TRK-102',
    picks: 'Chicago, IL',
    drops: 'Dallas, TX',
    pickDate: '2026-08-08',
    dropDate: '2026-08-10',
    reference: 'PO-55210',
    loadReference: 'PO-55210',
    postedRate: 4850,
    income: 4850,
    expenses: 2100,
    usersRoles: 'AP Dispatcher',
    branch: 'Head Office',
    creationDate: '2026-08-07',
  },
  {
    id: 'LD-87990',
    tab: 'planning',
    loadStatus: 'Planning',
    customer: 'Pacific Coast Foods',
    carrier: 'Gulf Stream Transport',
    driver: '',
    equipment: 'Reefer',
    powerUnit: '',
    picks: 'Oakland, CA',
    drops: 'Phoenix, AZ',
    pickDate: '2026-08-15',
    dropDate: '2026-08-16',
    reference: 'PO-44812',
    loadReference: 'PO-44812',
    postedRate: 3120.5,
    income: 3120.5,
    expenses: 0,
    usersRoles: '',
    branch: 'West Branch',
    creationDate: '2026-08-06',
  },
  {
    id: 'LD-86044',
    tab: 'externally-posted',
    loadStatus: 'Posted Loads',
    customer: 'Summit Beverage Dist.',
    carrier: '',
    driver: '',
    equipment: 'Van',
    powerUnit: '',
    picks: 'Denver, CO',
    drops: 'Salt Lake City, UT',
    pickDate: '2026-08-12',
    dropDate: '2026-08-13',
    reference: 'PO-22190',
    loadReference: 'PO-22190',
    postedRate: 2200,
    income: 0,
    expenses: 0,
    usersRoles: '',
    branch: 'Shared',
    creationDate: '2026-08-05',
  },
]

export const seedLoadData = async () => {
  const count = await Load.countDocuments()
  if (count === 0) {
    await Load.insertMany(SAMPLE_LOADS)
    console.log('Seeded default loads')
  }

  const templateCount = await LoadTemplate.countDocuments()
  if (templateCount === 0) {
    await LoadTemplate.create({
      id: 'TPL-1001',
      templateName: 'Chicago to Dallas Van',
      customer: 'Midwest Logistics LLC',
      picks: 1,
      drops: 1,
      branch: 'Head Office',
    })
    console.log('Seeded default load templates')
  }
}

export default seedLoadData
