import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import rolesRoutes from './routes/roles.js'
import customersRoutes from './routes/customers.js'
import dashboardRoutes from './routes/dashboard.js'
import activitiesRoutes from './routes/activities.js'
import settingsRoutes from './routes/settings.js'
import onboardingRoutes from './routes/onboarding.js'
import adminRoutes from './routes/admin.js'
import errorHandler from './middleware/errorHandler.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/customers', customersRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/activity-logs', activitiesRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/onboarding', onboardingRoutes)

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Amtrix backend running' })
})

app.use(errorHandler)

export default app
