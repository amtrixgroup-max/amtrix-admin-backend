import mongoose from 'mongoose'

const loadTemplateSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    templateName: { type: String, default: '' },
    customer: { type: String, default: '' },
    picks: { type: Number, default: 0 },
    drops: { type: Number, default: 0 },
    branch: { type: String, default: 'Shared' },
    assignedUserId: { type: String, default: '', index: true },
    isShared: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: '', index: true },
    updatedBy: { type: String, default: '' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: false },
)

loadTemplateSchema.index({ deletedAt: 1, createdAt: -1 })
loadTemplateSchema.index({ templateName: 1 })
loadTemplateSchema.index({ customer: 1 })
loadTemplateSchema.index({ branch: 1, isShared: 1 })

const LoadTemplate =
  mongoose.models.LoadTemplate || mongoose.model('LoadTemplate', loadTemplateSchema)
export default LoadTemplate
