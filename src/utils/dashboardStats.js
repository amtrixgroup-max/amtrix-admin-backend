import Load from '../models/Load.js'
import Invoice from '../models/Invoice.js'
import Department from '../models/Department.js'
import mongoose from 'mongoose'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROLE_TO_DEPT = {
  ADMIN_AP_FRIDGET: 'AP',
  ADMIN_TK_FRIDGET: 'TK',
  ADMIN_RCM: 'RCM',
  ADMIN_AGM: 'AGF',
  AP: 'AP',
  TK: 'TK',
  RCM: 'RCM',
  AGF: 'AGF',
}

const STATUS_COLORS = {
  Completed: '#22c55e',
  Pending: '#f59e0b',
  'In Transit': '#3b82f6',
  Cancelled: '#ef4444',
  Other: '#94a3b8',
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function quarterKey(date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return { year: date.getFullYear(), quarter, key: `Q${quarter} ${date.getFullYear()}` }
}

function parseDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function percent(achieved, target) {
  if (!target) return achieved > 0 ? 100 : 0
  return Math.max(0, Math.round((achieved / target) * 1000) / 10)
}

function trendPercent(current, previous) {
  if (!previous && !current) return 0
  if (!previous) return 100
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function classifyLoadStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value.includes('cancel')) return 'Cancelled'
  if (value.includes('transit') || value === 'dispatched' || value.includes('driver assigned')) return 'In Transit'
  if (
    value.includes('complet') ||
    value.includes('deliver') ||
    value.includes('archiv') ||
    value.includes('invoice')
  ) {
    return 'Completed'
  }
  if (
    value === 'new' ||
    value === 'open' ||
    value === 'planning' ||
    value === 'pending' ||
    value.includes('needs') ||
    value.includes('booked') ||
    value.includes('ready')
  ) {
    return 'Pending'
  }
  return 'Other'
}

function loadRevenue(load) {
  return numberValue(load.income) || numberValue(load.postedRate)
}

function isRevenueInvoice(invoice) {
  const type = String(invoice.type || '').toUpperCase()
  const tab = String(invoice.tab || '').toLowerCase()
  const kind = String(invoice.recordKind || '').toLowerCase()
  if (type === 'AP' || tab === 'bills') return false
  if (kind === 'ar-ap') return type === 'AR' || !type
  if (kind === 'management') return tab === 'invoices' || tab === 'reconcile-archive' || tab === 'search-archived'
  return type === 'AR'
}

function invoiceDate(invoice) {
  return parseDate(invoice.invoiceDate) || parseDate(invoice.deliveryDate) || parseDate(invoice.createdAt)
}

function idValues(id) {
  const str = String(id)
  const values = [str]
  if (mongoose.isValidObjectId(str) && str.length === 24) {
    values.push(new mongoose.Types.ObjectId(str))
  }
  return values
}

async function departmentFilter(req) {
  const user = req.user
  const isSuperAdmin = user?.systemRole === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN'
  const requested =
    String(req.query.department || req.query.module || '').trim().toUpperCase() ||
    ROLE_TO_DEPT[String(req.query.role || '').trim().toUpperCase()] ||
    ''

  if (isSuperAdmin) {
    if (!requested) return {}
    const department = await Department.findOne({
      $or: [{ code: requested }, { name: requested }],
    }).lean()
    const id = department?._id || requested
    return { departmentId: { $in: idValues(id) } }
  }

  if (user?.departmentId) {
    return { departmentId: { $in: idValues(user.departmentId) } }
  }
  return {}
}

export async function buildDashboardPayload(req) {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthStart = addMonths(thisMonthStart, -1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const rangeStart = addMonths(thisMonthStart, -11)

  const filter = await departmentFilter(req)
  const loads = await Load.find(filter).lean()
  const invoices = await Invoice.find({}).lean()

  const scopedLoads = loads
  const useInvoiceRevenue = !filter.departmentId
  const revenueEvents = []

  if (useInvoiceRevenue) {
    invoices.filter(isRevenueInvoice).forEach((invoice) => {
      const date = invoiceDate(invoice)
      if (!date) return
      revenueEvents.push({ date, amount: numberValue(invoice.invoiceTotal) })
    })
  }

  if (!revenueEvents.length) {
    scopedLoads.forEach((load) => {
      const date = parseDate(load.creationDate) || parseDate(load.createdAt) || now
      revenueEvents.push({ date, amount: loadRevenue(load) })
    })
  }

  const monthBuckets = new Map()
  for (let i = 0; i < 12; i += 1) {
    const cursor = addMonths(rangeStart, i)
    monthBuckets.set(monthKey(cursor), {
      month: MONTH_LABELS[cursor.getMonth()],
      year: cursor.getFullYear(),
      achieved: 0,
      loads: 0,
    })
  }

  const quarterBuckets = new Map()
  for (let i = 3; i >= 0; i -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i * 3, 1)
    const meta = quarterKey(cursor)
    if (!quarterBuckets.has(meta.key)) {
      quarterBuckets.set(meta.key, { quarter: meta.key, revenue: 0, loads: 0 })
    }
  }

  const statusCounts = {
    Completed: 0,
    Pending: 0,
    'In Transit': 0,
    Cancelled: 0,
    Other: 0,
  }

  let totalLoads = 0
  let completedLoads = 0
  let pendingLoads = 0
  let cancelledLoads = 0
  let thisMonthLoads = 0
  let lastMonthLoads = 0
  let thisMonthCompleted = 0
  let lastMonthCompleted = 0
  let thisMonthCancelled = 0
  let lastMonthCancelled = 0
  let thisMonthPending = 0
  let lastMonthPending = 0

  scopedLoads.forEach((load) => {
    totalLoads += 1
    const group = classifyLoadStatus(load.loadStatus)
    statusCounts[group] = (statusCounts[group] || 0) + 1
    if (group === 'Completed') completedLoads += 1
    else if (group === 'Cancelled') cancelledLoads += 1
    else pendingLoads += 1

    const date = parseDate(load.creationDate) || parseDate(load.createdAt)
    if (!date) return
    if (date >= thisMonthStart) {
      thisMonthLoads += 1
      if (group === 'Completed') thisMonthCompleted += 1
      else if (group === 'Cancelled') thisMonthCancelled += 1
      else thisMonthPending += 1
    } else if (date >= lastMonthStart && date < thisMonthStart) {
      lastMonthLoads += 1
      if (group === 'Completed') lastMonthCompleted += 1
      else if (group === 'Cancelled') lastMonthCancelled += 1
      else lastMonthPending += 1
    }

    const key = monthKey(date)
    if (monthBuckets.has(key)) monthBuckets.get(key).loads += 1
    const q = quarterKey(date)
    if (quarterBuckets.has(q.key)) quarterBuckets.get(q.key).loads += 1
  })

  let monthlyRevenue = 0
  let lastMonthRevenue = 0
  let quarterlyRevenue = 0
  let yearlyRevenue = 0

  revenueEvents.forEach((event) => {
    const { date, amount } = event
    if (date >= thisMonthStart) monthlyRevenue += amount
    else if (date >= lastMonthStart && date < thisMonthStart) lastMonthRevenue += amount
    if (date >= currentQuarterStart) quarterlyRevenue += amount
    if (date >= yearStart) yearlyRevenue += amount

    const key = monthKey(date)
    if (monthBuckets.has(key)) monthBuckets.get(key).achieved += amount
    const q = quarterKey(date)
    if (quarterBuckets.has(q.key)) quarterBuckets.get(q.key).revenue += amount
  })

  const monthlyRows = [...monthBuckets.values()]
  const peakMonth = monthlyRows.reduce((max, row) => Math.max(max, row.achieved), 0)
  const monthlyTarget = peakMonth > 0 ? Math.round(peakMonth * 1.1) : Math.round(Math.max(monthlyRevenue, 0) * 1.2)
  const quarterlyTarget = monthlyTarget * 3
  const yearlyTarget = monthlyTarget * 12

  const monthlyTargetChart = monthlyRows.map((row) => ({
    month: row.month,
    target: monthlyTarget,
    achieved: Math.round(row.achieved * 100) / 100,
  }))

  const revenueTrend = monthlyRows.map((row) => ({
    month: row.month,
    revenue: Math.round(row.achieved * 100) / 100,
  }))

  const quarterlyPerformance = [...quarterBuckets.values()].map((row) => ({
    quarter: row.quarter,
    revenue: Math.round(row.revenue * 100) / 100,
    loads: row.loads,
  }))

  const loadsStatus = Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Other,
    }))

  if (!loadsStatus.length) {
    loadsStatus.push(
      { name: 'Completed', value: 0, color: STATUS_COLORS.Completed },
      { name: 'Pending', value: 0, color: STATUS_COLORS.Pending },
      { name: 'Cancelled', value: 0, color: STATUS_COLORS.Cancelled },
    )
  }

  return {
    stats: {
      totalLoads,
      completedLoads,
      pendingLoads,
      cancelledLoads,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      monthlyTarget,
      quarterlyTarget,
      yearlyTarget,
      trends: {
        totalLoads: trendPercent(thisMonthLoads, lastMonthLoads),
        completedLoads: trendPercent(thisMonthCompleted, lastMonthCompleted),
        pendingLoads: trendPercent(thisMonthPending, lastMonthPending),
        cancelledLoads: trendPercent(thisMonthCancelled, lastMonthCancelled),
        monthlyRevenue: trendPercent(monthlyRevenue, lastMonthRevenue),
      },
    },
    targets: {
      monthly: {
        target: monthlyTarget,
        achieved: Math.round(monthlyRevenue * 100) / 100,
        percentage: percent(monthlyRevenue, monthlyTarget),
      },
      quarterly: {
        target: quarterlyTarget,
        achieved: Math.round(quarterlyRevenue * 100) / 100,
        percentage: percent(quarterlyRevenue, quarterlyTarget),
      },
      yearly: {
        target: yearlyTarget,
        achieved: Math.round(yearlyRevenue * 100) / 100,
        percentage: percent(yearlyRevenue, yearlyTarget),
      },
    },
    monthlyTargetChart,
    quarterlyPerformance,
    loadsStatus,
    revenueTrend,
  }
}
