import Load from '../models/Load.js'
import LoadTemplate from '../models/LoadTemplate.js'

const DEMO_LOAD_IDS = ['LD-88421', 'LD-87990', 'LD-86044']

export const seedLoadData = async () => {
  const cleared = await Load.deleteMany({
    $or: [
      { id: { $in: DEMO_LOAD_IDS } },
      { createdBy: { $exists: false } },
      { createdBy: null },
      { createdBy: '' },
    ],
  })
  if (cleared.deletedCount) {
    console.log(`Cleared ${cleared.deletedCount} existing View Loads rows`)
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
