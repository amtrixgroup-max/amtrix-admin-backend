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
import notificationsRoutes from './routes/notifications.js'
import customerApprovalsRoutes from './routes/customerApprovals.js'
import mcChecksRoutes from './routes/mcChecks.js'
import cprRequestsRoutes from './routes/cprRequests.js'
import carriersRoutes from './routes/carriers.js'
import accountingRoutes from './routes/accounting.js'
import loadsRoutes from './routes/loads.js'
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
app.use('/api/notifications', notificationsRoutes)
app.use('/api/customer-approvals', customerApprovalsRoutes)
app.use('/api/mc-checks', mcChecksRoutes)
app.use('/api/cpr-requests', cprRequestsRoutes)
app.use('/api/carriers', carriersRoutes)
app.use('/api/accounting', accountingRoutes)
app.use('/api/loads', loadsRoutes)

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Amtrix backend running' })
})

app.use(errorHandler)

export default app
