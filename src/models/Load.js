import mongoose from 'mongoose'

const loadSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    tab: { type: String, default: 'planning', index: true },
    loadStatus: { type: String, default: 'Pending', index: true },
    isDraft: { type: Boolean, default: true, index: true },
    customer: { type: String, default: '' },
    carrier: { type: String, default: '' },
    branch: { type: String, default: 'Shared' },
    isShared: { type: Boolean, default: false, index: true },
    departmentId: { type: String, default: '', index: true },
    createdBy: { type: String, default: '', index: true },
    updatedBy: { type: String, default: '' },
    postedAt: { type: Date, default: null },
    postedBy: { type: String, default: '' },
  },
  { timestamps: true, strict: false },
)

loadSchema.index({ departmentId: 1, loadStatus: 1 })
loadSchema.index({ isDraft: 1, tab: 1 })
loadSchema.index({ customer: 1 })
loadSchema.index({ carrier: 1 })
loadSchema.index({ createdAt: -1 })

const Load = mongoose.models.Load || mongoose.model('Load', loadSchema)
export default Load
