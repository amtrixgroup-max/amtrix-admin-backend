import mongoose from 'mongoose'

const dashboardSchema = new mongoose.Schema({
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },
  targets: { type: mongoose.Schema.Types.Mixed, default: {} },
  monthlyTargetChart: { type: [mongoose.Schema.Types.Mixed], default: [] },
  quarterlyPerformance: { type: [mongoose.Schema.Types.Mixed], default: [] },
  loadsStatus: { type: [mongoose.Schema.Types.Mixed], default: [] },
  revenueTrend: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recentActivities: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recentLogins: { type: [mongoose.Schema.Types.Mixed], default: [] }
})

const Dashboard = mongoose.models.Dashboard || mongoose.model('Dashboard', dashboardSchema)
export default Dashboard
