import mongoose from 'mongoose'

const brokerTargetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
    },
    monthlyTarget: {
      type: Number,
      default: null,
    },
    yearlyTarget: {
      type: Number,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
)

brokerTargetSchema.index({ userId: 1, year: 1 }, { unique: true })

const BrokerTarget = mongoose.models.BrokerTarget || mongoose.model('BrokerTarget', brokerTargetSchema)

export default BrokerTarget
