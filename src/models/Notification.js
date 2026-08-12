import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    read: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: () => new Date()
    }
  },
  { timestamps: true }
)

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)

export default Notification
