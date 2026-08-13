import Notification from '../models/Notification.js'
import { emitToUser } from '../socket.js'
import { sendMail } from './mailer.js'

export async function notifyUser({ user, title, message, data, emailSubject, emailText }) {
  const userId = user?._id || user
  if (!userId || !title || !message) return null

  const notification = await Notification.create({
    userId,
    title,
    message,
    data: data || null
  })

  emitToUser(userId, 'notification', {
    id: notification._id,
    _id: notification._id,
    title,
    message,
    data: notification.data,
    createdAt: notification.createdAt,
    read: false
  })

  const email = typeof user === 'object' ? user.email : null
  if (email) {
    sendMail({
      to: email,
      subject: emailSubject || title,
      text: emailText || message
    }).catch(() => {})
  }

  return notification
}

export async function notifyUsers(users, payload) {
  const list = Array.isArray(users) ? users : []
  await Promise.all(list.map((user) => notifyUser({ user, ...payload })))
}
