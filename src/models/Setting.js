import mongoose from 'mongoose'

const settingSchema = new mongoose.Schema({
  companyName: String,
  supportEmail: String,
  timezone: String,
  currency: String,
  notifications: { type: mongoose.Schema.Types.Mixed, default: {} },
  features: { type: mongoose.Schema.Types.Mixed, default: {} }
})

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema)
export default Setting
