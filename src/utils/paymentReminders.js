import Invoice from '../models/Invoice.js'
import Load from '../models/Load.js'
import Customer from '../models/Customer.js'
import Carrier from '../models/Carrier.js'
import { sendMail } from './mailer.js'
import { daysPastDue, serializeInvoice, shouldSendPaymentReminder } from './invoiceAging.js'

const COMPANY = 'AP FREIGHT INC'
const CHECK_INTERVAL_MS = 15 * 60 * 1000

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

async function findLoad(invoice) {
  const loadNumber = String(invoice.loadNumber || '').trim()
  if (!loadNumber) return null
  return Load.findOne({ id: loadNumber }).lean()
}

function namedPartyQuery(...values) {
  const names = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
  if (!names.length) return null
  return { name: { $in: names } }
}

async function reminderRecipient(invoice, load) {
  const type = String(invoice.type || '').toUpperCase()
  if (type === 'AP') {
    const fromLoad = load?.carrierDetails?.email || load?.carrierDetails?.contactEmail || ''
    if (fromLoad) return { email: String(fromLoad).trim(), name: load?.carrier || invoice.companyName || 'Carrier' }
    const query = namedPartyQuery(invoice.companyName, invoice.name, load?.carrier)
    const carrier = query ? await Carrier.findOne(query).select('email contact name').lean() : null
    return {
      email: String(carrier?.email || '').trim(),
      name: carrier?.contact || carrier?.name || invoice.companyName || 'Carrier',
    }
  }
  const fromLoad = load?.customerDetails?.contactEmail || load?.customerDetails?.email || ''
  if (fromLoad) {
    return {
      email: String(fromLoad).trim(),
      name: load?.customerDetails?.contactName || load?.customer || invoice.companyName,
    }
  }
  const query = namedPartyQuery(invoice.companyName, invoice.name, load?.customer)
  const customer = query ? await Customer.findOne(query).select('email contact name').lean() : null
  return {
    email: String(customer?.email || '').trim(),
    name: customer?.contact || customer?.name || invoice.companyName || 'Customer',
  }
}

function reminderCopy(invoice, recipient) {
  const type = String(invoice.type || '').toUpperCase()
  const overdue = daysPastDue(invoice.dueDate)
  const loadId = invoice.loadNumber || ''
  const number = invoice.invoiceNumber || invoice.id
  const party = type === 'AP' ? 'carrier bill' : 'invoice'
  const subject = `Payment reminder: ${type === 'AP' ? 'Bill' : 'Invoice'} ${number}${loadId ? ` for load ${loadId}` : ''} is ${overdue} day${overdue === 1 ? '' : 's'} past due`
  const text = `Hello ${recipient.name || ''}!

This is an automated reminder from ${COMPANY}.

${type === 'AP' ? 'Carrier bill' : 'Customer invoice'}: ${number}
Load: ${loadId || '—'}
Amount due: ${money(invoice.balance)}
Payment terms: ${invoice.paymentTerms || 'Net 30'}
Due date: ${formatDate(invoice.dueDate)}
Days past due: ${overdue}

Please arrange payment for this ${party} as soon as possible. If payment has already been sent, you can ignore this message.

Thanks,
${COMPANY}`
  return { subject, text }
}

export async function sendOverduePaymentReminders(now = new Date()) {
  const invoices = await Invoice.find({
    recordKind: 'ar-ap',
    dueDate: { $ne: null, $lte: now },
  })

  let sent = 0
  for (const doc of invoices) {
    const invoice = serializeInvoice(doc)
    if (!shouldSendPaymentReminder(invoice, now)) continue
    try {
      const load = await findLoad(invoice)
      const recipient = await reminderRecipient(invoice, load)
      if (!recipient.email) {
        doc.lastPaymentReminderAt = now
        await doc.save()
        continue
      }
      const { subject, text } = reminderCopy(invoice, recipient)
      const result = await sendMail({
        to: recipient.email,
        subject,
        text,
        fromName: `${COMPANY} Accounts`,
      })
      if (result.skipped || result.sent === false) continue
      doc.lastPaymentReminderAt = now
      doc.paymentReminderCount = Number(doc.paymentReminderCount || 0) + 1
      await doc.save()
      sent += 1
    } catch (error) {
      console.error('Payment reminder failed:', error?.message || error)
    }
  }
  return sent
}

export function startPaymentReminderJob() {
  sendOverduePaymentReminders().catch((error) => {
    console.error('Payment reminder startup failed:', error?.message || error)
  })
  const timer = setInterval(() => {
    sendOverduePaymentReminders().catch((error) => {
      console.error('Payment reminder job failed:', error?.message || error)
    })
  }, CHECK_INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
  return timer
}
