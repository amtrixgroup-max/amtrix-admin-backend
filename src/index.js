import dotenv from 'dotenv'
import app from './app.js'
import connectDB from './config/db.js'
import { seedRbacData } from './seed/seedRbac.js'

dotenv.config()

const PORT = process.env.PORT || 5000

const startServer = async () => {
  try {
    await connectDB()
    await seedRbacData()

    app.listen(PORT, () => {
      console.log(`Amtrix backend listening on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start backend:', error)
    process.exit(1)
  }
}

startServer()
