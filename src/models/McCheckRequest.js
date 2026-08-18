import mongoose from 'mongoose'

const mcCheckRequestSchema = new mongoose.Schema(
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

    mcNo: { type: String, default: '', trim: true },
    docketType: { type: String, default: 'MC', trim: true },
    dotNo: { type: String, default: '', trim: true },
    equipmentType: { type: String, default: '', trim: true },

    status: {
      type: String,
      enum: [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'EXCEPTION_PENDING',
        'EXCEPTION_APPROVED',
        'EXCEPTION_REJECTED',
        'ADD_CARRIER_REQUESTED',
        'CARRIER_ADDED'
      ],
      default: 'PENDING'
    },

    reviewNotes: { type: String, default: '' },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },

    exceptionReason: { type: String, default: '' },
    exceptionRequestedAt: { type: Date, default: null },
    exceptionRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    exceptionReviewNotes: { type: String, default: '' },
    exceptionReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    exceptionReviewedByName: { type: String, default: '' },
    exceptionReviewedAt: { type: Date, default: null },

    addCarrierRequestedAt: { type: Date, default: null },
    addCarrierRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    dotGate: {
      docketType: { type: String, default: '' },
      docketNumber: { type: String, default: '' },
      usDotNumber: { type: String, default: '' },
      intrastateState: { type: String, default: '' },
      intrastateNumber: { type: String, default: '' },
      searchedAt: { type: Date, default: null },
      searchedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      searchedByName: { type: String, default: '' }
    }
  },
  { timestamps: true }
)

mcCheckRequestSchema.index({ requesterId: 1, createdAt: -1 })
mcCheckRequestSchema.index({ departmentId: 1, status: 1, createdAt: -1 })

const McCheckRequest =
  mongoose.models.McCheckRequest || mongoose.model('McCheckRequest', mcCheckRequestSchema)

export default McCheckRequest
