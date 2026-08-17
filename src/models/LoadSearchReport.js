import mongoose from 'mongoose'

const loadSearchReportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    criteria: { type: Object, default: {} },
  },
  { timestamps: true },
)

const LoadSearchReport =
  mongoose.models.LoadSearchReport || mongoose.model('LoadSearchReport', loadSearchReportSchema)

export default LoadSearchReport
