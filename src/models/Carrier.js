import mongoose from 'mongoose'

const carrierSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    mcNumber: { type: String, default: '' },
    mcPrefix: { type: String, default: 'MC' },
    usdotNumber: { type: String, default: '' },
    phone: { type: String, default: '' },
    telephone: { type: String, default: '' },
    email: { type: String, default: '' },
    contact: { type: String, default: '' },
    doNotLoad: { type: Boolean, default: false },
    departmentId: mongoose.Schema.Types.Mixed,
    mcCheckRequestId: mongoose.Schema.Types.Mixed,
    documents: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, default: 'ACTIVE' },
  },
  { timestamps: true, strict: false },
)

carrierSchema.index({ mcNumber: 1 })
carrierSchema.index({ name: 1 })
carrierSchema.index({ departmentId: 1, createdAt: -1 })

const Carrier = mongoose.models.Carrier || mongoose.model('Carrier', carrierSchema)
export default Carrier
