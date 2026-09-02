import mongoose from 'mongoose'

const customerSchema = new mongoose.Schema({
  id: mongoose.Schema.Types.Mixed,
  name: String,
  usdotNumber: String,
  mcNumber: String,
  availableCredit: mongoose.Schema.Types.Mixed,
  address: String,
  contact: String,
  phone: String,
  email: String,
  city: String,
  state: String,
  branch: String,
  assignedUserId: { type: String, default: '', index: true },
  assignedUserName: { type: String, default: '' },
  assignedUserEmail: { type: String, default: '' },
  createdBy: { type: String, default: '', index: true },
  billingAddress: String,
  telephone: String,
  extension: String,
  creditHold: Boolean,
  creditLimit: String,
  paymentTerms: String,
  loads: Number,
  revenue: Number,
  status: String,
  dunsNumber: String,
  agentName: String,
  agentEmail: String,
  loadApprovedByCustomer: String,
  paymentMode: { type: String, default: '', index: true },
  departmentId: mongoose.Schema.Types.ObjectId,
  approvalRequestId: mongoose.Schema.Types.ObjectId,
  approvalStatus: String,
  contacts: [mongoose.Schema.Types.Mixed],
  privateNotes: String,
  publicNotes: String
})

customerSchema.index({ name: 1 })
customerSchema.index({ departmentId: 1, approvalStatus: 1 })
customerSchema.index({ mcNumber: 1 })

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema)
export default Customer
