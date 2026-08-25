import express from 'express'
import { authenticate } from '../middleware/auth.js'
import ActivityLog from '../models/ActivityLog.js'
import { canViewAllActivityLogs, serializeActivity } from '../utils/activityLog.js'
import {
  andFilter,
  listResponse,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'

const router = express.Router()
router.use(authenticate)

const genuineFilter = { userId: { $exists: true, $ne: null } }

const isGlobalAdmin = (user) =>
  user?.systemRole === 'SUPER_ADMIN' ||
  user?.role === 'SUPER_ADMIN' ||
  user?.systemRole === 'ADMIN'

router.get('/', async (req, res, next) => {
  try {
    const seeAll = await canViewAllActivityLogs(req.user)
    const filter = { ...genuineFilter }

    if (!isGlobalAdmin(req.user) && req.user?.departmentId) {
      filter.departmentId = req.user.departmentId
    }

    const list = parseListQuery(req.query, { defaultLimit: seeAll ? 50 : 6, maxLimit: seeAll ? 100 : 6 })
    const queryFilter = andFilter(filter, textSearch(['action', 'description', 'user', 'module', 'type'], list.search))
    const capped = list.paginate ? list : { ...list, paginate: true, page: 1, limit: seeAll ? 500 : 6, skip: 0 }
    const { items, total } = await paginateFind(ActivityLog, queryFilter, {
      ...capped,
      sort: { timestamp: -1 },
      lean: true,
    })

    res.json({
      ...listResponse(items.map(serializeActivity), { ...capped, total }),
      limited: !seeAll,
    })
  } catch (error) {
    next(error)
  }
})

export default router
