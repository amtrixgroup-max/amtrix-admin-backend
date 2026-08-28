import mongoose from 'mongoose'

const customCardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    value: { type: Number, default: 0 },
    format: {
      type: String,
      enum: ['number', 'currency', 'percent'],
      default: 'number',
    },
    trend: { type: Number, default: null },
    trendLabel: { type: String, default: 'vs last month' },
    icon: { type: String, default: 'Target' },
  },
  { _id: true },
)

const dashboardConfigSchema = new mongoose.Schema(
  {
    workspace: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
    },
    monthlyTarget: { type: Number, default: null },
    quarterlyTarget: { type: Number, default: null },
    yearlyTarget: { type: Number, default: null },
    customCards: { type: [customCardSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

const DashboardConfig =
  mongoose.models.DashboardConfig || mongoose.model('DashboardConfig', dashboardConfigSchema)

export default DashboardConfig
