import express from 'express'
import { authenticate } from '../middleware/auth.js'
import ActivityLog from '../models/ActivityLog.js'
import {
  canViewAllActivityLogs,
  findUsersByActorRoles,
  parseActorRoles,
  serializeActivity,
  serializeActor,
} from '../utils/activityLog.js'
import {
  andFilter,
  listResponse,
  paginateFind,
  parseListQuery,
  textSearch,
} from '../utils/listQuery.js'
import { resolveDepartmentScopeFilter } from '../utils/mcCheckAccess.js'

const router = express.Router()
router.use(authenticate)

const genuineFilter = { userId: { $exists: true, $ne: null } }

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''))

router.get('/actors', async (req, res, next) => {
  try {
    const seeAll = await canViewAllActivityLogs(req.user)
    if (!seeAll) {
      return res.status(403).json({ success: false, message: 'Not authorized to list activity actors' })
    }
    const roles = parseActorRoles(req.query.role)
    const users = await findUsersByActorRoles(roles, req.user)
    res.json({ success: true, data: users.map(serializeActor).filter(Boolean) })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const seeAll = await canViewAllActivityLogs(req.user)
    const filter = { ...genuineFilter }
    Object.assign(filter, await resolveDepartmentScopeFilter(req.user, req.query))

    if (seeAll) {
      const actorRoles = parseActorRoles(req.query.role || req.query.roles)
      const requestedUserId = isMongoId(req.query.userId) ? String(req.query.userId) : ''
      if (actorRoles.length) {
        const actors = await findUsersByActorRoles(actorRoles, req.user)
        const allowedIds = actors.map((user) => String(user._id))
        if (requestedUserId) {
          filter.userId = allowedIds.includes(requestedUserId) ? requestedUserId : { $in: [] }
        } else {
          filter.userId = { $in: actors.map((user) => user._id) }
        }
      } else if (requestedUserId) {
        filter.userId = requestedUserId
      }
    }

    const list = parseListQuery(req.query, { defaultLimit: seeAll ? 50 : 6, maxLimit: seeAll ? 100 : 6 })
    const queryFilter = andFilter(
      filter,
      textSearch(['action', 'description', 'user', 'userEmail', 'module', 'type'], list.search),
    )
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
