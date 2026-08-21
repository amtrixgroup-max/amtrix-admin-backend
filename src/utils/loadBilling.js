import Invoice from '../models/Invoice.js'

function dueDateFrom(start, days = 30) {
  const date = start ? new Date(start) : new Date()
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  date.setDate(date.getDate() + days)
  return date
}

async function upsertInvoice({ id, type, load, name, total }) {
  const amount = Number(total) || 0
  if (amount <= 0 || !name) return null
  const existing = await Invoice.findOne({ $or: [{ id }, { loadNumber: load.id, type, recordKind: 'ar-ap' }] })
  const payload = {
    recordKind: 'ar-ap',
    type,
    name,
    companyName: name,
    invoiceNumber: id,
    invoiceDate: load.postedAt || load.sentToAccountingAt || new Date(),
    loadNumber: load.id,
    reference: load.reference || load.loadReference || '',
    paymentTerms: 'Net 30',
    dueDate: dueDateFrom(load.postedAt || load.sentToAccountingAt || new Date(), 30),
    deliveryDate: load.dropDate || null,
    invoiceTotal: amount,
    paid: existing?.paid || 0,
    balance: amount - Number(existing?.paid || 0),
    pickAddress: load.picks || '',
    dropAddress: load.drops || '',
    loadStatus: load.loadStatus || '',
    sentStatus: 'Generated',
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
  const ar = await upsertInvoice({
    id: `INV-AR-${load.id}`,
    type: 'AR',
    load,
    name: load.customer,
    total: load.income,
  })
  if (ar) created.push(ar)
  const ap = await upsertInvoice({
    id: `INV-AP-${load.id}`,
    type: 'AP',
    load,
    name: load.carrier,
    total: load.expenses,
  })
  if (ap) created.push(ap)
  return created
}
