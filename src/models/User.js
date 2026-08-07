import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  id: Number,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  avatar: String,
  department: String,
  status: { type: String, default: 'Active' },
  createdAt: { type: Date, default: () => new Date() }
})

userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  return obj
}

const User = mongoose.models.User || mongoose.model('User', userSchema)
export default User
