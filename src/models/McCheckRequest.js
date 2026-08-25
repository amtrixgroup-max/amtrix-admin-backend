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
    temperature: { type: String, default: '', trim: true },
    lowerTemp: { type: String, default: '', trim: true },
    upperTemp: { type: String, default: '', trim: true },
    tempTolerance: { type: String, default: '', trim: true },

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
        'CARRIER_ADDED',
        'BLOCKED'
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
    reviewedByEmail: { type: String, default: '' },
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
    exceptionReviewedByEmail: { type: String, default: '' },
    exceptionReviewedAt: { type: Date, default: null },

    addCarrierRequestedAt: { type: Date, default: null },
    addCarrierRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    lastPendingNotifiedAt: { type: Date, default: null },
    previousStatus: { type: String, default: '' },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    revokedByName: { type: String, default: '' },
    revokedByEmail: { type: String, default: '' },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: '' },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    blockedByName: { type: String, default: '' },
    blockedByEmail: { type: String, default: '' },
    blockedAt: { type: Date, default: null },
    blockReason: { type: String, default: '' },

    invitation: {
      carrierName: { type: String, default: '' },
      clientInsuredNumber: { type: String, default: '' },
      carrierContact: { type: String, default: '' },
      carrierEmail: { type: String, default: '' },
      requesterName: { type: String, default: '' },
      requesterEmail: { type: String, default: '' },
      createdAt: { type: Date, default: null }
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
      searchedByName: { type: String, default: '' },
      searchedByEmail: { type: String, default: '' },
      preview: { type: mongoose.Schema.Types.Mixed, default: null }
    }
  },
  { timestamps: true }
)

mcCheckRequestSchema.index({ requesterId: 1, createdAt: -1 })
mcCheckRequestSchema.index({ departmentId: 1, status: 1, createdAt: -1 })
mcCheckRequestSchema.index({ mcNo: 1 })
mcCheckRequestSchema.index({ status: 1, createdAt: -1 })

const McCheckRequest =
  mongoose.models.McCheckRequest || mongoose.model('McCheckRequest', mcCheckRequestSchema)

export default McCheckRequest
