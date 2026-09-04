import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PDFDocument from 'pdfkit'
import { lineTotal } from './loadValidation.js'

const COMPANY = {
  legalName: 'AP FREIGHT INC',
  address1: '4460 W SHAW AVE STE 620',
  address2: 'FRESNO, CA 93722-6210',
  docket: 'MC01117318',
  phone: '(559) 398-5555',
  accountingEmail: 'Accounting@apfreightinc.com',
}

const DUMMY_CARRIER = {
  name: 'Demo Carrier LLC',
  address: '1101 Freeman Ave Apt F',
  city: 'Long Beach',
  state: 'CA',
  zip: '90804',
  docket: 'MC-987654',
  phone: '(555) 010-2200',
  email: 'dispatch@democarrier.example',
  contactName: 'Alex Ramirez',
  drivers: 'Alex Ramirez',
}

const LEFT = 36
const WIDTH = 540
const PAGE_BOTTOM = 720
const FONT = 'Courier'
const FONT_BOLD = 'Courier-Bold'
const INK = '#000000'
const PAPER = '#ffffff'
const HEADER_GRAY = INK
const ROW_GRAY = PAPER
const LINE = INK
const TEXT = INK
const MUTED = INK

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const LOGO_PATH = path.join(ASSETS_DIR, 'AP-Freight.png')
const HAS_LOGO = fs.existsSync(LOGO_PATH)

const LOAD_CONFIRMATION_TERMS = [
  'Please mention VIN# on the rate confirmation',
  '1.Please send all Documents and Invoices to to Accounting@apfreightinc.com',
  '2.It is requested to pick up deliver the load as scheduled to avoid any deductions.',
  '3.Solely, the carrier is responsible for any damages to the goods during conveyance.',
  '4.The driver is responsible to check the number of pallets/cases ,seal# mentioned on the BOL and actual pallets loaded on the truck.',
  '5.Any shortages/damages to the Cargo are to be reported immediately to the concerned dispatcher. The rate agreed is final in all terms.',
  '6.There will be a deduction of $250 for any missed appointments .',
  '7.No Detention at shipper or receiver until unless mentioned in the agreement',
  '8. By signing the rate confirmation carrier agrees that the truck hauling this load is covered under their insurance.',
  '8.Please do not accept any Rate confirmations from any emails having domain other than apfreightinc.com .Please call 559-398-5555 in order to verify just in case you find anything suspicious.',
  '9. Failure to accept GPS tracking will lead to $250 deduction',
  '10. Failure to proactively complete driver verification using the Trucker Tools link provided by our Compliance Team before the driver checks in will result in a $250 deduction.',
]

function blank(value) {
  const text = String(value ?? '').trim()
  return text
}

function display(value) {
  const text = blank(value)
  if (!text) return ''
  if (text.includes('@')) return text
  return text.toUpperCase()
}

function moneyAmount(value) {
  return `$ ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function moneyPlain(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
}

function formatDay(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const text = String(value)
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const [year, month, day] = text.slice(0, 10).split('-')
      return `${month}/${day}/${year}`
    }
    return text.slice(0, 10)
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}/${date.getFullYear()}`
}

function formatShortDay(value) {
  const full = formatDay(value)
  if (!full || full.length < 10) return full
  return `${full.slice(0, 6)}${full.slice(8)}`
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16)
  const day = formatDay(date)
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${day} ${hours}:${minutes} ${ampm}`
}

function declaredValue(load) {
  const raw = load.declaredValue
  if (raw == null || raw === '') return ''
  const number = Number(String(raw).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(number)) return String(raw)
  return number.toFixed(2)
}

function weightText(load) {
  const weight = blank(load.weight)
  if (!weight) return ''
  if (/\b(lbs?|kg)\b/i.test(weight)) return weight
  return `${weight} ${load.weightUnit || 'lbs'}`
}

function distanceText(load) {
  const value = load.distance ?? load.miles ?? load.totalMiles
  if (value == null || value === '') return '0 miles'
  const text = String(value)
  if (/mile/i.test(text)) return text
  return `${text} miles`
}

function referenceText(load) {
  const value = blank(
    load.reference || load.loadReference || load.customerDetails?.customerReference,
  )
  return value
}

function mcText(value) {
  const text = blank(value)
  if (!text) return ''
  if (/^(mc|dot|ff)/i.test(text)) return text
  return `MC${text}`
}

function actionLabel(type) {
  const value = String(type || 'stop').toLowerCase()
  if (value === 'pickup') return 'Pickup'
  if (value === 'delivery') return 'Delivery'
  if (value === 'other') return 'Other'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function cityStateZip(details = {}) {
  const stateZip = [details.state, details.zip || details.postalCode].filter(Boolean).join(' ')
  return [details.city, stateZip].filter(Boolean).join(', ')
}

function addressLines(details = {}, name = '') {
  const lines = []
  if (name) lines.push(name)
  const street = blank(details.address || details.billingAddress || details.street)
  if (street) {
    street
      .split(/\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (!lines.includes(part)) lines.push(part)
      })
  }
  const cityLine = cityStateZip(details)
  if (cityLine) lines.push(cityLine)
  if (details.country && !['US', 'USA', 'United States'].includes(String(details.country))) {
    lines.push(details.country)
  }
  return lines
}

function customerDetails(load) {
  return load.customerDetails || {}
}

function carrierDetails(load) {
  const details = load.carrierDetails || {}
  if (blank(load.carrier) && blank(details.name)) {
    return { ...DUMMY_CARRIER, ...details, name: DUMMY_CARRIER.name }
  }
  return { ...details, name: load.carrier || details.name }
}

function incomeLines(load) {
  const lines = Array.isArray(load.incomeLines)
    ? load.incomeLines.filter((line) => blank(line.description) || Number(line.rate))
    : []
  if (lines.length) return lines
  const amount = Number(load.income || load.postedRate || 0)
  if (!amount) return []
  return [{ description: 'Flat Rate', notes: '', quantity: 1, rate: amount }]
}

function expenseLines(load) {
  const lines = Array.isArray(load.expenseLines)
    ? load.expenseLines.filter((line) => blank(line.description) || Number(line.rate))
    : []
  if (lines.length) return lines
  const amount = Number(load.expenses || 0)
  if (!amount) return []
  return [{ description: 'Flat Rate', notes: '', quantity: 1, rate: amount }]
}

function loadStops(load) {
  if (Array.isArray(load.stops) && load.stops.length) return load.stops
  return []
}

export function documentKindFromDoc(doc = {}) {
  const key = String(doc.key || '').toLowerCase()
  const id = String(doc.id || '').toLowerCase()
  const name = String(doc.name || '').toLowerCase()
  const types = (doc.documentTypes || []).join(' ').toLowerCase()
  const blob = `${key} ${id} ${name} ${types}`

  if (key === 'blind-bol' || blob.includes('blind')) return 'blind-bol'
  if (key === 'invoice' || blob.includes('invoice') || blob.includes('billing')) return 'invoice'
  if (key === 'bill-of-lading' || (name === 'bill of lading' && !blob.includes('stop'))) return 'bill-of-lading'
  if (
    key === 'load-confirmation' ||
    blob.includes('load confirmation') ||
    blob.includes('load-confirmation') ||
    blob.includes('carrier confirmation') ||
    blob.includes('carrier rate')
  ) {
    return 'load-confirmation'
  }
  if (
    key === 'rate-confirmation' ||
    key === 'customer-confirmation' ||
    blob.includes('rate confirmation') ||
    blob.includes('rate-confirmation') ||
    blob.includes('customer confirmation')
  ) {
    return 'rate-confirmation'
  }
  return 'bol'
}

function loadNumberForFilename(load = {}) {
  const digits = String(load.id || load.loadNo || '').replace(/\D/g, '')
  return digits || String(load.id || 'load').replace(/[^\w.-]+/g, '_')
}

function fileStamp(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  const safe = Number.isNaN(value.getTime()) ? new Date() : value
  const pad = (n) => String(n).padStart(2, '0')
  return `${safe.getFullYear()}${pad(safe.getMonth() + 1)}${pad(safe.getDate())}${pad(safe.getHours())}${pad(safe.getMinutes())}${pad(safe.getSeconds())}`
}

export function pdfFilename(doc = {}, load = {}) {
  const kind = documentKindFromDoc(doc)
  const loadId = loadNumberForFilename(load)
  const stamp = fileStamp()
  const names = {
    bol: `bill_of_lading_with_stop_signatures_${loadId}_${stamp}.pdf`,
    'bill-of-lading': `bill_of_lading_${loadId}_${stamp}.pdf`,
    'blind-bol': `blind_bill_of_lading_${loadId}_${stamp}.pdf`,
    'load-confirmation': `Load_Confirmation_${loadId}_${stamp}.pdf`,
    'rate-confirmation': `rate_confirm_${loadId}_${stamp}.pdf`,
    invoice: `load_invoice_${loadId}_${stamp}.pdf`,
  }
  return names[kind] || `${String(doc.name || 'document').replace(/[^\w.-]+/g, '_')}_${loadId}_${stamp}.pdf`
}

function drawDraftWatermark(doc) {
  if (!doc._draftInvoice) return
  doc.save()
  doc.translate(306, 396)
  doc.rotate(-32)
  doc.fillColor(INK).opacity(0.18)
  doc.font(FONT_BOLD).fontSize(96)
  doc.text('DRAFT', -280, -36, { width: 560, align: 'center', lineBreak: false })
  doc.restore()
}

function ensureSpace(doc, load, needed) {
  if (doc.y + needed <= PAGE_BOTTOM) return
  doc.addPage()
  drawDraftWatermark(doc)
  doc.y = 48
  drawCompanyHeader(doc, load, true)
}

function drawCompanyHeader(doc, load, compact = false) {
  const startY = doc.y
  let textX = LEFT
  if (HAS_LOGO) {
    try {
      doc.image(LOGO_PATH, LEFT, startY, { fit: [72, 36] })
      textX = LEFT + 80
    } catch {
      textX = LEFT
    }
  }
  const branch = blank(load.branch)
  const companyLine =
    branch && branch.toLowerCase() !== 'shared'
      ? `${branch} (${COMPANY.legalName})`
      : COMPANY.legalName
  doc.font(FONT_BOLD).fontSize(11).fillColor(TEXT).text(display(companyLine), textX, startY, {
    width: 320,
  })
  doc.font(FONT).fontSize(8).fillColor(MUTED)
  doc.text(display(COMPANY.address1), textX, doc.y, { width: 320 })
  doc.text(display(COMPANY.address2), textX, doc.y, { width: 320 })
  if (!compact) {
    doc.text(display(`Docket: ${COMPANY.docket}`), textX, doc.y, { width: 320 })
    doc.text(display(`Phone: ${COMPANY.phone}`), textX, doc.y, { width: 320 })
  }
  doc.fillColor(TEXT)
  doc.moveDown(compact ? 0.3 : 0.55)
}

function drawTitle(doc, title) {
  doc.font(FONT_BOLD).fontSize(14).fillColor(TEXT).text(display(title), LEFT, doc.y, { width: WIDTH })
  doc.moveDown(0.35)
}

function drawFactTable(doc, load, rows) {
  const colW = [108, 162, 108, 162]
  const x = [LEFT, LEFT + colW[0], LEFT + colW[0] + colW[1], LEFT + colW[0] + colW[1] + colW[2]]
  rows.forEach((row) => {
    ensureSpace(doc, load, 18)
    const y = doc.y
    const height = 16
    doc.save()
    doc.lineWidth(0.8).strokeColor(LINE)
    colW.forEach((width, index) => {
      doc.rect(x[index], y, width, height).fillAndStroke(PAPER, LINE)
    })
    doc.restore()
    row.forEach((cell, index) => {
      doc
        .font(index % 2 === 0 ? FONT_BOLD : FONT)
        .fontSize(8)
        .fillColor(INK)
        .text(display(cell), x[index] + 4, y + 4, { width: colW[index] - 8, height: 10, ellipsis: true })
    })
    doc.y = y + height
  })
  doc.moveDown(0.45)
}

function sectionBar(doc, load, title) {
  ensureSpace(doc, load, 22)
  const y = doc.y
  doc.rect(LEFT, y, WIDTH, 16).fill(INK)
  doc.font(FONT_BOLD).fontSize(9).fillColor(PAPER).text(display(title), LEFT + 6, y + 4, {
    width: WIDTH - 12,
  })
  doc.fillColor(TEXT)
  doc.y = y + 18
}

function labeledRows(doc, load, rows) {
  doc.font(FONT).fontSize(9)
  rows.forEach(([label, value]) => {
    const text = display(value)
    const height = Math.max(14, doc.heightOfString(text || ' ', { width: WIDTH - 130 }) + 4)
    ensureSpace(doc, load, height)
    const y = doc.y
    doc.font(FONT_BOLD).fontSize(8).fillColor(INK).text(display(label), LEFT + 4, y + 2, { width: 118 })
    doc.font(FONT).fontSize(9).fillColor(INK).text(text, LEFT + 126, y + 2, { width: WIDTH - 134 })
    doc.y = y + height
  })
  doc.moveDown(0.25)
}

function drawCustomerBlock(doc, load) {
  const details = customerDetails(load)
  sectionBar(doc, load, 'Customer Information')
  const name = blank(load.customer || details.name)
  const lines = addressLines(details, name)
  const mc = mcText(details.docketNumber || details.mcNumber || details.docket)
  ensureSpace(doc, load, 48)
  doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT).text(display(lines[0] || '-'), LEFT + 4, doc.y, {
    width: WIDTH - 8,
  })
  if (mc) {
    doc.font(FONT).fontSize(8).fillColor(INK).text(display(`MC Number: ${mc}`), LEFT + 4, doc.y, {
      width: WIDTH - 8,
    })
  }
  doc.font(FONT).fontSize(9).fillColor(TEXT)
  lines.slice(1).forEach((line) => doc.text(display(line), LEFT + 4, doc.y, { width: WIDTH - 8 }))
  doc.moveDown(0.2)
  labeledRows(doc, load, [
    ['MC Number', mc],
    ['Primary Contact', details.contactName || details.contact || details.primaryContact],
    ['Phone', details.contactPhone || details.primaryPhone || details.phone],
    ['Fax', details.fax || details.contactFax],
  ])
}

function drawCarrierBlock(doc, load) {
  const details = carrierDetails(load)
  sectionBar(doc, load, 'Carrier Information')
  const lines = addressLines(details, `1 ${details.name || load.carrier || DUMMY_CARRIER.name}`)
  ensureSpace(doc, load, 48)
  doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT).text(display(lines[0] || '1'), LEFT + 4, doc.y, {
    width: WIDTH - 8,
  })
  doc.font(FONT).fontSize(9).fillColor(TEXT)
  lines.slice(1).forEach((line) => doc.text(display(line), LEFT + 4, doc.y, { width: WIDTH - 8 }))
  if (details.phone) doc.text(display(details.phone), LEFT + 4, doc.y, { width: WIDTH - 8 })
  doc.moveDown(0.15)
  labeledRows(doc, load, [
    ['MC Number', mcText(details.docket || details.mcNumber || details.docketNumber)],
    ['Primary Contact', details.contactName || details.contact || details.primaryContact],
    ['Phone', details.phone || details.telephone],
    ['Fax', details.fax],
    ['Driver', load.driver || details.drivers || 'Driver not set'],
    ['Phone', details.driverPhone || load.driverPhone],
    ['Email', details.email || details.driverEmail],
    ['Fax', details.driverFax],
  ])
}

function drawNotesAndRefs(doc, load) {
  sectionBar(doc, load, 'Notes and References')
  labeledRows(doc, load, [
    ['Notes', load.publicNote || load.postingNotes || load.customerDetails?.publicNotes],
    ['Reference(s)', referenceText(load)],
  ])
}

function locationBlock(stop = {}, fallback = '') {
  return [
    stop.location || fallback,
    stop.address,
    [stop.city, [stop.state, stop.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    stop.country && !['US', 'USA'].includes(String(stop.country)) ? stop.country : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function contactBlock(stop = {}) {
  return [stop.contactName, stop.contactPhone].filter(Boolean).join('\n')
}

function drawStopsTable(doc, load, { signatures = false } = {}) {
  sectionBar(doc, load, 'Stops / Actions')
  const cols = [28, 72, 108, 210, 122]
  const headers = ['#', 'Action', 'Date/Time', 'Location', 'Contact']
  const x = cols.reduce((acc, width, index) => {
    acc.push(index === 0 ? LEFT : acc[index - 1] + cols[index - 1])
    return acc
  }, [])
  const headerY = doc.y
  doc.rect(LEFT, headerY, WIDTH, 16).fill(INK)
  doc.font(FONT_BOLD).fontSize(8).fillColor(PAPER)
  headers.forEach((header, index) => {
    doc.text(display(header), x[index] + 3, headerY + 4, { width: cols[index] - 6 })
  })
  doc.y = headerY + 16
  const stops = loadStops(load)
  if (!stops.length) {
    doc.save()
    doc.lineWidth(0.8).strokeColor(LINE).rect(LEFT, doc.y, WIDTH, 18).stroke()
    doc.restore()
    doc.y += 22
    return
  }
  doc.font(FONT).fontSize(8)
  stops.forEach((stop, index) => {
    const location = locationBlock(stop, index === 0 ? load.picks : load.drops)
    const contact = contactBlock(stop)
    const values = [
      String(index + 1),
      actionLabel(stop.type),
      formatDateTime(stop.scheduled || stop.appointment),
      location,
      contact,
    ]
    const height = Math.max(
      22,
      ...values.map((value, col) => doc.heightOfString(value || ' ', { width: cols[col] - 6 }) + 8),
    )
    ensureSpace(doc, load, height + (signatures ? 36 : 0))
    const y = doc.y
    if (index % 2 === 1) doc.rect(LEFT, y, WIDTH, height).fill(ROW_GRAY)
    doc.save()
    doc.lineWidth(0.8).strokeColor(LINE).rect(LEFT, y, WIDTH, height).stroke()
    doc.restore()
    doc.font(FONT).fontSize(8).fillColor(TEXT)
    values.forEach((value, col) => {
      doc.text(display(value) || '', x[col] + 3, y + 4, { width: cols[col] - 6 })
    })
    doc.y = y + height
    if (signatures) drawSignatureTrio(doc, load, 28)
  })
  doc.moveDown(0.25)
}

function drawPayItems(doc, load, lines) {
  sectionBar(doc, load, 'Pay Items')
  const cols = [168, 132, 60, 80, 100]
  const headers = ['Description', 'Notes', 'Quantity', 'Rate', 'Amount']
  const x = cols.reduce((acc, width, index) => {
    acc.push(index === 0 ? LEFT : acc[index - 1] + cols[index - 1])
    return acc
  }, [])
  const headerY = doc.y
  doc.rect(LEFT, headerY, WIDTH, 16).fill(INK)
  doc.font(FONT_BOLD).fontSize(8).fillColor(PAPER)
  headers.forEach((header, index) => {
    doc.text(display(header), x[index] + 3, headerY + 4, {
      width: cols[index] - 6,
      align: index > 1 ? 'right' : 'left',
    })
  })
  doc.y = headerY + 16
  let total = 0
  const rows = lines.length ? lines : []
  rows.forEach((line, index) => {
    const amount = line.amount != null ? Number(line.amount) : lineTotal(line)
    total += Number.isFinite(amount) ? amount : 0
    ensureSpace(doc, load, 18)
    const y = doc.y
    if (index % 2 === 1) doc.rect(LEFT, y, WIDTH, 16).fill(ROW_GRAY)
    doc.save()
    doc.lineWidth(0.8).strokeColor(LINE).rect(LEFT, y, WIDTH, 16).stroke()
    doc.restore()
    const values = [
      display(blank(line.description || line.company) || 'Flat Rate'),
      display(blank(line.notes)),
      String(line.quantity ?? 1),
      moneyPlain(line.rate || 0),
      moneyAmount(amount),
    ]
    doc.font(FONT).fontSize(8).fillColor(TEXT)
    values.forEach((value, col) => {
      doc.text(value, x[col] + 3, y + 4, {
        width: cols[col] - 6,
        align: col > 1 ? 'right' : 'left',
      })
    })
    doc.y = y + 16
  })
  ensureSpace(doc, load, 20)
  const y = doc.y
  doc.rect(LEFT, y, WIDTH, 18).fillAndStroke(PAPER, INK)
  doc.font(FONT_BOLD).fontSize(9).fillColor(TEXT)
  doc.text(display('Total'), LEFT + 4, y + 4, { width: 360 })
  doc.text(moneyAmount(total), LEFT + WIDTH - 104, y + 4, { width: 100, align: 'right' })
  doc.y = y + 24
  return total
}

function drawSignatureTrio(doc, load, extraBottom = 34) {
  ensureSpace(doc, load, extraBottom)
  const y = doc.y + 14
  const cols = [
    { label: 'Print Name', x: LEFT, w: 176 },
    { label: 'Signature', x: LEFT + 182, w: 176 },
    { label: 'Date', x: LEFT + 364, w: 176 },
  ]
  cols.forEach((col) => {
    doc.moveTo(col.x, y).lineTo(col.x + col.w, y).strokeColor(INK).lineWidth(0.8).stroke()
    doc.font(FONT).fontSize(8).fillColor(INK).text(display(col.label), col.x, y + 4, { width: col.w })
  })
  doc.y = y + extraBottom - 14
}

function drawSignSection(doc, load, title) {
  sectionBar(doc, load, title)
  drawSignatureTrio(doc, load, 36)
  doc.moveDown(0.2)
}

function drawTerms(doc, load, lines) {
  lines.forEach((line) => {
    const printed = display(line)
    const height = doc.heightOfString(printed, { width: WIDTH - 8 }) + 4
    ensureSpace(doc, load, height)
    doc.font(line.startsWith('***') ? FONT_BOLD : FONT).fontSize(8).fillColor(INK)
    doc.text(printed, LEFT + 2, doc.y, { width: WIDTH - 8 })
  })
  doc.moveDown(0.3)
}

function drawInvoicePayment(doc, load) {
  ensureSpace(doc, load, 160)
  doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT).text(display('PAYMENTS TERMS- NET 21'), LEFT, doc.y)
  doc.moveDown(0.3)
  doc.font(FONT_BOLD).fontSize(10).text(display('NOTICE OF ASSIGNMENT'), LEFT, doc.y)
  doc.moveDown(0.15)
  doc.font(FONT).fontSize(8)
  doc.text(display('This account has been transfered and assigned.'), LEFT, doc.y, { width: WIDTH })
  doc.text(display('By law, payments must be made to:'), LEFT, doc.y, { width: WIDTH })
  doc.moveDown(0.3)
  const y = doc.y
  doc.font(FONT_BOLD).fontSize(9).text(display('Internet Truckstop Payments, LLC'), LEFT, y, { width: 250 })
  doc.font(FONT).fontSize(8).text('888-777-5543', LEFT, y + 12, { width: 250 })
  doc.font(FONT_BOLD).text(display('Wire or ACH (Preferred)'), LEFT, y + 28, { width: 250 })
  doc.font(FONT)
  doc.text(display('Account # 8670220797'), LEFT, y + 40, { width: 250 })
  doc.text(display('ABA # 071000039'), LEFT, y + 52, { width: 250 })
  doc.font(FONT_BOLD).fontSize(9).text(display('Remit Checks to:'), LEFT + 280, y, { width: 250 })
  doc.font(FONT).fontSize(8)
  doc.text(display('Bank of America Lockbox Services'), LEFT + 280, y + 12, { width: 250 })
  doc.text(display('540 W Madison, 4th Floor'), LEFT + 280, y + 24, { width: 250 })
  doc.text(display('Chicago IL 60661'), LEFT + 280, y + 36, { width: 250 })
  doc.font(FONT_BOLD).text(display('Internet Truckstop Payments, LLC'), LEFT + 280, y + 52, { width: 250 })
  doc.font(FONT)
  doc.text(display('PO Box 7410411'), LEFT + 280, y + 64, { width: 250 })
  doc.text(display('Chicago, IL 60674-0411'), LEFT + 280, y + 76, { width: 250 })
  doc.y = y + 96
  doc.font(FONT).fontSize(8).text(
    'Please send all remittance information to FactoringAR@truckstop.com',
    LEFT,
    doc.y,
    { width: WIDTH },
  )
}

function drawFooter(doc, load) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i)
    const saved = { ...doc.page.margins }
    doc.page.margins = { top: 0, bottom: 0, left: saved.left, right: saved.right }
    doc.font(FONT).fontSize(8).fillColor(INK)
    doc.text(display(`Page ${i + 1} out of ${range.count} | Load #${blank(load.id)}`), LEFT, 14, {
      width: WIDTH,
      align: 'right',
      lineBreak: false,
    })
    doc.text(`-- ${i + 1} of ${range.count} --`, LEFT, 776, {
      width: WIDTH,
      align: 'center',
      lineBreak: false,
    })
    doc.page.margins = saved
  }
}

function startDocument(doc, load, title) {
  doc.y = 40
  drawDraftWatermark(doc)
  drawCompanyHeader(doc, load)
  drawTitle(doc, title)
}

function bolFacts(load) {
  return [
    ['Load #', blank(load.id), 'Date', formatDay(load.creationDate || load.postedAt || load.updatedAt || new Date())],
    ['Weight', weightText(load), 'Commodity', load.commodity],
    ['Distance', distanceText(load), '', ''],
  ]
}

function fillBol(doc, load, { blind = false, stopSignatures = false } = {}) {
  startDocument(doc, load, 'BILL OF LADING')
  drawFactTable(doc, load, bolFacts(load))
  if (!blind) drawCustomerBlock(doc, load)
  drawNotesAndRefs(doc, load)
  drawStopsTable(doc, load, { signatures: stopSignatures })
  if (stopSignatures) {
    drawSignSection(doc, load, 'Driver / Carrier')
  } else {
    drawSignSection(doc, load, 'Shipper / Consignor')
    drawSignSection(doc, load, 'Driver / Carrier')
    drawSignSection(doc, load, 'Receiver / Consignee')
  }
}

function fillLoadConfirmation(doc, load) {
  startDocument(doc, load, 'LOAD CONFIRMATION')
  drawFactTable(doc, load, [
    ['Load #', blank(load.id), 'Date', formatDay(load.creationDate || load.postedAt || load.updatedAt || new Date())],
    ['Equipment', load.equipmentType || load.equipment, 'Equipment Length', load.equipmentLength],
    ['Weight', weightText(load), 'Commodity', load.commodity],
    ['Distance', distanceText(load), '', ''],
  ])
  drawCarrierBlock(doc, load)
  drawNotesAndRefs(doc, load)
  drawStopsTable(doc, load)
  drawPayItems(doc, load, expenseLines(load))
  drawTerms(doc, load, LOAD_CONFIRMATION_TERMS)
  doc.font(FONT_BOLD).fontSize(8).text(
    display('*** NO LOADS TO BE DOUBLE BROKERED ,IF DOUBLE BROKERED THE CARRIER WILL NOT BE PAID FOR THAT LOAD***'),
    LEFT,
    doc.y,
    { width: WIDTH },
  )
  doc.moveDown(0.6)
  labeledRows(doc, load, [
    ['Driver Name', load.driver || load.carrierDetails?.drivers],
    ['Driver Cell Phone #', load.driverPhone || load.carrierDetails?.driverPhone || load.carrierDetails?.phone],
  ])
  drawSignatureTrio(doc, load, 40)
}

function fillRateConfirmation(doc, load) {
  startDocument(doc, load, 'RATE CONFIRMATION')
  drawFactTable(doc, load, [
    ['Load #', blank(load.id), 'Date', formatDay(load.creationDate || load.postedAt || load.updatedAt || new Date())],
    ['Reference', referenceText(load), 'Distance', distanceText(load)],
  ])
  drawCustomerBlock(doc, load)
  drawPayItems(doc, load, incomeLines(load))
  drawStopsTable(doc, load)
  drawSignatureTrio(doc, load, 40)
}

function fillInvoice(doc, load) {
  startDocument(doc, load, 'INVOICE')
  drawFactTable(doc, load, [
    ['Invoice #', blank(load.id), 'Date', formatDay(load.sentToAccountingAt || load.postedAt || load.creationDate || new Date())],
    ['Reference', referenceText(load), 'Weight', weightText(load)],
    ['Distance', distanceText(load), '', ''],
  ])
  drawCustomerBlock(doc, load)
  drawPayItems(doc, load, incomeLines(load))
  drawStopsTable(doc, load)
  drawInvoicePayment(doc, load)
}

function writeDocument(kind) {
  switch (kind) {
    case 'invoice':
      return fillInvoice
    case 'load-confirmation':
      return fillLoadConfirmation
    case 'rate-confirmation':
      return fillRateConfirmation
    case 'blind-bol':
      return (doc, load) => fillBol(doc, load, { blind: true, stopSignatures: false })
    case 'bill-of-lading':
      return (doc, load) => fillBol(doc, load, { blind: false, stopSignatures: false })
    default:
      return (doc, load) => fillBol(doc, load, { blind: false, stopSignatures: true })
  }
}

export function buildLoadDocumentPdf(load, docMeta = {}, options = {}) {
  const kind = documentKindFromDoc(docMeta)
  const fill = writeDocument(kind)
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 50, left: 36, right: 36 },
      bufferPages: true,
      info: {
        Title: docMeta.name || kind,
        Author: COMPANY.legalName,
        Subject: `Load ${load.id || ''}`,
      },
    })
    pdf._draftInvoice = Boolean(kind === 'invoice' && options.draftInvoice)
    const chunks = []
    pdf.on('data', (chunk) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    fill(pdf, load)
    drawFooter(pdf, load)
    pdf.end()
  })
}
