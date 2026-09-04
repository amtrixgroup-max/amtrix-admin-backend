import Invoice from '../models/Invoice.js'
import Customer from '../models/Customer.js'
import Carrier from '../models/Carrier.js'
import mongoose from 'mongoose'
import { parsePaymentTermDays } from './invoiceAging.js'

function dueDateFrom(start, days = 30) {
  const date = start ? new Date(start) : new Date()
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  date.setDate(date.getDate() + days)
  return date
}

async function partyTerms(load, type) {
  if (type === 'AP') {
    const carrier = load?.carrier
      ? await Carrier.findOne({ name: load.carrier }).select('paymentTerms email').lean()
      : null
    const terms = carrier?.paymentTerms || load?.carrierPaymentTerms || load?.paymentTerms || 'Net 30'
    return { terms, days: parsePaymentTermDays(terms, 30) }
  }
  let customer = null
  if (load?.customerId && mongoose.isValidObjectId(load.customerId)) {
    customer = await Customer.findById(load.customerId).select('paymentTerms email').lean()
  }
  if (!customer && load?.customerId) {
    customer = await Customer.findOne({ id: load.customerId }).select('paymentTerms email').lean()
  }
  if (!customer && load?.customer) {
    customer = await Customer.findOne({ name: load.customer }).select('paymentTerms email').lean()
  }
  const terms = customer?.paymentTerms || load?.customerPaymentTerms || load?.paymentTerms || 'Net 30'
  return { terms, days: parsePaymentTermDays(terms, 30) }
}

async function upsertInvoice({ id, recordKind, type, tab, load, name, total, terms }) {
  const amount = Number(total) || 0
  if (amount <= 0 || !name) return null
  const existing = await Invoice.findOne({
    $or: [
      { id },
      { loadNumber: load.id, type, recordKind },
    ],
  })
  const invoiceDate = load.postedAt || load.sentToAccountingAt || new Date()
  const termDays = parsePaymentTermDays(terms, 30)
  const payload = {
    recordKind,
    type,
    tab,
    name,
    companyName: name,
    invoiceNumber: id,
    invoiceDate,
    loadNumber: load.id,
    reference: load.reference || load.loadReference || '',
    paymentTerms: terms || 'Net 30',
    dueDate: dueDateFrom(invoiceDate, termDays),
    deliveryDate: load.dropDate || null,
    invoiceTotal: amount,
    paid: existing?.paid || 0,
    balance: amount - Number(existing?.paid || 0),
    pickAddress: load.picks || '',
    dropAddress: load.drops || '',
    loadStatus: load.loadStatus || '',
    sentStatus: existing?.sentStatus || (recordKind === 'management' ? 'Not Sent to Customer' : 'Generated'),
    qboExportStatus: existing?.qboExportStatus || 'Not Exported',
    containerNumber: load.containerNumber || '',
  }
  if (existing) {
    await Invoice.updateOne({ _id: existing._id }, { $set: payload })
    return existing.id
  }
  await Invoice.create({ id, ...payload })
  return id
}

export async function upsertLoadBillingRecords(load) {
  const created = []
  const customerTerms = await partyTerms(load, 'AR')
  const carrierTerms = await partyTerms(load, 'AP')
  const ar = await upsertInvoice({
    id: `INV-AR-${load.id}`,
    recordKind: 'ar-ap',
    type: 'AR',
    load,
    name: load.customer,
    total: load.income,
    terms: customerTerms.terms,
  })
  if (ar) created.push(ar)
  const ap = await upsertInvoice({
    id: `INV-AP-${load.id}`,
    recordKind: 'ar-ap',
    type: 'AP',
    load,
    name: load.carrier,
    total: load.expenses,
    terms: carrierTerms.terms,
  })
  if (ap) created.push(ap)
  const invoice = await upsertInvoice({
    id: `INV-MGMT-${load.id}`,
    recordKind: 'management',
    type: 'AR',
    tab: 'invoices',
    load,
    name: load.customer,
    total: load.income,
    terms: customerTerms.terms,
  })
  if (invoice) created.push(invoice)
  const bill = await upsertInvoice({
    id: `BILL-MGMT-${load.id}`,
    recordKind: 'management',
    type: 'AP',
    tab: 'bills',
    load,
    name: load.carrier,
    total: load.expenses,
    terms: carrierTerms.terms,
  })
  if (bill) created.push(bill)
  return created
}
