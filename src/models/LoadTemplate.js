import mongoose from 'mongoose'

const loadTemplateSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    templateName: { type: String, required: true },
    customer: { type: String, default: '' },
    picks: { type: Number, default: 1 },
    drops: { type: Number, default: 1 },
    branch: { type: String, default: 'Shared' },
  },
  { timestamps: true, strict: false },
)

const LoadTemplate =
  mongoose.models.LoadTemplate || mongoose.model('LoadTemplate', loadTemplateSchema)
export default LoadTemplate
