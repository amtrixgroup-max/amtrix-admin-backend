import mongoose from 'mongoose'

const SCOPES = ['OWN', 'TEAM', 'DEPARTMENT', 'ALL']

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    module: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    description: {
      type: String,
      default: ''
    },
    allowedScopes: {
      type: [String],
      enum: SCOPES,
      default: SCOPES
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
)

permissionSchema.statics.SCOPES = SCOPES

const Permission =
  mongoose.models.Permission || mongoose.model('Permission', permissionSchema)

export default Permission
