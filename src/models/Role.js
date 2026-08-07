import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  description: String
})

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema)
export default Role
