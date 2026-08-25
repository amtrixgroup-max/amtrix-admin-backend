export function parseListQuery(query = {}, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const paginate = query.page != null || query.limit != null
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit))
  const search = String(query.search || query.q || '').trim()
  const sort = String(query.sort || '-createdAt')
  return {
    paginate,
    page,
    limit,
    skip: (page - 1) * limit,
    search,
    sort,
  }
}

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function textSearch(fields, search) {
  if (!search || !fields?.length) return {}
  const regex = new RegExp(escapeRegex(search), 'i')
  return { $or: fields.map((field) => ({ [field]: regex })) }
}

export function andFilter(...filters) {
  const parts = filters.filter((item) => item && typeof item === 'object' && Object.keys(item).length)
  if (!parts.length) return {}
  if (parts.length === 1) return parts[0]
  return { $and: parts }
}

export function statusInFilter(raw) {
  const values = String(raw || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
  if (!values.length) return {}
  if (values.length === 1) return { status: values[0] }
  return { status: { $in: values } }
}

export function mongoSort(sort) {
  const value = String(sort || '-createdAt')
  const desc = value.startsWith('-')
  const field = desc ? value.slice(1) : value
  return { [field || 'createdAt']: desc ? -1 : 1 }
}

export function listResponse(items, meta = {}) {
  const { paginate, page = 1, limit = items.length || 50, total = items.length } = meta
  if (!paginate) {
    return { success: true, data: items }
  }
  return {
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil((total || 0) / Math.max(limit, 1))),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  }
}

export async function paginateFind(Model, filter, options = {}) {
  const {
    paginate,
    limit,
    skip,
    sort = { createdAt: -1 },
    select,
    populate,
    lean = false,
    unpaginatedLimit,
  } = options

  const apply = (query) => {
    let next = query.sort(sort)
    if (select) next = next.select(select)
    if (populate) {
      const list = Array.isArray(populate) ? populate : [populate]
      for (const item of list) next = next.populate(item)
    }
    if (lean) next = next.lean()
    return next
  }

  if (!paginate) {
    let query = apply(Model.find(filter))
    if (unpaginatedLimit) query = query.limit(unpaginatedLimit)
    const items = await query
    return { items, total: items.length }
  }

  const [total, items] = await Promise.all([
    Model.countDocuments(filter),
    apply(Model.find(filter)).skip(skip).limit(limit),
  ])
  return { items, total }
}
