import Load from '../models/Load.js'
import Invoice from '../models/Invoice.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import { serializeInvoice } from './invoiceAging.js'
import { readyToAddRequestIds } from './customerReadyToAdd.js'
import { andFilter } from './listQuery.js'
import { userScopeFilter } from './loadScope.js'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BILLED_STATUSES = new Set(['Sent to Customer', 'Sent via EDI'])

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function parseYear(value) {
  const year = Number.parseInt(value, 10)
  const current = new Date().getFullYear()
  if (!Number.isFinite(year) || year < current - 10 || year > current + 5) return current
  return year
}

function emptyBuckets() {
  return { d0to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 }
}

function addToBucket(buckets, daysPastDue, amount) {
  if (amount <= 0) return
  if (daysPastDue <= 30) buckets.d0to30 += amount
  else if (daysPastDue <= 60) buckets.d31to60 += amount
  else if (daysPastDue <= 90) buckets.d61to90 += amount
  else buckets.d90plus += amount
}

function uniqueKey(invoice) {
  return String(invoice.companyName || invoice.name || invoice.id || invoice._id || '')
}

function loadAmount(load) {
  return Number(load.income) || Number(load.postedRate) || 0
}

function rollupAging(invoices) {
  const buckets = emptyBuckets()
  const accounts = new Set()
  invoices.forEach((doc) => {
    const invoice = serializeInvoice(doc)
    const balance = Number(invoice.balance) || 0
    if (balance <= 0) return
    accounts.add(uniqueKey(invoice) || String(invoice.id))
    addToBucket(buckets, Number(invoice.daysPastDue) || 0, balance)
  })
  return {
    count: accounts.size,
    buckets: {
      d0to30: roundMoney(buckets.d0to30),
      d31to60: roundMoney(buckets.d31to60),
      d61to90: roundMoney(buckets.d61to90),
      d90plus: roundMoney(buckets.d90plus),
    },
  }
}

function emptyMonthRows() {
  return MONTH_LABELS.map((month) => ({ month, billed: 0, factored: 0 }))
}

export async function buildAccountsDashboard({ user, year: yearValue, department } = {}) {
  const year = parseYear(yearValue)
  const currentYear = new Date().getFullYear()
  let departmentFilter = user?.departmentId ? { departmentId: user.departmentId } : {}
  if (!user?.departmentId && department) {
    const { default: Department } = await import('../models/Department.js')
    const code = String(department).trim().toUpperCase()
    const dept = await Department.findOne({
      $or: [{ code }, { name: code }, { displayName: code }],
    })
      .select('_id')
      .lean()
    if (dept?._id) departmentFilter = { departmentId: dept._id }
  }
  const toBeBilledFilter = andFilter(
    userScopeFilter(user),
    { $or: [{ tab: 'accounting' }, { loadStatus: /invoice|to be billed/i }] },
    { loadStatus: /^To Be Billed$/i },
  )

  const [
    readyIds,
    pendingApprovals,
    toBeBilledLoads,
    arInvoices,
    apInvoices,
    managementInvoices,
  ] = await Promise.all([
    readyToAddRequestIds(departmentFilter),
    CustomerApprovalRequest.countDocuments({
      ...departmentFilter,
      status: { $in: ['PENDING', 'PREPAID'] },
    }),
    Load.find(toBeBilledFilter).select('id income postedRate loadStatus tab').lean(),
    Invoice.find({ recordKind: 'ar-ap', type: 'AR' }).lean(),
    Invoice.find({ recordKind: 'ar-ap', type: 'AP' }).lean(),
    Invoice.find({ recordKind: 'management', type: 'AR', tab: { $ne: 'bills' } }).lean(),
  ])

  const customerAging = rollupAging(arInvoices)
  const carrierAging = rollupAging(apInvoices)

  const factoredLoads = new Set()
  let billedAmount = 0
  let factoredAmount = 0
  const monthlyByYear = {}
  const yearlyMap = new Map()

  const targetYears = []
  for (let item = currentYear - 4; item <= currentYear; item += 1) {
    targetYears.push(item)
    monthlyByYear[item] = emptyMonthRows()
    yearlyMap.set(item, { billed: 0, factored: 0 })
  }

  managementInvoices.forEach((doc) => {
    const invoice = serializeInvoice(doc)
    const amount = Number(invoice.invoiceTotal) || 0
    const status = String(invoice.sentStatus || '')
    const date = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null
    const invoiceYear = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null

    if (status === 'Factored') {
      factoredAmount += amount
      if (invoice.loadNumber) factoredLoads.add(String(invoice.loadNumber))
      else factoredLoads.add(String(invoice.id))
      if (invoiceYear && yearlyMap.has(invoiceYear)) {
        yearlyMap.get(invoiceYear).factored += amount
        monthlyByYear[invoiceYear][date.getMonth()].factored += amount
      }
    } else if (BILLED_STATUSES.has(status)) {
      billedAmount += amount
      if (invoiceYear && yearlyMap.has(invoiceYear)) {
        yearlyMap.get(invoiceYear).billed += amount
        monthlyByYear[invoiceYear][date.getMonth()].billed += amount
      }
    }
  })

  arInvoices.forEach((doc) => {
    const invoice = serializeInvoice(doc)
    if (String(invoice.sentStatus || '') !== 'Factored') return
    const key = String(invoice.loadNumber || invoice.id)
    if (factoredLoads.has(key)) return
    const amount = Number(invoice.invoiceTotal) || 0
    factoredLoads.add(key)
    factoredAmount += amount
    const date = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null
    const invoiceYear = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null
    if (invoiceYear && yearlyMap.has(invoiceYear)) {
      yearlyMap.get(invoiceYear).factored += amount
      monthlyByYear[invoiceYear][date.getMonth()].factored += amount
    }
  })

  const toBeBilledAmount = toBeBilledLoads.reduce((sum, load) => sum + loadAmount(load), 0)

  const roundedMonthlyByYear = Object.fromEntries(
    Object.entries(monthlyByYear).map(([key, rows]) => [
      key,
      rows.map((row) => ({
        month: row.month,
        billed: roundMoney(row.billed),
        factored: roundMoney(row.factored),
      })),
    ]),
  )

  const yearlySeries = targetYears.map((item) => ({
    year: String(item),
    billed: roundMoney(yearlyMap.get(item)?.billed || 0),
    factored: roundMoney(yearlyMap.get(item)?.factored || 0),
  }))

  return {
    year,
    targetYears,
    overview: {
      customerAdd: readyIds.length,
      toBeBilled: toBeBilledLoads.length,
      customerAging: customerAging.count,
      carrierAging: carrierAging.count,
      factoring: factoredLoads.size,
      approvalRequests: pendingApprovals,
    },
    billing: {
      toBeBilled: roundMoney(toBeBilledAmount),
      billed: roundMoney(billedAmount),
      factored: roundMoney(factoredAmount),
      total: roundMoney(toBeBilledAmount + billedAmount + factoredAmount),
    },
    monthlyByYear: roundedMonthlyByYear,
    yearlySeries,
    aging: {
      customer: customerAging.buckets,
      carrier: carrierAging.buckets,
    },
  }
}

export { parseYear }
