import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import User from '../models/User.js'
import Role from '../models/Role.js'
import Customer from '../models/Customer.js'
import ActivityLog from '../models/ActivityLog.js'
import Dashboard from '../models/Dashboard.js'
import Setting from '../models/Setting.js'
import Onboarding from '../models/Onboarding.js'
import Career from '../models/Career.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const readJson = async (relativePath) => {
  const fileData = await fs.readFile(path.join(__dirname, relativePath), 'utf-8')
  return JSON.parse(fileData)
}

export const seedDefaultData = async () => {
  const userCount = await User.countDocuments()
  if (userCount === 0) {
    const usersData = await readJson('../data/users.json')
    await User.insertMany(usersData)
    console.log('Seeded default users')
  }

  const roleCount = await Role.countDocuments()
  if (roleCount === 0) {
    const rolesData = await readJson('../data/roles.json')
    await Role.insertMany(rolesData)
    console.log('Seeded default roles')
  }

  const customerCount = await Customer.countDocuments()
  if (customerCount === 0) {
    const customersData = await readJson('../data/customers.json')
    await Customer.insertMany(customersData)
    console.log('Seeded default customers')
  }

  const careerCount = await Career.countDocuments()
  if (careerCount === 0) {
    const careersData = await readJson('../data/careers.json')
    await Career.insertMany(careersData)
    console.log('Seeded default careers')
  }

  const onboardingCount = await Onboarding.countDocuments()
  if (onboardingCount === 0) {
    const onboardingData = await readJson('../data/onboarding.json')
    await Onboarding.create(onboardingData)
    console.log('Seeded default onboarding')
  }

  const dashboardCount = await Dashboard.countDocuments()
  if (dashboardCount === 0) {
    const dashboardData = await readJson('../data/dashboard.json')
    await Dashboard.create(dashboardData)
    console.log('Seeded default dashboard')
  }

  const settingsCount = await Setting.countDocuments()
  if (settingsCount === 0) {
    const settingsData = await readJson('../data/settings.json')
    await Setting.create(settingsData)
    console.log('Seeded default settings')
  }

  const activityLogCount = await ActivityLog.countDocuments()
  if (activityLogCount === 0) {
    const activityLogsData = await readJson('../data/activityLogs.json')
    await ActivityLog.insertMany(activityLogsData)
    console.log('Seeded default activity logs')
  }
}
