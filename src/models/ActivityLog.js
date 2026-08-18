import mongoose from 'mongoose'

const activityLogSchema = new mongoose.Schema(
  {
    id: Number,
    action: { type: String, required: true },
    description: { type: String, default: '' },
    user: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    type: { type: String, default: 'info' },
    module: { type: String, default: 'System' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }
  },
  { timestamps: true }
)

activityLogSchema.index({ timestamp: -1 })
activityLogSchema.index({ userId: 1, timestamp: -1 })

const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema)
export default ActivityLog
