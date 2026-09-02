import mongoose from 'mongoose'

const cprRequestSchema = new mongoose.Schema(
  {
    loadId: { type: String, required: true, index: true },
    loadMongoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', default: null },
    customer: { type: String, default: '' },
    carrier: { type: String, default: '' },
    documentNames: { type: [String], default: [] },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },

    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requesterName: { type: String, default: '' },
    requesterEmail: { type: String, default: '' },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    departmentCode: { type: String, default: '' },
    departmentName: { type: String, default: '' },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    notes: { type: String, default: '' },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedByName: { type: String, default: '' },
    reviewedByEmail: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: '' },
  },
  { timestamps: true },
)

cprRequestSchema.index({ departmentId: 1, status: 1, createdAt: 1 })
cprRequestSchema.index({ requesterId: 1, createdAt: -1 })
cprRequestSchema.index({ loadId: 1, status: 1 })

const CprRequest = mongoose.models.CprRequest || mongoose.model('CprRequest', cprRequestSchema)

export default CprRequest
