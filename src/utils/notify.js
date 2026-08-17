import Notification from '../models/Notification.js'
import { emitToUser } from '../socket.js'
import { sendMail } from './mailer.js'

function userIdOf(user) {
  if (!user) return null
  if (typeof user === 'object') return user._id || user.id || null
  return user
}

export async function notifyUser({ user, title, message, data, emailSubject, emailText }) {
  try {
    const userId = userIdOf(user)
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
      await sendMail({
        to: email,
        subject: emailSubject || title,
        text: emailText || message
      }).catch((error) => {
        console.error('Failed to email user:', error?.message || error)
      })
    }

    return notification
  } catch (error) {
    console.error('notifyUser failed:', error?.message || error)
    return null
  }
}

export async function notifyUsers(users, payload) {
  const list = Array.isArray(users) ? users.filter(Boolean) : []
  await Promise.all(list.map((user) => notifyUser({ user, ...payload })))
}

export async function notifyCustomerContact({
  email,
  user,
  title,
  message,
  data,
  emailSubject,
  emailText
}) {
  try {
    if (user) {
      await notifyUser({ user, title, message, data, emailSubject, emailText })
    }

    const to = String(email || '').trim().toLowerCase()
    const userEmail = typeof user === 'object' ? String(user.email || '').trim().toLowerCase() : ''
    if (to && to !== userEmail) {
      await sendMail({
        to,
        subject: emailSubject || title,
        text: emailText || message
      })
    }
  } catch (error) {
    console.error('notifyCustomerContact failed:', error?.message || error)
  }
}
