import mongoose from 'mongoose'

const locationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '', index: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' },
    country: { type: String, default: 'US' },
    telephone: { type: String, default: '' },
    phoneExt: { type: String, default: '' },
    locationClass: { type: String, default: 'None' },
    requirements: {
      liftgate: { type: Boolean, default: false },
      appointment: { type: Boolean, default: false },
      inside: { type: Boolean, default: false },
      callBefore: { type: Boolean, default: false },
    },
    contactName: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactExt: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactFax: { type: String, default: '' },
    privateNotes: { type: String, default: '' },
    publicNotes: { type: String, default: '' },
    departmentId: { type: String, default: '', index: true },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, strict: false },
)

locationSchema.index({ name: 'text', address: 'text', city: 'text' })

const Location = mongoose.models.Location || mongoose.model('Location', locationSchema)
export default Location
