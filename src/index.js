import dotenv from 'dotenv'
import http from 'http'
import app from './app.js'
import connectDB from './config/db.js'
import { seedRbacData } from './seed/seedRbac.js'
import { seedAccountingData } from './seed/seedAccounting.js'
import { seedLoadData } from './seed/seedLoads.js'
import { seedCarrierData } from './seed/seedCarriers.js'
import { initSocket } from './socket.js'
import { startPendingMcCheckReminderJob } from './utils/mcCheckReminders.js'
import { startPaymentReminderJob } from './utils/paymentReminders.js'

dotenv.config()

const PORT = process.env.PORT || 5000

const startServer = async () => {
  try {
    await connectDB()
    await seedRbacData()
    await seedAccountingData()
    await seedLoadData()
    await seedCarrierData()

    const server = http.createServer(app)
    initSocket(server)
    startPendingMcCheckReminderJob()
    startPaymentReminderJob()

    server.listen(PORT, () => {
      console.log(`Amtrix backend listening on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start backend:', error)
    process.exit(1)
  }
}

startServer()
