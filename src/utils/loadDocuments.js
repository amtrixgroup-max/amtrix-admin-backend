export const DEFAULT_LOAD_DOCUMENTS = [
  {
    key: 'bol',
    name: 'Bill of Lading with Stop Signatures',
    documentTypes: ['BOL'],
    description:
      'Bill of lading with customer information, stops, and signature lines at each stop plus the driver.',
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
    name: 'Load Confirmation',
    documentTypes: ['Load Confirmation'],
    description: 'Carrier load confirmation with equipment, carrier details, pay items, stops, and terms.',
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
    next.name = 'Load Confirmation'
    next.documentTypes = ['Load Confirmation']
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
    next.name = 'Load Confirmation'
    next.documentTypes = ['Load Confirmation']
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
