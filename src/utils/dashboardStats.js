import Load from '../models/Load.js'
import Invoice from '../models/Invoice.js'
import Department from '../models/Department.js'
import DashboardConfig from '../models/DashboardConfig.js'
import BrokerTarget from '../models/BrokerTarget.js'
import CustomerApprovalRequest from '../models/CustomerApprovalRequest.js'
import McCheckRequest from '../models/McCheckRequest.js'
import mongoose from 'mongoose'
import {
  getRoleMeta,
  isElevatedAdmin,
  isComplianceUser,
  isNormalUserRole,
} from './mcCheckAccess.js'

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

function roundMoney(value) {
  return Math.round(numberValue(value) * 100) / 100
}

async function isBrokerDashboardUser(user) {
  if (!user) return false
  if (user.systemRole === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') {
    return false
  }
  if (await isElevatedAdmin(user)) return false
  if (await isComplianceUser(user)) return false
  const meta = await getRoleMeta(user)
  const name = String(meta?.name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
  if (name === 'ACCOUNTS' || name === 'ACCOUNT' || name === 'TL' || name === 'TEAM_LEADER') {
    return false
  }
  return isNormalUserRole(meta?.name)
}

function ownLoadsFilter(user) {
  const userIds = idValues(user?._id)
  if (!userIds.length) return { _id: null }
  return {
    $or: [{ createdBy: { $in: userIds } }, { assignedUserId: { $in: userIds } }],
  }
}

function combineFilters(base, extra) {
  const parts = [base, extra].filter((item) => item && Object.keys(item).length)
  if (!parts.length) return {}
  if (parts.length === 1) return parts[0]
  return { $and: parts }
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

export function resolveDashboardWorkspace(req) {
  const requested =
    String(req.query?.department || req.query?.module || req.body?.workspace || '')
      .trim()
      .toUpperCase() ||
    ROLE_TO_DEPT[String(req.query?.role || '').trim().toUpperCase()] ||
    ''
  return requested || 'ALL'
}

function configuredAmount(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function serializeDashboardConfig(config) {
  if (!config) {
    return {
      workspace: 'ALL',
      monthlyTarget: null,
      quarterlyTarget: null,
      yearlyTarget: null,
      customCards: [],
      targetsConfigured: false,
    }
  }
  const doc = config.toObject ? config.toObject() : { ...config }
  return {
    id: String(doc._id || ''),
    workspace: doc.workspace || 'ALL',
    monthlyTarget: doc.monthlyTarget ?? null,
    quarterlyTarget: doc.quarterlyTarget ?? null,
    yearlyTarget: doc.yearlyTarget ?? null,
    customCards: Array.isArray(doc.customCards)
      ? doc.customCards.map((card) => ({
          id: String(card._id || card.id || ''),
          title: card.title,
          value: numberValue(card.value),
          format: card.format || 'number',
          trend: card.trend == null ? undefined : numberValue(card.trend),
          trendLabel: card.trendLabel || 'vs last month',
          icon: card.icon || 'Target',
        }))
      : [],
    targetsConfigured: Boolean(
      configuredAmount(doc.monthlyTarget) ||
        configuredAmount(doc.quarterlyTarget) ||
        configuredAmount(doc.yearlyTarget),
    ),
    updatedAt: doc.updatedAt || null,
  }
}

export async function getDashboardConfig(workspace) {
  const key = String(workspace || 'ALL').trim().toUpperCase() || 'ALL'
  return DashboardConfig.findOne({ workspace: key })
}

export async function upsertDashboardConfig(workspace) {
  const key = String(workspace || 'ALL').trim().toUpperCase() || 'ALL'
  return DashboardConfig.findOneAndUpdate(
    { workspace: key },
    { $setOnInsert: { workspace: key, customCards: [] } },
    { new: true, upsert: true },
  )
}

function overlayPeriodTargets(payload, monthlyTarget, yearlyTarget, targetsConfigured) {
  const monthlyByYear = payload.monthlyByYear
    ? Object.fromEntries(
        Object.entries(payload.monthlyByYear).map(([year, rows]) => [
          year,
          (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            target: monthlyTarget,
          })),
        ]),
      )
    : payload.monthlyByYear

  const yearlySeries = Array.isArray(payload.yearlySeries)
    ? payload.yearlySeries.map((row) => ({
        ...row,
        target: yearlyTarget,
      }))
    : payload.yearlySeries

  const anyAchieved =
    numberValue(payload.targets?.yearly?.achieved) > 0 ||
    numberValue(payload.targets?.monthly?.achieved) > 0 ||
    (Array.isArray(yearlySeries) && yearlySeries.some((row) => numberValue(row.achieved) > 0))

  return {
    monthlyByYear,
    yearlySeries,
    hasTargetData: Boolean(targetsConfigured || anyAchieved),
  }
}

function resolvedAssignedMonthly(assigned) {
  if (!assigned) return null
  if (configuredAmount(assigned.monthlyTarget)) return configuredAmount(assigned.monthlyTarget)
  if (configuredAmount(assigned.yearlyTarget)) return roundMoney(configuredAmount(assigned.yearlyTarget) / 12)
  return null
}

function resolvedAssignedYearly(assigned) {
  if (!assigned) return null
  if (configuredAmount(assigned.yearlyTarget)) return configuredAmount(assigned.yearlyTarget)
  if (configuredAmount(assigned.monthlyTarget)) return roundMoney(configuredAmount(assigned.monthlyTarget) * 12)
  return null
}

export async function overlayAssignedBrokerTargets(payload, userId) {
  if (!payload || !userId) return payload
  const years = Array.isArray(payload.targetYears) && payload.targetYears.length
    ? payload.targetYears
    : [new Date().getFullYear()]
  const docs = await BrokerTarget.find({ userId, year: { $in: years } }).lean()
  if (!docs.length) return payload

  const byYear = new Map(docs.map((doc) => [Number(doc.year), doc]))
  const currentYear = new Date().getFullYear()
  const current = byYear.get(currentYear) || byYear.get(Number(payload.targetYears?.[payload.targetYears.length - 1])) || docs[0]

  const monthlyByYear = payload.monthlyByYear
    ? Object.fromEntries(
        Object.entries(payload.monthlyByYear).map(([year, rows]) => {
          const monthlyTarget = resolvedAssignedMonthly(byYear.get(Number(year)))
          return [
            year,
            (Array.isArray(rows) ? rows : []).map((row) => ({
              ...row,
              target: monthlyTarget ?? row.target,
            })),
          ]
        }),
      )
    : payload.monthlyByYear

  const yearlySeries = Array.isArray(payload.yearlySeries)
    ? payload.yearlySeries.map((row) => {
        const yearlyTarget = resolvedAssignedYearly(byYear.get(Number(row.year)))
        return {
          ...row,
          target: yearlyTarget ?? row.target,
        }
      })
    : payload.yearlySeries

  const monthlyTarget = resolvedAssignedMonthly(current) ?? payload.targets?.monthly?.target
  const yearlyTarget = resolvedAssignedYearly(current) ?? payload.targets?.yearly?.target
  const monthlyAchieved = payload.targets?.monthly?.achieved ?? 0
  const yearlyAchieved = payload.targets?.yearly?.achieved ?? 0
  const targetsConfigured = docs.some(
    (doc) => configuredAmount(doc.monthlyTarget) || configuredAmount(doc.yearlyTarget),
  )

  return {
    ...payload,
    monthlyByYear,
    yearlySeries,
    stats: {
      ...payload.stats,
      monthlyTarget,
      yearlyTarget,
    },
    targets: {
      ...payload.targets,
      monthly: {
        target: monthlyTarget,
        achieved: monthlyAchieved,
        remaining: Math.max(0, roundMoney(monthlyTarget - monthlyAchieved)),
        percentage: percent(monthlyAchieved, monthlyTarget),
      },
      yearly: {
        ...(payload.targets?.yearly || {}),
        target: yearlyTarget,
        achieved: yearlyAchieved,
        remaining: Math.max(0, roundMoney(yearlyTarget - yearlyAchieved)),
        percentage: percent(yearlyAchieved, yearlyTarget),
      },
    },
    targetsConfigured,
    hasTargetData: Boolean(targetsConfigured || payload.hasTargetData),
    assignedTarget: current
      ? {
          year: current.year,
          monthlyTarget: current.monthlyTarget,
          yearlyTarget: current.yearlyTarget,
          startDate: current.startDate,
          endDate: current.endDate,
        }
      : null,
  }
}

export function applyDashboardConfig(payload, config) {
  if (!payload) return payload
  if (!config) return payload

  const monthlyTarget = configuredAmount(config.monthlyTarget, payload.stats.monthlyTarget)
  const quarterlyTarget = configuredAmount(config.quarterlyTarget, payload.stats.quarterlyTarget)
  const yearlyTarget = configuredAmount(config.yearlyTarget, payload.stats.yearlyTarget)
  const targetsConfigured = Boolean(
    configuredAmount(config.monthlyTarget) ||
      configuredAmount(config.quarterlyTarget) ||
      configuredAmount(config.yearlyTarget),
  )

  const monthlyAchieved = payload.targets?.monthly?.achieved ?? payload.stats.monthlyRevenue
  const quarterlyAchieved = payload.targets?.quarterly?.achieved ?? 0
  const yearlyAchieved = payload.targets?.yearly?.achieved ?? 0
  const overlay = overlayPeriodTargets(
    {
      ...payload,
      targets: {
        ...payload.targets,
        yearly: { ...(payload.targets?.yearly || {}), achieved: yearlyAchieved },
        monthly: { ...(payload.targets?.monthly || {}), achieved: monthlyAchieved },
      },
    },
    monthlyTarget,
    yearlyTarget,
    targetsConfigured,
  )

  return {
    ...payload,
    stats: {
      ...payload.stats,
      monthlyTarget,
      quarterlyTarget,
      yearlyTarget,
    },
    targets: {
      monthly: {
        target: monthlyTarget,
        achieved: monthlyAchieved,
        remaining: Math.max(0, roundMoney(monthlyTarget - monthlyAchieved)),
        percentage: percent(monthlyAchieved, monthlyTarget),
      },
      quarterly: {
        target: quarterlyTarget,
        achieved: quarterlyAchieved,
        remaining: Math.max(0, roundMoney(quarterlyTarget - quarterlyAchieved)),
        percentage: percent(quarterlyAchieved, quarterlyTarget),
      },
      yearly: {
        target: yearlyTarget,
        achieved: yearlyAchieved,
        remaining: Math.max(0, roundMoney(yearlyTarget - yearlyAchieved)),
        percentage: percent(yearlyAchieved, yearlyTarget),
      },
    },
    monthlyTargetChart: Array.isArray(payload.monthlyTargetChart)
      ? payload.monthlyTargetChart.map((row) => ({ ...row, target: monthlyTarget }))
      : payload.monthlyTargetChart,
    ...overlay,
    targetsConfigured,
  }
}

async function brokerRequestCounts(user) {
  const requesterId = user?._id
  if (!requesterId) {
    return {
      approvalPending: 0,
      mcPending: 0,
      mcTotal: 0,
      mcApproved: 0,
      mcRejected: 0,
    }
  }

  const [approvalPending, mcPending, mcTotal, mcApproved, mcRejected] = await Promise.all([
    CustomerApprovalRequest.countDocuments({ requesterId, status: 'PENDING' }),
    McCheckRequest.countDocuments({
      requesterId,
      status: { $in: ['PENDING', 'EXCEPTION_PENDING'] },
    }),
    McCheckRequest.countDocuments({ requesterId }),
    McCheckRequest.countDocuments({
      requesterId,
      status: { $in: ['APPROVED', 'EXCEPTION_APPROVED', 'ADD_CARRIER_REQUESTED', 'CARRIER_ADDED'] },
    }),
    McCheckRequest.countDocuments({
      requesterId,
      status: { $in: ['REJECTED', 'EXCEPTION_REJECTED', 'BLOCKED'] },
    }),
  ])

  return { approvalPending, mcPending, mcTotal, mcApproved, mcRejected }
}

export async function buildDashboardPayload(req) {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthStart = addMonths(thisMonthStart, -1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const rangeStart = addMonths(thisMonthStart, -11)
  const currentYear = now.getFullYear()
  const broker = await isBrokerDashboardUser(req.user)

  const deptFilter = await departmentFilter(req)
  const filter = broker ? combineFilters(deptFilter, ownLoadsFilter(req.user)) : deptFilter
  const loads = await Load.find(filter).lean()
  const useInvoiceRevenue = !broker && !deptFilter.departmentId
  const invoices = useInvoiceRevenue ? await Invoice.find({}).lean() : []

  const scopedLoads = loads
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
  let thisMonthInTransit = 0
  let lastMonthInTransit = 0
  let thisMonthOpenPending = 0
  let lastMonthOpenPending = 0

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
      if (group === 'In Transit') thisMonthInTransit += 1
      else if (group === 'Pending' || group === 'Other') thisMonthOpenPending += 1
    } else if (date >= lastMonthStart && date < thisMonthStart) {
      lastMonthLoads += 1
      if (group === 'Completed') lastMonthCompleted += 1
      else if (group === 'Cancelled') lastMonthCancelled += 1
      else lastMonthPending += 1
      if (group === 'In Transit') lastMonthInTransit += 1
      else if (group === 'Pending' || group === 'Other') lastMonthOpenPending += 1
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

  const targetYears = []
  for (let year = currentYear - 4; year <= currentYear; year += 1) {
    targetYears.push(year)
  }

  const monthlyByYear = {}
  targetYears.forEach((year) => {
    monthlyByYear[year] = MONTH_LABELS.map((month) => ({
      month,
      target: 0,
      achieved: 0,
    }))
  })

  const yearlyAchievedMap = new Map(targetYears.map((year) => [year, 0]))

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

    const year = date.getFullYear()
    if (monthlyByYear[year]) {
      monthlyByYear[year][date.getMonth()].achieved += amount
      yearlyAchievedMap.set(year, (yearlyAchievedMap.get(year) || 0) + amount)
    }
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

  const roundedMonthlyByYear = Object.fromEntries(
    Object.entries(monthlyByYear).map(([year, rows]) => [
      year,
      rows.map((row) => ({
        ...row,
        target: monthlyTarget,
        achieved: roundMoney(row.achieved),
      })),
    ]),
  )

  const yearlySeries = targetYears.map((year) => ({
    year: String(year),
    target: yearlyTarget,
    achieved: roundMoney(yearlyAchievedMap.get(year) || 0),
  }))

  const deliveredLoads = statusCounts.Completed || 0
  const inTransitLoads = statusCounts['In Transit'] || 0
  const openPendingLoads = statusCounts.Pending || 0
  const anyAchieved = yearlyRevenue > 0 || monthlyRevenue > 0 || yearlySeries.some((row) => row.achieved > 0)

  const payload = {
    stats: {
      totalLoads,
      completedLoads,
      pendingLoads,
      cancelledLoads,
      deliveredLoads,
      inTransitLoads,
      openPendingLoads,
      monthlyRevenue: roundMoney(monthlyRevenue),
      monthlyTarget,
      quarterlyTarget,
      yearlyTarget,
      trends: {
        totalLoads: trendPercent(thisMonthLoads, lastMonthLoads),
        completedLoads: trendPercent(thisMonthCompleted, lastMonthCompleted),
        deliveredLoads: trendPercent(thisMonthCompleted, lastMonthCompleted),
        pendingLoads: trendPercent(thisMonthPending, lastMonthPending),
        openPendingLoads: trendPercent(thisMonthOpenPending, lastMonthOpenPending),
        inTransitLoads: trendPercent(thisMonthInTransit, lastMonthInTransit),
        cancelledLoads: trendPercent(thisMonthCancelled, lastMonthCancelled),
        monthlyRevenue: trendPercent(monthlyRevenue, lastMonthRevenue),
      },
    },
    targets: {
      monthly: {
        target: monthlyTarget,
        achieved: roundMoney(monthlyRevenue),
        remaining: Math.max(0, roundMoney(monthlyTarget - monthlyRevenue)),
        percentage: percent(monthlyRevenue, monthlyTarget),
      },
      quarterly: {
        target: quarterlyTarget,
        achieved: roundMoney(quarterlyRevenue),
        remaining: Math.max(0, roundMoney(quarterlyTarget - quarterlyRevenue)),
        percentage: percent(quarterlyRevenue, quarterlyTarget),
      },
      yearly: {
        target: yearlyTarget,
        achieved: roundMoney(yearlyRevenue),
        remaining: Math.max(0, roundMoney(yearlyTarget - yearlyRevenue)),
        percentage: percent(yearlyRevenue, yearlyTarget),
      },
    },
    monthlyTargetChart,
    quarterlyPerformance,
    loadsStatus,
    revenueTrend,
    targetYears,
    monthlyByYear: roundedMonthlyByYear,
    yearlySeries,
    hasTargetData: anyAchieved,
    targetsConfigured: false,
  }

  if (broker) {
    payload.brokerRequests = await brokerRequestCounts(req.user)
    payload.scope = 'broker'
  }

  const workspace = resolveDashboardWorkspace(req)
  const config = await getDashboardConfig(workspace)
  const withWorkspace = applyDashboardConfig(payload, config)
  if (!broker) return withWorkspace
  return overlayAssignedBrokerTargets(withWorkspace, req.user?._id)
}
