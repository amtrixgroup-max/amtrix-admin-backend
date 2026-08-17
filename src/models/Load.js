import mongoose from 'mongoose'

const loadSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    tab: { type: String, default: 'planning' },
    loadStatus: { type: String, default: 'New' },
    customer: { type: String, default: '' },
    carrier: { type: String, default: '' },
    branch: { type: String, default: 'Shared' },
  },
  { timestamps: true, strict: false },
)

const Load = mongoose.models.Load || mongoose.model('Load', loadSchema)
export default Load
