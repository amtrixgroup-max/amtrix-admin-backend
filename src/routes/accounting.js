import express from 'express'
import Invoice from '../models/Invoice.js'
import { authenticate } from '../middleware/auth.js'
import { serializeInvoice } from '../utils/invoiceAging.js'

const router = express.Router()
router.use(authenticate)

function toList(docs) {
  return docs.map(serializeInvoice)
}

router.get('/ar-ap', async (req, res, next) => {
  try {
    const filter = { recordKind: 'ar-ap' }
    const type = String(req.query.type || '').toUpperCase()
    if (type === 'AR' || type === 'AP') {
      filter.type = type
    }

    const invoices = await Invoice.find(filter).sort({ invoiceDate: -1, id: 1 })
    res.json({ success: true, data: toList(invoices) })
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

    const invoices = await Invoice.find(filter).sort({ deliveryDate: -1, id: 1 })
    res.json({ success: true, data: toList(invoices) })
  } catch (error) {
    next(error)
  }
})

export default router
