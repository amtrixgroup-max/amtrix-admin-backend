import mongoose from 'mongoose'

const activityLogSchema = new mongoose.Schema({
  id: Number,
  action: String,
  description: String,
  user: String,
  timestamp: Date,
  type: String
})

const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema)
export default ActivityLog
