import mongoose from 'mongoose'

const onboardingSchema = new mongoose.Schema({
  userTypes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  customerModules: { type: [mongoose.Schema.Types.Mixed], default: [] }
})

const Onboarding = mongoose.models.Onboarding || mongoose.model('Onboarding', onboardingSchema)
export default Onboarding
