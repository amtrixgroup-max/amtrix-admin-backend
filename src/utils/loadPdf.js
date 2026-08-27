import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PDFDocument from 'pdfkit'
import { lineTotal } from './loadValidation.js'

const LOGO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/AP-Freight.png')
const HAS_LOGO = fs.existsSync(LOGO_PATH)

const COMPANY = {
  legalName: 'AP FREIGHT INC',
  dispatchName: 'AP DISPATCH',
  address1: '4460 W SHAW AVE',
  address2: 'STE 620',
  address3: 'FRESNO CA 93722-6210',
  docket: 'MC01117318',
  phone: '(559) 398-5555',
  dispatchEmail: 'dispatch@apfreightinc.com',
  accountingEmail: 'Accounting@apfreightinc.com',
}

const PAGE = { width: 612, height: 792 }
const M = 22
const RIGHT = PAGE.width - M
const CONTENT_W = RIGHT - M
const CONTENT_BOTTOM = 628
const TEXT = '#000000'
const LINE = '#000000'
const MUTED = '#000000'
const FONT = {
  load: ['Courier-Bold', 17],
  header: ['Courier-Bold', 10],
  label: ['Helvetica', 9],
  body: ['Courier-Bold', 8.5],
  bodyReg: ['Courier', 8.5],
  section: ['Helvetica-Bold', 10],
  stop: ['Courier-Bold', 10],
  terms: ['Courier', 8.5],
  termsBold: ['Courier-Bold', 8.5],
  pro: ['Helvetica', 10],
  proTitle: ['Helvetica-Bold', 16],
  footer: ['Helvetica', 10],
  footerSmall: ['Helvetica', 7],
  page: ['Courier-Bold', 12],
}

function setType(doc, style, size) {
  const [font, defaultSize] = FONT[style] || FONT.body
  doc.font(font).fontSize(size || defaultSize).fillColor(TEXT)
  return doc
}

const CARRIER_TERMS = [
  'BY ACCEPTING THIS LOAD TENDER CARRIER IS AGREEING TO THE TERMS AND CONDITIONS',
  '1. CARRIER MUST SEND ALL UPDATES TWICE DAILY (6AM AND 4PM) AND CHECK CALLS VIA EMAIL TO ***dispatch@apfreightinc.com***',
  '2. CARRIER MUST UPDATE AP FREIGHT WITH CHECK IN AND CHECK OUT TIMES VIA EMAIL TO ****dispatch@apfreightinc.com***',
  '3. AP FREIGHT WILL PRE-SET ALL PICKUP APTS IN ADVANCE BUT WE MUST TALK TO ALL DRIVERS BEFORE LOADING. TRACKING MUST BE ACCEPTED BEFORE LOAD IS PICKED. IF NOT ACCEPTED $150 FIRST DAY $50/DAY UNTIL DURATION OF LOAD.',
  '4. CARRIER WILL BE CHARGED $250 FOR RE-SCHEDULING APPOINTMENTS.',
  '5. CARRIER WILL BE RESPONSIBLE FOR MAKING PICKUP AND DELIVERY APTS ONTIME TO AVOID LATE PICKUP AND DELIVERY FINE. IF LATE TO PICKUP OR DELIVERY WILL VOID LAYOVERS AND $250 MINIMUM LATE FEES.',
  '6. CARRIER WILL BE RESPONSIBLE FOR ANY OS&D ISSUES AND MUST EMAIL ON ALL REJECTIONS FOR REDELIVERY INFO.',
  '7. CARRIER WILL BE RESPONSIBLE TO MAINTAIN TEMPERATURE AND CONFIRM TEMPERATURE SETTING WITH AP FREIGHT VIA EMAIL ****dispatch@apfreightinc.com****',
  '8. IF THE LOAD OR PART OF THE LOAD IS REJECTED DUE TO QUALITY, REDELIVERY FEE WILL APPLY. EMAIL: dispatch@apfreightinc.com ON ALL REJECTIONS RIGHT AWAY WITH COPIES OF THE BOL AND PICTURE OF THE PRODUCT INSIDE THE TRAILER.',
  '9. IF CARRIER REFUSES TO PICKUP LOAD AFTER BOOKING, HE WILL BE LIABLE TO PAY DIFFERENCE OF LOAD AMOUNT PAID EXTRA TO SOME OTHER CARRIER TO COVER THE LOAD AND $250 FEES.',
  '10. ANY TEAM LOADS BOOKED SHOULD BE HONOURED BY 2 TEAM DRIVERS. IF A CARRIER SENDS A SOLO INSTEAD OF TEAM, HE WILL BE ONLY PAID THE HALF AMOUNT OF THE LOAD UPON LOAD COMPLETION.',
  '11. CARRIER WILL BE CHARGED $250 FOR RE-SCHEDULING APPOINTMENTS.',
  '12. IF THERE IS A REJECTION ON THE LOAD AND HAS TO BE DELIVERED AT A DIFFERENT FACILITY, ORM IS SET AT $2.00 PER MILE AND $100 FOR EXTRA STOP.',
  '13. No detention will be paid on this load.',
  '14. TONU is set at $150.00 and Layover is set at $200.00',
  '15. Please mention VIN# on the rate confirmation.',
  '16. Failure to accept GPS tracking will lead to $250 deduction.',
  '17. Failure to proactively complete driver verification using the Trucker Tools link provided by our Compliance Team before the driver checks in will result in a $250 deduction.',
  '18. Please do not accept any Rate confirmations from any emails having domain other than apfreightinc.com. Please call 559-398-5555 in order to verify just in case you find anything suspicious.',
  '*** NO LOADS TO BE DOUBLE BROKERED. IF DOUBLE BROKERED THE CARRIER WILL NOT BE PAID FOR THAT LOAD ***',
  '******ACCOUNTING INSTRUCTIONS BELOW******',
  '***CARRIER MUST SUBMIT POD ALONG WITH LUMPER RECEIPT WITHIN 24 HOURS TO AVOID $100 LATE SUBMISSION FEE.***',
  'CARRIER MUST PROVIDE IN AND OUT TIMES ON THE BOL',
  'MENTION QUICK PAY ON ACTUAL INVOICE AND EMAIL TO AVOID ANY DELAYS IN PAYMENTS.',
  'QUICK PAY TERMS (FROM DATE OF INVOICE AND COMPLETE PAPERWORK RECEIPT)',
  '5 % - Next Business Day',
  '2% - Within 7 Business Days',
  'STANDARD - 30 Business Days',
  'IF CARRIER NEEDS TRACKING ON MAILED CHECKS, ADDITIONAL CHARGES WILL BE APPLIED',
  'In order to process the payment, carrier must include all PODs, Lumper receipt (If any), signed rate confirmation and invoice. Payment will be placed on hold if complete paperwork is not submitted to Accounting@apfreightinc.com',
  '**** PLEASE EMAIL INVOICES AND PAPERWORK TO Accounting@apfreightinc.com ****',
  '**** FOR ACCOUNTING RELATED QUESTIONS, PLEASE EMAIL TO Accounting@apfreightinc.com ****',
  `If carrier wants quick pay, they will have to mail original PODs and invoice to our office address- ${COMPANY.address1}, ${COMPANY.address2}, ${COMPANY.address3}`,
  'Once original documents are received, payment will be processed.',
]

const INVOICE_TERMS = [
  'PAYMENTS TERMS- NET 21',
  'NOTICE OF ASSIGNMENT',
  'Please send all remittance information and paperwork to Accounting@apfreightinc.com',
  'In order to process the payment, include all PODs, lumper receipt (if any), signed rate confirmation and invoice.',
  'Payment will be placed on hold if complete paperwork is not submitted.',
  `**** PLEASE EMAIL INVOICES AND PAPERWORK TO ${COMPANY.accountingEmail} ****`,
]

function blank(value) {
  return String(value ?? '').trim()
}

function moneyPlain(value) {
  return Number(value || 0).toFixed(2)
}

function formatDay2(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const text = String(value)
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const [year, month, day] = text.slice(0, 10).split('-')
      return `${month}/${day}/${year.slice(2)}`
    }
    return text.slice(0, 8)
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear()).slice(2)
  return `${month}/${day}/${year}`
}

function formatStamp(value) {
  const date = value ? new Date(value) : new Date()
  const source = Number.isNaN(date.getTime()) ? new Date() : date
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(source)
    const get = (type) => parts.find((part) => part.type === type)?.value || ''
    return `${get('month')}/${get('day')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')} (EST)`
  } catch {
    const month = String(source.getMonth() + 1).padStart(2, '0')
    const day = String(source.getDate()).padStart(2, '0')
    const year = String(source.getFullYear()).slice(2)
    const hours = String(source.getHours()).padStart(2, '0')
    const minutes = String(source.getMinutes()).padStart(2, '0')
    const seconds = String(source.getSeconds()).padStart(2, '0')
    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} (EST)`
  }
}

function formatAppt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16)
  }
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDay2(date)} @ ${hours}:${minutes}`
}

function cityStateZip(details = {}) {
  const stateZip = [details.state, details.zip || details.postalCode].filter(Boolean).join(' ')
  return [details.city, stateZip].filter(Boolean).join(' ')
}

function mcText(value) {
  const text = blank(value)
  if (!text) return ''
  return text.replace(/^mc\s*-?/i, '').trim()
}

function customerDetails(load) {
  return load.customerDetails || {}
}

function carrierDetails(load) {
  const details = load.carrierDetails || {}
  return { ...details, name: load.carrier || details.name || '' }
}

function incomeLines(load) {
  const lines = Array.isArray(load.incomeLines)
    ? load.incomeLines.filter((line) => blank(line.description) || Number(line.rate))
    : []
  if (lines.length) return lines
  const amount = Number(load.income || load.postedRate || 0)
  if (!amount) return []
  return [{ description: 'LINE HAUL RATE', notes: '', quantity: 1, rate: amount }]
}

function expenseLines(load) {
  const lines = Array.isArray(load.expenseLines)
    ? load.expenseLines.filter((line) => blank(line.description) || Number(line.rate))
    : []
  if (lines.length) return lines
  const amount = Number(load.expenses || 0)
  if (!amount) return []
  return [{ description: 'LINE HAUL RATE', notes: '', quantity: 1, rate: amount }]
}

function loadStops(load) {
  return Array.isArray(load.stops) ? load.stops : []
}

function milesNumber(load) {
  const value = load.distance ?? load.miles ?? load.totalMiles
  if (value == null || value === '') return ''
  return String(value).replace(/[^\d.]/g, '')
}

function sizeAndType(load) {
  const length = blank(load.equipmentLength)
  const type = blank(load.equipmentType || load.equipment)
  if (length && type) {
    const prefix = /['′]/.test(length) ? length : `${length}'`
    return `${prefix} ${type}`.toUpperCase()
  }
  return (type || length).toUpperCase()
}

function tempLine(load) {
  const lower = blank(load.lowerTemp)
  const upper = blank(load.upperTemp)
  const temp = blank(load.temperature)
  if (lower && upper) {
    const precool = temp ? ` PRECOOL ${temp}` : ''
    return `* TEMP RANGE ${lower} TO ${upper}${precool} *`
  }
  if (temp) return `* TEMP ${temp} *`
  return ''
}

function documentTitle(kind) {
  if (kind === 'invoice') return 'Invoice'
  if (kind === 'bol') return 'Bill of Lading'
  if (kind === 'blind-bol') return 'Blind Bill of Lading'
  if (kind === 'load-confirmation') return 'Rate Confirmation'
  return 'Rate Confirmation'
}

export function documentKindFromDoc(doc = {}) {
  const key = String(doc.key || '').toLowerCase()
  const id = String(doc.id || '').toLowerCase()
  const name = String(doc.name || '').toLowerCase()
  const types = (doc.documentTypes || []).join(' ').toLowerCase()
  const blob = `${key} ${id} ${name} ${types}`

  if (key === 'blind-bol' || blob.includes('blind')) return 'blind-bol'
  if (key === 'invoice' || blob.includes('invoice') || blob.includes('billing')) return 'invoice'
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

export function pdfFilename(doc = {}, load = {}) {
  const kind = documentKindFromDoc(doc)
  const loadId = String(load.id || 'load').replace(/[^\w.-]+/g, '_')
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const names = {
    bol: `bill_of_lading_with_stop_signatures_${loadId}_${stamp}.pdf`,
    'blind-bol': `blind_bill_of_lading_${loadId}_${stamp}.pdf`,
    'load-confirmation': `Carrier_Rate_Confirmation_${loadId}_${stamp}.pdf`,
    'rate-confirmation': `rate_confirm_${loadId}_${stamp}.pdf`,
    invoice: `load_invoice_${loadId}_${stamp}.pdf`,
  }
  return names[kind] || `${String(doc.name || 'document').replace(/[^\w.-]+/g, '_')}.pdf`
}

function partyForKind(kind, load) {
  if (kind === 'invoice' || kind === 'rate-confirmation') {
    const details = customerDetails(load)
    return {
      ...details,
      name: load.customer || details.name,
      phone: details.contactPhone || details.primaryPhone || details.phone,
      fax: details.fax || details.contactFax,
      contactName: details.contactName || details.contact || details.primaryContact,
      docket: details.docketNumber || details.mcNumber || details.docket,
      dot: details.dot,
    }
  }
  const details = carrierDetails(load)
  return {
    ...details,
    phone: details.phone || details.telephone || load.driverPhone,
    fax: details.fax || details.driverFax,
    contactName: details.contactName || details.contact || details.primaryContact || load.driver,
    docket: details.docket || details.mcNumber || details.docketNumber,
    dot: details.dot || details.dotNumber,
  }
}

function chargesForKind(kind, load) {
  if (kind === 'rate-confirmation' || kind === 'invoice') return incomeLines(load)
  const carrierPay = expenseLines(load)
  if (carrierPay.length) return carrierPay
  return incomeLines(load)
}

function termsForKind(kind) {
  if (kind === 'invoice') return [...INVOICE_TERMS, ...CARRIER_TERMS]
  return CARRIER_TERMS
}

function dispatchNotes(load, kind) {
  const temp = tempLine(load)
  return [
    blank(load.publicNote),
    blank(load.postingNotes),
    blank(load.customerDetails?.publicNotes),
    temp && !/\btemp\b/i.test(`${load.publicNote || ''} ${load.postingNotes || ''}`) ? temp.replace(/^\* |\s\*$/g, '') : '',
    kind === 'invoice' ? `Email paperwork to ${COMPANY.accountingEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function drawCheckbox(doc, x, y, size = 7) {
  doc.save()
  doc.lineWidth(0.55).strokeColor(LINE).rect(x, y, size, size).stroke()
  doc.restore()
}

function drawVerticalWord(doc, word, x, y, size = 8, gap = 8) {
  setType(doc, 'header', size)
  String(word || '')
    .split('')
    .forEach((letter, index) => {
      doc.text(letter, x, y + index * gap, { width: 10, align: 'center', lineBreak: false })
    })
}

function drawPageFrame(doc) {
  withOpenMargins(doc, () => {
    doc.save()
    doc.lineWidth(0.9).strokeColor(LINE).rect(M, 14, CONTENT_W, PAGE.height - 36).stroke()
    doc.restore()
  })
}

function drawHeader(doc, ctx) {
  const { load, kind } = ctx
  const loadNo = blank(load.id)
  const issued = formatStamp(load.updatedAt || load.postedAt || load.creationDate || load.createdAt)
  const party = partyForKind(kind, load)
  const dispatcher = (blank(load.usersRoles) || COMPANY.dispatchName).toUpperCase()
  const rightW = RIGHT - 8 - 318

  drawPageFrame(doc)

  let loadX = M + 8
  if (HAS_LOGO) {
    try {
      doc.image(LOGO_PATH, M + 6, 16, { fit: [48, 48] })
      loadX = M + 58
    } catch {
      loadX = M + 8
    }
  }

  const loadSize = loadNo.length > 22 ? 11 : loadNo.length > 16 ? 13 : 17
  setType(doc, 'load', loadSize).text(loadNo, loadX, 22, {
    width: 310 - loadX,
    lineBreak: false,
  })

  const rightX = 318
  setType(doc, 'header').text(`${loadNo} ${issued}`, rightX, 20, {
    width: rightW,
    align: 'right',
    lineBreak: false,
  })
  doc.text(dispatcher, rightX, 34, {
    width: rightW,
    align: 'right',
  })
  doc.text(`${COMPANY.phone} (p)`, rightX, 46, { width: rightW, align: 'right' })
  doc.text(COMPANY.dispatchEmail, rightX, 57, { width: rightW, align: 'right' })

  const partyY = 74
  setType(doc, 'header').text((party.name || '').toUpperCase(), M + 8, partyY, {
    width: 280,
  })
  const phoneLine = [party.phone ? `${party.phone} (p)` : '', party.fax ? `Att: ${party.fax}` : '']
    .filter(Boolean)
    .join(' ')
  doc.text(phoneLine, M + 8, partyY + 14, { width: 280 })

  const idX = 468
  const idW = RIGHT - 8 - idX
  setType(doc, 'header').text(COMPANY.legalName, rightX, partyY, { width: 148 })
  doc.text(COMPANY.address1, rightX, partyY + 14, { width: 148 })
  doc.text(COMPANY.address2, rightX, partyY + 25, { width: 148 })
  doc.text(COMPANY.address3, rightX, partyY + 36, { width: 148 })
  if (mcText(party.docket)) {
    doc.text(mcText(party.docket), idX, partyY, { width: idW, align: 'right', lineBreak: false })
  }
  const ref = blank(load.loadReference || load.reference || load.customerDetails?.customerReference)
  const compact = blank(load.id).replace(/[^\w]/g, '').slice(-10)
  const extra = ref || (compact && compact !== blank(load.id) ? compact : '')
  if (extra) {
    doc.text(extra, idX, partyY + 14, { width: idW, align: 'right', lineBreak: false })
  }
  if (blank(party.dot)) {
    doc.text(blank(party.dot), idX, partyY + 25, { width: idW, align: 'right', lineBreak: false })
  }
  const partyContact = [party.contactName, party.phone].filter(Boolean).join(' ')
  if (partyContact) {
    doc.text(partyContact, idX, partyY + 36, { width: idW, align: 'right', lineBreak: false })
  }
  const brokerContact = [dispatcher, COMPANY.phone].filter(Boolean).join(' ')
  doc.text(brokerContact, rightX, partyY + 48, { width: 250 })

  const gridY = 138
  doc.moveTo(M, gridY).lineTo(RIGHT, gridY).lineWidth(0.6).stroke()
  setType(doc, 'label')
  doc.text('Size & Type:', M + 8, gridY + 6, { width: 170 })
  doc.text('Description:', 200, gridY + 6, { width: 220 })
  doc.text('Miles:', 470, gridY + 6, { width: 90 })
  doc.text('Pieces:', M + 8, gridY + 18, { width: 170 })
  doc.text('Weight:', 200, gridY + 18, { width: 220 })

  setType(doc, 'header')
  doc.text(sizeAndType(load), M + 8, gridY + 34, { width: 180 })
  doc.text(blank(load.commodity || load.commodityDescription).toUpperCase(), 200, gridY + 34, {
    width: 250,
  })
  doc.text(milesNumber(load), 470, gridY + 34, { width: 90 })
  setType(doc, 'body')
  doc.text(blank(load.palletCount || load.quantity), M + 8, gridY + 48, { width: 170 })
  doc.text(blank(load.weight), 200, gridY + 48, { width: 220 })

  const temp = tempLine(load)
  let nextY = gridY + 66
  if (temp) {
    setType(doc, 'header', 9).text(temp, M + 8, gridY + 64, { width: CONTENT_W - 16 })
    nextY = gridY + 80
  }
  doc.moveTo(M, nextY).lineTo(RIGHT, nextY).lineWidth(0.6).stroke()
  ctx.contentTop = nextY + 6
  doc.y = ctx.contentTop
}

function drawFooter(doc, ctx) {
  const { title } = ctx
  const top = 648
  withOpenMargins(doc, () => {
  doc.save()
  doc.lineWidth(0.7).strokeColor(LINE).moveTo(M, top).lineTo(RIGHT, top).stroke()
  setType(doc, 'pro').text('PRO #', M + 8, top + 6, {
    width: 40,
    lineBreak: false,
  })
  setType(doc, 'proTitle').text(title, 78, top + 2, { width: 280, lineBreak: false })

  drawVerticalWord(doc, 'FROM', M + 6, top + 22, 8, 8)
  drawVerticalWord(doc, 'CARRIER', M + 16, top + 22, 8, 8)

  const fx = 78
  const fields = ['MC #', 'DOT', 'Driver', 'Truck #', 'Trailer #', 'Cell #']
  fields.forEach((label, index) => {
    const y = top + 22 + index * 12
    setType(doc, 'footer').text(label, fx, y, { width: 52, lineBreak: false })
    doc.moveTo(fx + 54, y + 9).lineTo(338, y + 9).lineWidth(0.5).strokeColor(LINE).stroke()
  })

  setType(doc, 'footer').text('Carrier Signature', 348, top + 78, {
    width: 90,
    lineBreak: false,
  })
  doc.moveTo(438, top + 88).lineTo(516, top + 88).stroke()
  doc.text('Date', 524, top + 78, { width: 28, lineBreak: false })
  doc.text('/   /', 552, top + 86, { width: 40, lineBreak: false })
  setType(doc, 'footerSmall')
  doc.text('M', 554, top + 96, { width: 12 })
  doc.text('D', 574, top + 96, { width: 12 })

  setType(doc, 'label')
  doc.text('Send Carrier Bills to the Address Above', M + 8, top + 108, {
    width: 280,
    lineBreak: false,
  })
  doc.text('PRO # must appear on all Invoices', 348, top + 108, {
    width: 240,
    align: 'right',
    lineBreak: false,
  })
  doc.restore()
  })
}

function withOpenMargins(doc, fn) {
  const saved = { ...doc.page.margins }
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 }
  fn()
  doc.page.margins = saved
}

function writePageNumbers(doc) {
  const range = doc.bufferedPageRange()
  const count = range.count
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(range.start + i)
    setType(doc, 'page').text(`-- ${i + 1} of ${count} --`, M, 778, {
      width: CONTENT_W,
      align: 'center',
      lineBreak: false,
    })
  }
}

function ensureSpace(doc, ctx, needed) {
  if (doc.y + needed <= CONTENT_BOTTOM) return
  if (ctx.inTerms) {
    doc.font('Courier').fontSize(8.5).fillColor(TEXT).text(`(${ctx.title} Details on Next Page)`, M + 8, CONTENT_BOTTOM - 12, {
      width: CONTENT_W - 16,
      lineBreak: false,
    })
  }
  drawFooter(doc, ctx)
  doc.addPage()
  drawHeader(doc, ctx)
}

function sectionLabel(doc, label, x, y, width) {
  setType(doc, 'section').text(label, x, y, { width: width - 14 })
  drawCheckbox(doc, x + width - 10, y + 1, 8)
  doc.moveTo(x, y + 12).lineTo(x + width, y + 12).lineWidth(0.55).strokeColor(LINE).stroke()
}

function drawChargeRow(doc, label, amount, y) {
  setType(doc, 'body').text(label, M + 8, y, {
    width: 196,
    lineBreak: false,
  })
  drawCheckbox(doc, M + 210, y + 1, 7)
  doc.text(moneyPlain(amount), M + 222, y, { width: 94, align: 'right', lineBreak: false })
}

function drawChargesAndNotes(doc, ctx, lines, notes) {
  ensureSpace(doc, ctx, 72)
  const y0 = doc.y + 2
  const leftW = 318
  const rightX = M + leftW + 10
  const rightW = RIGHT - rightX - 6
  sectionLabel(doc, 'CHARGES', M + 8, y0, leftW - 10)
  sectionLabel(doc, 'DISPATCH NOTES', rightX, y0, rightW)

  let y = y0 + 16
  let total = 0
  const rows = lines.length ? lines : [{ description: 'LINE HAUL RATE', rate: 0, quantity: 1 }]
  rows.forEach((line) => {
    ensureSpace(doc, ctx, 14)
    if (doc.y > y) y = doc.y
    const amount = line.amount != null ? Number(line.amount) : lineTotal(line)
    total += Number.isFinite(amount) ? amount : 0
    const label = (blank(line.description || line.company) || 'LINE HAUL RATE').toUpperCase()
    drawChargeRow(doc, label, amount, y)
    y += 12
    doc.y = y
  })
  doc.rect(M + 176, y, 142, 16).lineWidth(0.8).strokeColor(LINE).stroke()
  setType(doc, 'section').text('TOTAL RATE', M + 180, y + 4, {
    width: 72,
    lineBreak: false,
  })
  setType(doc, 'header').text(moneyPlain(total), M + 248, y + 4, { width: 64, align: 'right', lineBreak: false })
  y += 22

  const noteY = y0 + 16
  setType(doc, 'bodyReg').text(notes || '', rightX, noteY, {
    width: rightW,
  })
  const notesBottom = noteY + Math.max(40, doc.heightOfString(notes || ' ', { width: rightW, fontSize: 8.5 }))
  doc.y = Math.max(y, notesBottom, y0 + 58)
  doc.moveTo(M, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.55).stroke()
  doc.y += 6
}

function stopKindLabel(stop, pickupIndex, dropIndex) {
  const type = String(stop.type || '').toLowerCase()
  if (type === 'pickup') return `PICK ${pickupIndex}`
  return `STOP ${dropIndex}`
}

function drawStops(doc, ctx) {
  const stops = loadStops(ctx.load)
  let pickupIndex = 0
  let dropIndex = 0
  stops.forEach((stop) => {
    const type = String(stop.type || '').toLowerCase()
    if (type === 'pickup') pickupIndex += 1
    else dropIndex += 1
    const label = stopKindLabel(stop, pickupIndex, dropIndex)
    ensureSpace(doc, ctx, 56)
    const y = doc.y
    doc.save()
    doc.lineWidth(0.6).strokeColor(LINE).rect(M, y, CONTENT_W, 50).stroke()
    doc.restore()
    doc.font('Courier-Bold').fontSize(10).fillColor(TEXT).text(label, M + 8, y + 4, { width: 90 })

    const name = ctx.blind
      ? cityStateZip(stop) || 'LOCATION WITHHELD'
      : blank(stop.location || stop.company) || '—'
    const street = ctx.blind ? '' : blank(stop.address)
    const city = ctx.blind ? '' : cityStateZip(stop)
    const appt = formatAppt(stop.scheduled || stop.appointment)
    const ref = blank(stop.reference || ctx.load.loadReference || ctx.load.reference)
    const contact = ctx.blind ? '' : [stop.contactName, stop.contactPhone].filter(Boolean).join(' ')

    setType(doc, 'stop').text(name.toUpperCase(), M + 8, y + 16, { width: 310 })
    setType(doc, 'body')
    if (street) doc.text(street.toUpperCase(), M + 8, y + 28, { width: 310 })
    if (city) doc.text(city.toUpperCase(), M + 8, y + 38, { width: 310 })
    if (appt) doc.text(`Appointment ${appt}`, 360, y + 16, { width: 220 })
    if (ref) doc.text(`Ref # ${ref}`, 360, y + 28, { width: 220 })
    if (contact) doc.text(`Phone/Contact: ${contact}`, 360, y + 38, { width: 220 })
    doc.y = y + 54
  })
}

function drawTerms(doc, ctx, lines) {
  ctx.inTerms = true
  lines.forEach((line, index) => {
    const emphasis = index === 0 || line.startsWith('***') || line.startsWith('******')
    setType(doc, emphasis ? 'termsBold' : 'terms')
    const height = doc.heightOfString(line, { width: CONTENT_W - 16 }) + 3
    ensureSpace(doc, ctx, height)
    doc.fillColor(TEXT).text(line, M + 8, doc.y, { width: CONTENT_W - 16 })
  })
  ctx.inTerms = false
}

function fillRateConSheet(doc, load, kind) {
  const ctx = {
    load,
    kind,
    title: documentTitle(kind),
    blind: kind === 'blind-bol',
    contentTop: 210,
  }
  drawHeader(doc, ctx)
  drawChargesAndNotes(doc, ctx, chargesForKind(kind, load), dispatchNotes(load, kind))
  drawStops(doc, ctx)
  doc.moveDown(0.2)
  drawTerms(doc, ctx, termsForKind(kind))
  drawFooter(doc, ctx)
}

export function buildLoadDocumentPdf(load, docMeta = {}) {
  const kind = documentKindFromDoc(docMeta)
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'LETTER',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      info: {
        Title: docMeta.name || documentTitle(kind),
        Author: COMPANY.legalName,
        Subject: `Load ${load.id || ''}`,
      },
    })
    const chunks = []
    pdf.on('data', (chunk) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    fillRateConSheet(pdf, load, kind)
    writePageNumbers(pdf)
    pdf.end()
  })
}
