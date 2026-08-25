import mongoose from 'mongoose'

const loadTemplateSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    templateName: { type: String, required: true },
    customer: { type: String, default: '' },
    picks: { type: Number, default: 0 },
    drops: { type: Number, default: 0 },
    branch: { type: String, default: 'Shared' },
    assignedUserId: { type: String, default: '', index: true },
    isShared: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: '', index: true },
  },
  { timestamps: true, strict: false },
)

const LoadTemplate =
  mongoose.models.LoadTemplate || mongoose.model('LoadTemplate', loadTemplateSchema)
export default LoadTemplate
