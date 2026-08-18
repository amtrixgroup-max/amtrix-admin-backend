import mongoose from 'mongoose'

const customerApprovalRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    requesterName: { type: String, default: '' },
    requesterEmail: { type: String, default: '' },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true
    },
    departmentCode: { type: String, default: '' },
    departmentName: { type: String, default: '' },

    agentName: { type: String, required: true, trim: true },
    agentEmail: { type: String, required: true, trim: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },
    contactPersonName: { type: String, required: true, trim: true },
    dunsNumber: { type: String, required: true, trim: true },
    loadApprovedByCustomer: {
      type: String,
      required: true,
      enum: ['Yes', 'No']
    },
    contactPersonNumber: { type: String, required: true, trim: true },
    contactPersonEmail: { type: String, required: true, trim: true, lowercase: true },
    requiredLimit: { type: Number, required: true },
    address: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'RESPONDED', 'PREPAID'],
      default: 'PENDING'
    },
    paymentMode: { type: String, default: '' },
    reviewNotes: { type: String, default: '' },
    approvedCredit: { type: Number, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedByName: { type: String, default: '' },
    reviewedByEmail: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    customerId: { type: mongoose.Schema.Types.Mixed, default: null },

    prepaidCreditRequired: { type: Number, default: null },
    prepaidNotes: { type: String, default: '' },
    prepaidRequestedAt: { type: Date, default: null },
    prepaidRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    prepaidRequestedByName: { type: String, default: '' },
    prepaidRequestedByEmail: { type: String, default: '' },
    prepaidDocuments: [
      {
        originalName: String,
        storedName: String,
        mimeType: String,
        size: Number,
        uploadedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
)

const CustomerApprovalRequest =
  mongoose.models.CustomerApprovalRequest ||
  mongoose.model('CustomerApprovalRequest', customerApprovalRequestSchema)

export default CustomerApprovalRequest
