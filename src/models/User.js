import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    // Legacy numeric id used by existing /api/users/:id routes
    id: {
      type: Number,
      sparse: true
    },

    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    avatar: {
      type: String,
      default: null
    },

    systemRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
      required: true,
      default: 'USER'
    },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null
    },

    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null
    },

    subRole: {
      type: String,
      default: null
    },

    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    extraPermissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
      }
    ],

    deniedPermissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
      }
    ],

    // Legacy string fields — kept so old documents / frontend still work
    role: {
      type: String,
      default: null
    },
    department: {
      type: String,
      default: null
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'Active', 'Inactive'],
      default: 'ACTIVE'
    },

    lastLoginAt: {
      type: Date,
      default: null
    },

    failedLoginAttempts: {
      type: Number,
      default: 0
    },

    lockedUntil: {
      type: Date,
      default: null
    },

    // Active sessions stored as array of session objects { jti, ip, createdAt }
    activeSessions: [
      {
        jti: String,
        ip: String,
        createdAt: { type: Date, default: () => new Date() }
      }
    ],

    loginAttemptLogs: [
      {
        ip: String,
        isListed: Boolean,
        success: Boolean,
        reason: String,
        createdAt: { type: Date, default: () => new Date() }
      }
    ],

    // Per-user whitelisted IPs for flexible work-from-home allowances
    allowedIps: {
      type: [String],
      default: []
    },

    createdAt: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    timestamps: true
  }
)

userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  return obj
}

userSchema.methods.isActive = function () {
  const status = String(this.status || '').toUpperCase()
  return status === 'ACTIVE'
}

const User = mongoose.models.User || mongoose.model('User', userSchema)

export default User
