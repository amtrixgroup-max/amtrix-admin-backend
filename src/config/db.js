import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let memoryServer

const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI
  const connect = async (uri) => {
    await mongoose.connect(uri)
    console.log(`MongoDB connected to ${mongoose.connection.name}`)
  }

  try {
    if (MONGODB_URI) {
      await connect(MONGODB_URI)
      return
    }

    throw new Error('No MongoDB URI specified')
  } catch (error) {
    console.warn('MongoDB connection failed:', error.message)
    console.warn('Starting an in-memory MongoDB instance as fallback')
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create()
    }
    const uri = memoryServer.getUri()
    await connect(uri)
  }
}

export default connectDB
