export const DEFAULT_LOAD_DOCUMENTS = [
  {
    key: 'bol',
    name: 'Bill of Lading with Stop Signatures',
    documentTypes: ['BOL'],
    description:
      'Bill of lading with customer information, stops, and signature lines at each stop plus the driver.',
  },
  {
    key: 'bill-of-lading',
    name: 'Bill of Lading',
    documentTypes: ['BOL'],
    description: 'Standard bill of lading with shipper, consignee, and carrier details.',
  },
  {
    key: 'blind-bol',
    name: 'Blind Bill of Lading',
    documentTypes: ['BOL'],
    description:
      'Blind bill of lading without customer information. Includes shipper, driver, and consignee signature areas.',
  },
  {
    key: 'load-confirmation',
    name: 'Carrier Rate Confirmation',
    documentTypes: ['Carrier Rate Confirmation'],
    description: 'Carrier rate confirmation with equipment, carrier details, pay items, stops, and terms.',
  },
  {
    key: 'rate-confirmation',
    name: 'Rate Confirmation',
    documentTypes: ['Rate Confirmation'],
    description: 'Customer rate confirmation with billing charges, customer information, and stops.',
  },
  {
    key: 'invoice',
    name: 'Invoice',
    documentTypes: ['Invoice'],
    description: 'Customer invoice with pay items, stops, payment terms, and notice of assignment.',
  },
]

const LEGACY_KEYS = {
  'load-confirmation': 'load-confirmation',
  'customer-confirmation': 'rate-confirmation',
}

export function defaultLoadDocuments(loadId) {
  const uploadedAt = new Date().toISOString()
  return DEFAULT_LOAD_DOCUMENTS.map((item) => ({
    id: `DOC-${item.key}-${loadId}`,
    key: item.key,
    name: item.name,
    documentTypes: item.documentTypes,
    description: item.description,
    source: 'System Generated',
    defaulted: true,
    companyDocument: true,
    status: 'Generated',
    attachedTo: loadId,
    storedName: '',
    originalName: `${item.name}.pdf`,
    mimeType: 'application/pdf',
    uploadedAt,
    uploadedBy: 'System',
  }))
}

function normalizedKey(doc = {}) {
  const id = String(doc.id || '')
  const match = id.match(/^DOC-([a-z0-9-]+)-/i)
  const fromId = match ? match[1].toLowerCase() : ''
  const key = String(doc.key || fromId || '').toLowerCase()
  return LEGACY_KEYS[key] || key
}

function migrateDocument(doc = {}) {
  const current = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const next = { ...current }
  const generated = Boolean(next.defaulted || next.source === 'System Generated')
  if (!generated) return next

  const name = String(current.name || '').toLowerCase()
  const key = normalizedKey(current)

  if (key === 'rate-confirmation' && (name.includes('carrier') || name.includes('load confirmation'))) {
    next.key = 'load-confirmation'
    next.name = 'Carrier Rate Confirmation'
    next.documentTypes = ['Carrier Rate Confirmation']
  } else if (key === 'customer-confirmation' || name === 'customer confirmation') {
    next.key = 'rate-confirmation'
    next.name = 'Rate Confirmation'
    next.documentTypes = ['Rate Confirmation']
  } else if (key === 'bol' && !name.includes('blind')) {
    next.key = 'bol'
    next.name = 'Bill of Lading with Stop Signatures'
    next.documentTypes = ['BOL']
  } else if (key === 'invoice') {
    next.name = 'Invoice'
    next.documentTypes = ['Invoice']
  } else if (key === 'load-confirmation') {
    next.name = 'Carrier Rate Confirmation'
    next.documentTypes = ['Carrier Rate Confirmation']
  } else if (key === 'rate-confirmation') {
    next.name = 'Rate Confirmation'
    next.documentTypes = ['Rate Confirmation']
  }

  next.mimeType = next.storedName ? next.mimeType : 'application/pdf'
  next.originalName = next.originalName || `${next.name || 'document'}.pdf`
  next.status = next.status || 'Generated'
  return next
}

export function ensureLoadDocuments(load) {
  const existing = Array.isArray(load.documents) ? load.documents.map(migrateDocument) : []
  const seeded = defaultLoadDocuments(load.id)
  const seen = new Set(existing.map((doc) => normalizedKey(doc)).filter(Boolean))
  let changed = existing.length !== (load.documents || []).length

  existing.forEach((doc, index) => {
    const original = load.documents?.[index]
    if (
      original &&
      (original.key !== doc.key || original.name !== doc.name || original.documentTypes?.[0] !== doc.documentTypes?.[0])
    ) {
      changed = true
    }
  })

  seeded.forEach((template) => {
    if (seen.has(template.key)) return
    const legacyId = `DOC-load-confirmation-${load.id}`
    const legacyCustomerId = `DOC-customer-confirmation-${load.id}`
    if (template.key === 'rate-confirmation') {
      const legacy = existing.find(
        (doc) =>
          String(doc.id) === legacyCustomerId ||
          String(doc.id) === legacyId ||
          String(doc.name || '').toLowerCase() === 'customer confirmation',
      )
      if (legacy) {
        seen.add('rate-confirmation')
        return
      }
    }
    if (template.key === 'load-confirmation') {
      const legacy = existing.find((doc) =>
        String(doc.name || '').toLowerCase().includes('carrier rate'),
      )
      if (legacy) {
        seen.add('load-confirmation')
        return
      }
    }
    existing.push(template)
    seen.add(template.key)
    changed = true
  })

  load.documents = existing
  if (changed) load.markModified?.('documents')
  return existing
}

export const ACCOUNTING_REQUIRED_DOCUMENTS = [
  {
    key: 'client-rate-confirmation',
    label: 'Rate Confirmation',
    type: 'Rate Confirmation',
    hint: 'Same as client rate confirmation. The generated Rate Confirmation on this load counts; you can also upload a signed copy. PNG/JPG files are saved as PDF.',
  },
  {
    key: 'pod',
    label: 'POD (Proof of Delivery)',
    type: 'POD',
    hint: 'Upload the proof of delivery screenshot or scan. PNG/JPG files are saved as PDF.',
  },
  {
    key: 'bol',
    label: 'BOL (Bill of Lading)',
    type: 'BOL',
    hint: 'Upload the signed bill of lading. PNG/JPG files are saved as PDF.',
  },
]

function docSearchText(doc = {}) {
  return `${doc.key || ''} ${doc.name || ''} ${(doc.documentTypes || []).join(' ')}`.toLowerCase()
}

export function isUploadedLoadDocument(doc = {}) {
  if (String(doc.source || '').toLowerCase() === 'uploaded') return Boolean(doc.storedName)
  if (doc.defaulted && !doc.storedName) return false
  if (String(doc.source || '').toLowerCase() === 'system generated') return Boolean(doc.storedName)
  return Boolean(doc.storedName)
}

function isCarrierRateConfirmationDoc(doc = {}) {
  const key = String(doc.key || '').toLowerCase()
  const text = docSearchText(doc)
  return key === 'load-confirmation' || text.includes('carrier rate') || text.includes('load confirmation')
}

function matchesRequiredDocument(doc, key) {
  if (String(doc.key || '').toLowerCase() === String(key || '').toLowerCase()) return true
  const text = docSearchText(doc)
  if (key === 'client-rate-confirmation') {
    if (isCarrierRateConfirmationDoc(doc)) return false
    const docKey = String(doc.key || '').toLowerCase()
    if (docKey === 'rate-confirmation' || docKey === 'client-rate-confirmation') return true
    return text.includes('client rate') || text.includes('rate confirmation')
  }
  if (key === 'pod') {
    return /\bpod\b/.test(text) || text.includes('proof of delivery')
  }
  if (key === 'bol') {
    if (String(doc.key || '').toLowerCase() === 'bol' && doc.defaulted && !doc.storedName) return false
    if (String(doc.key || '').toLowerCase() === 'blind-bol' && doc.defaulted && !doc.storedName) return false
    return /\bbol\b/.test(text) || text.includes('bill of lading') || text.includes('bill of landing')
  }
  return false
}

export function accountingDocumentsStatus(documents = []) {
  return ACCOUNTING_REQUIRED_DOCUMENTS.map((item) => ({
    key: item.key,
    label: item.label,
    type: item.type,
    hint: item.hint,
    uploaded: (documents || []).some((doc) => {
      if (!matchesRequiredDocument(doc, item.key)) return false
      if (item.key === 'client-rate-confirmation') return true
      return isUploadedLoadDocument(doc)
    }),
  }))
}

export function missingAccountingDocumentLabels(documents = []) {
  return accountingDocumentsStatus(documents)
    .filter((item) => !item.uploaded)
    .map((item) => item.label)
}

export function accountingDocumentsMessage(documents = []) {
  const missing = missingAccountingDocumentLabels(documents)
  if (!missing.length) return null
  return `Upload these documents before sending this load to accounting: ${missing.join(', ')}.`
}

export function invoiceShipperDocumentsMessage(documents = []) {
  const missing = missingAccountingDocumentLabels(documents)
  if (!missing.length) return null
  return `Upload these shipper documents before sending this invoice: ${missing.join(', ')}.`
}

export function uploadedDocumentForRequirement(documents = [], key) {
  return (documents || []).filter(isUploadedLoadDocument).find((doc) => matchesRequiredDocument(doc, key)) || null
}

export function requiredDocumentKeyFromUpload(types = [], name = '') {
  const haystack = `${(Array.isArray(types) ? types.join(' ') : types) || ''} ${name || ''}`.toLowerCase()
  if (
    (haystack.includes('client rate') || haystack.includes('rate confirmation')) &&
    !haystack.includes('carrier') &&
    !haystack.includes('load confirmation')
  ) {
    return 'client-rate-confirmation'
  }
  const match = ACCOUNTING_REQUIRED_DOCUMENTS.find((item) => {
    if (item.key === 'client-rate-confirmation') return false
    return (
      haystack.includes(String(item.type).toLowerCase()) ||
      haystack.includes(String(item.label).toLowerCase()) ||
      haystack.includes(String(item.key).replace(/-/g, ' '))
    )
  })
  return match?.key || ''
}
