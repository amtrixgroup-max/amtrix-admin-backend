import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import User from './models/User.js'
import { JWT_SECRET } from './middleware/auth.js'

let io = null

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token
      if (!token) return next(new Error('Unauthorized'))

      const payload = jwt.verify(token, JWT_SECRET)
      const user = await User.findById(payload.userId).select('_id status activeSessions')
      if (!user) return next(new Error('Unauthorized'))

      const status = String(user.status || '').toUpperCase()
      if (status && status !== 'ACTIVE') return next(new Error('Unauthorized'))

      if (payload.jti && !(user.activeSessions || []).some((s) => s.jti === payload.jti)) {
        return next(new Error('Unauthorized'))
      }

      socket.userId = String(user._id)
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`)
  })

  return io
}

export function emitToUser(userId, event, payload) {
  if (!io || !userId) return
  io.to(`user:${String(userId)}`).emit(event, payload)
}

export function getIo() {
  return io
}
