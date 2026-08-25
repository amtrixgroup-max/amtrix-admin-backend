export const MAX_TEMPLATE_LOAD_CREATION = 20

const RUNTIME_KEYS = [
  '_id',
  'id',
  'templateName',
  'createdAt',
  'updatedAt',
  '__v',
  'deletedAt',
  'postedAt',
  'postedBy',
  'isDraft',
  'errorMessage',
  'documents',
  'emailHistory',
  'documentRequests',
  'paperworkOk',
  'archived',
  'postedBoards',
  'cprStatus',
  'cprRequestId',
  'cprRequestedAt',
  'cprApprovedAt',
  'cprReviewedAt',
  'cprReviewedByName',
  'lastContact',
]

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function uniquePart() {
  return Math.random().toString(36).slice(2, 8)
}

export function parseTemplateUseQuantity(raw) {
  if (raw === '' || raw == null) {
    return { error: 'Enter how many loads you want to create.', code: 'QUANTITY_REQUIRED' }
  }
  const asNumber = Number(raw)
  if (!Number.isFinite(asNumber) || String(raw).includes('.') || !Number.isInteger(asNumber)) {
    return { error: 'Enter a whole number of loads.', code: 'QUANTITY_INVALID' }
  }
  if (asNumber < 1) {
    return { error: 'Enter a whole number of at least 1.', code: 'QUANTITY_MIN' }
  }
  if (asNumber > MAX_TEMPLATE_LOAD_CREATION) {
    return {
      error: `You can create a maximum of ${MAX_TEMPLATE_LOAD_CREATION} loads at a time.`,
      code: 'QUANTITY_MAX',
    }
  }
  return { quantity: asNumber }
}

export function uniqueLoadId(index = 0) {
  return `LD-${Date.now()}-${index}-${uniquePart()}`
}

export function mapTemplateToLoad(template, { user, loadId, index = 0 } = {}) {
  const source = template && typeof template.toObject === 'function' ? template.toObject() : { ...(template || {}) }
  const rest = { ...source }
  RUNTIME_KEYS.forEach((key) => {
    delete rest[key]
  })

  const cloned = cloneJson(rest) || {}
  if (Array.isArray(cloned.stops)) {
    cloned.stops = cloned.stops.map((stop, stopIndex) => ({
      ...stop,
      id: `stop-${Date.now()}-${index}-${stopIndex}-${uniquePart()}`,
      actual: '',
    }))
  }
  if (Array.isArray(cloned.incomeLines)) {
    cloned.incomeLines = cloned.incomeLines.map((line, lineIndex) => ({
      ...line,
      id: `line-${Date.now()}-${index}-in-${lineIndex}-${uniquePart()}`,
    }))
  }
  if (Array.isArray(cloned.expenseLines)) {
    cloned.expenseLines = cloned.expenseLines.map((line, lineIndex) => ({
      ...line,
      id: `line-${Date.now()}-${index}-ex-${lineIndex}-${uniquePart()}`,
    }))
  }

  const shared = cloned.isShared === true || String(cloned.branch || '').toLowerCase() === 'shared'
  const userId = user?._id ? String(user._id) : ''

  return {
    ...cloned,
    id: loadId || uniqueLoadId(index),
    tab: 'planning',
    loadStatus: 'Pending',
    isDraft: false,
    postedAt: null,
    postedBy: '',
    errorMessage: '',
    paperworkOk: false,
    archived: false,
    postedBoards: [],
    documents: [],
    emailHistory: [],
    documentRequests: [],
    cprStatus: 'NONE',
    cprRequestId: null,
    lastContact: '',
    isShared: shared,
    branch: shared ? 'Shared' : cloned.branch || '',
    assignedUserId: shared ? '' : cloned.assignedUserId || userId,
    sourceTemplateId: source.id || '',
    sourceTemplateName: source.templateName || '',
  }
}
