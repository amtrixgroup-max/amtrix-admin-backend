import mongoose from 'mongoose'
import { isSuperAdminUser } from './mcCheckAccess.js'

export function valuesFor(value) {
  if (value == null || value === '') return []
  const str = String(value)
  const values = [str]
  if (mongoose.isValidObjectId(str) && str.length === 24) {
    values.push(new mongoose.Types.ObjectId(str))
  }
  return values
}

export function userScopeFilter(user) {
  if (isSuperAdminUser(user)) return {}
  const userIds = valuesFor(user?._id)
  const departmentIds = valuesFor(user?.departmentId)
  const or = [
    { createdBy: { $in: userIds } },
    { assignedUserId: { $in: userIds } },
    { isShared: true },
    {
      $and: [
        { branch: /^shared$/i },
        {
          $or: [
            { assignedUserId: { $exists: false } },
            { assignedUserId: '' },
            { assignedUserId: null },
          ],
        },
      ],
    },
    { createdBy: { $exists: false } },
    { createdBy: '' },
    { createdBy: null },
  ]
  if (departmentIds.length) or.push({ departmentId: { $in: departmentIds } })
  return { $or: or }
}
