import mongoose from 'mongoose'

const subRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    permissions: [
      {
        permissionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Permission',
          required: true
        },
        scope: {
          type: String,
          enum: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'],
          default: 'OWN'
        }
      }
    ]
  },
  { _id: false }
)

const rolePermissionSchema = new mongoose.Schema(
  {
    permissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission',
      required: true
    },
    scope: {
      type: String,
      enum: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'],
      default: 'OWN'
    }
  },
  { _id: false }
)

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null
    },
    parentRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null
    },
    level: {
      type: Number,
      default: 1
    },
    subRoles: {
      type: [subRoleSchema],
      default: []
    },
    permissions: {
      type: [rolePermissionSchema],
      default: []
    },
    key: {
      type: String,
      trim: true,
      sparse: true
    },
    label: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
)

roleSchema.index(
  { name: 1, departmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { name: { $type: 'string' } }
  }
)

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema)

export default Role
