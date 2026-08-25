import express from 'express'
import Invoice from '../models/Invoice.js'
import { authenticate } from '../middleware/auth.js'
import { serializeInvoice } from '../utils/invoiceAging.js'
import {
  andFilter,
  listResponse,
  mongoSort,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'

const router = express.Router()
router.use(authenticate)

function toList(docs) {
  return docs.map(serializeInvoice)
}

const AR_AP_SORT_FIELDS = {
  name: 'name',
  invoiceDate: 'invoiceDate',
  containerNumber: 'containerNumber',
  loadNumber: 'loadNumber',
  reference: 'reference',
  paymentTerms: 'paymentTerms',
  dueDate: 'dueDate',
  daysPastDue: 'dueDate',
  invoiceTotal: 'invoiceTotal',
  paid: 'paid',
  current: 'dueDate',
  pastDue0to29: 'dueDate',
  pastDue30: 'dueDate',
  pastDue60: 'dueDate',
  pastDue90: 'dueDate',
}

function accountingSort(raw, fallback) {
  const value = String(raw || '')
  const desc = value.startsWith('-')
  const requested = desc ? value.slice(1) : value
  const field = AR_AP_SORT_FIELDS[requested] || fallback
  return { [field]: desc ? -1 : 1, id: 1 }
}

router.get('/ar-ap', async (req, res, next) => {
  try {
    const filter = { recordKind: 'ar-ap' }
    const type = String(req.query.type || '').toUpperCase()
    if (type === 'AR' || type === 'AP') {
      filter.type = type
    }

    const list = parseListQuery(req.query, { defaultLimit: 10 })
    const queryFilter = andFilter(
      filter,
      textSearch(['name', 'companyName', 'invoiceNumber', 'loadNumber', 'reference', 'containerNumber'], list.search),
    )
    const { items, total } = await paginateFind(Invoice, queryFilter, {
      ...list,
      sort: accountingSort(req.query.sort, 'invoiceDate'),
    })
    res.json(listResponse(toList(items), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

router.get('/invoices', async (req, res, next) => {
  try {
    const filter = { recordKind: 'management' }
    if (req.query.tab) {
      filter.tab = req.query.tab
    }
    if (req.query.sentStatus === 'Not Sent to Customer') {
      filter.sentStatus = { $in: ['Unsent', 'Not Sent to Customer'] }
    } else if (req.query.sentStatus === 'Not Factored') {
      filter.sentStatus = { $ne: 'Factored' }
    } else if (req.query.sentStatus) {
      filter.sentStatus = req.query.sentStatus
    }

    const list = parseListQuery(req.query, { defaultLimit: 10 })
    const queryFilter = andFilter(
      filter,
      textSearch(
        ['companyName', 'loadNumber', 'id', 'invoiceNumber', 'reference', 'sentStatus', 'pickAddress', 'dropAddress', 'loadStatus'],
        list.search,
      ),
    )
    const { items, total } = await paginateFind(Invoice, queryFilter, {
      ...list,
      sort: req.query.sort ? mongoSort(req.query.sort) : { deliveryDate: -1, id: 1 },
    })
    res.json(listResponse(toList(items), { ...list, total }))
  } catch (error) {
    next(error)
  }
})

export default router
