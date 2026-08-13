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
  departmentId: mongoose.Schema.Types.ObjectId,
  approvalRequestId: mongoose.Schema.Types.ObjectId,
  contacts: [mongoose.Schema.Types.Mixed],
  privateNotes: String,
  publicNotes: String
})

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema)
export default Customer
