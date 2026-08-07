import mongoose from 'mongoose'

const careerSchema = new mongoose.Schema({
  id: mongoose.Schema.Types.Mixed,
  title: String,
  department: String,
  type: String,
  location: String,
  description: String
})

const Career = mongoose.models.Career || mongoose.model('Career', careerSchema)
export default Career
