export const DEFAULT_LOAD_DOCUMENTS = [
  {
    key: 'bol',
    name: 'Bill of Lading',
    documentTypes: ['BOL'],
    description:
      'The BOL for this load. Includes pickup, delivery, commodity, and signature areas for consignor, consignee, and driver.',
  },
  {
    key: 'load-confirmation',
    name: 'Load Confirmation',
    documentTypes: ['Load Confirmation'],
    description: 'Customer-facing confirmation with stops, equipment, and rate details.',
  },
  {
    key: 'rate-confirmation',
    name: 'Carrier Rate Confirmation',
    documentTypes: ['Rate Confirmation'],
    description: 'Carrier rate confirmation used when posting or dispatching this load.',
  },
]

export function defaultLoadDocuments(loadId) {
  const uploadedAt = new Date().toISOString()
  return DEFAULT_LOAD_DOCUMENTS.map((item) => ({
    id: `DOC-${item.key}-${loadId}`,
    name: item.name,
    documentTypes: item.documentTypes,
    description: item.description,
    source: 'System Generated',
    defaulted: true,
    companyDocument: true,
    status: 'Generated',
    attachedTo: loadId,
    storedName: '',
    originalName: '',
    mimeType: 'text/html',
    uploadedAt,
    uploadedBy: 'System',
  }))
}

export function ensureLoadDocuments(load) {
  const existing = Array.isArray(load.documents) ? load.documents : []
  if (existing.length) return existing
  const seeded = defaultLoadDocuments(load.id)
  load.documents = seeded
  return seeded
}
