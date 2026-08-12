import Department from '../models/Department.js'
import Permission from '../models/Permission.js'
import Role from '../models/Role.js'
import User from '../models/User.js'

const DEPARTMENTS = [
  {
    name: 'AP',
    displayName: 'AP Freight',
    code: 'AP',
    description: 'AP Department',
    status: 'ACTIVE'
  },
  {
    name: 'TK',
    displayName: 'TK Freight',
    code: 'TK',
    description: 'TK Department',
    status: 'ACTIVE'
  },
  {
    name: 'RCM',
    displayName: 'RCM',
    code: 'RCM',
    description: 'Revenue Cycle Management',
    status: 'ACTIVE'
  },
  {
    name: 'AGF',
    displayName: 'AGF',
    code: 'AGF',
    description: 'AGF Department',
    status: 'ACTIVE'
  }
]

const PERMISSION_DEFS = [
  ['USER_VIEW', 'View Users', 'USER', 'VIEW'],
  ['USER_CREATE', 'Create Users', 'USER', 'CREATE'],
  ['USER_UPDATE', 'Update Users', 'USER', 'UPDATE'],
  ['USER_DELETE', 'Delete Users', 'USER', 'DELETE'],
  ['ROLE_VIEW', 'View Roles', 'ROLE', 'VIEW'],
  ['ROLE_CREATE', 'Create Roles', 'ROLE', 'CREATE'],
  ['ROLE_UPDATE', 'Update Roles', 'ROLE', 'UPDATE'],
  ['ROLE_DELETE', 'Delete Roles', 'ROLE', 'DELETE'],
  ['PERMISSION_VIEW', 'View Permissions', 'PERMISSION', 'VIEW'],
  ['PERMISSION_CREATE', 'Create Permissions', 'PERMISSION', 'CREATE'],
  ['PERMISSION_UPDATE', 'Update Permissions', 'PERMISSION', 'UPDATE'],
  ['PERMISSION_DELETE', 'Delete Permissions', 'PERMISSION', 'DELETE'],
  ['DEPARTMENT_VIEW', 'View Departments', 'DEPARTMENT', 'VIEW'],
  ['DEPARTMENT_CREATE', 'Create Departments', 'DEPARTMENT', 'CREATE'],
  ['DEPARTMENT_UPDATE', 'Update Departments', 'DEPARTMENT', 'UPDATE'],
  ['AP_VIEW', 'View AP', 'AP', 'VIEW'],
  ['AP_CREATE', 'Create AP', 'AP', 'CREATE'],
  ['AP_UPDATE', 'Update AP', 'AP', 'UPDATE'],
  ['AP_DELETE', 'Delete AP', 'AP', 'DELETE'],
  ['TK_VIEW', 'View TK', 'TK', 'VIEW'],
  ['TK_CREATE', 'Create TK', 'TK', 'CREATE'],
  ['TK_UPDATE', 'Update TK', 'TK', 'UPDATE'],
  ['TK_DELETE', 'Delete TK', 'TK', 'DELETE'],
  ['RCM_VIEW', 'View RCM', 'RCM', 'VIEW'],
  ['RCM_CREATE', 'Create RCM', 'RCM', 'CREATE'],
  ['RCM_UPDATE', 'Update RCM', 'RCM', 'UPDATE'],
  ['RCM_DELETE', 'Delete RCM', 'RCM', 'DELETE'],
  ['AGF_VIEW', 'View AGF', 'AGF', 'VIEW'],
  ['AGF_CREATE', 'Create AGF', 'AGF', 'CREATE'],
  ['AGF_UPDATE', 'Update AGF', 'AGF', 'UPDATE'],
  ['AGF_DELETE', 'Delete AGF', 'AGF', 'DELETE'],
  ['REPORT_VIEW', 'View Reports', 'REPORT', 'VIEW'],
  ['REPORT_EXPORT', 'Export Reports', 'REPORT', 'EXPORT'],
  ['DASHBOARD_VIEW', 'View Dashboard', 'DASHBOARD', 'VIEW'],
  ['COMPLIANCE_VIEW', 'View Compliance', 'COMPLIANCE', 'VIEW'],
  ['COMPLIANCE_UPDATE', 'Update Compliance', 'COMPLIANCE', 'UPDATE'],
  ['ACCOUNT_VIEW', 'View Accounts', 'ACCOUNT', 'VIEW'],
  ['ACCOUNT_UPDATE', 'Update Accounts', 'ACCOUNT', 'UPDATE'],
  ['ACCOUNT_DELETE', 'Delete Accounts', 'ACCOUNT', 'DELETE']
]

const LEGACY_USER_MAP = {
  SUPER_ADMIN: { systemRole: 'SUPER_ADMIN', deptCode: null },
  ADMIN_AP_FRIDGET: { systemRole: 'ADMIN', deptCode: 'AP' },
  ADMIN_TK_FRIDGET: { systemRole: 'ADMIN', deptCode: 'TK' },
  ADMIN_RCM: { systemRole: 'ADMIN', deptCode: 'RCM' },
  ADMIN_AGM: { systemRole: 'ADMIN', deptCode: 'AGF' },
  ADMIN_AGF: { systemRole: 'ADMIN', deptCode: 'AGF' }
}

const permRef = (permissionByName, name, scope) => ({
  permissionId: permissionByName[name]._id,
  scope
})

const buildDeptAdminPermissions = (permissionByName, deptCode) => [
  permRef(permissionByName, 'DASHBOARD_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'USER_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'USER_CREATE', 'DEPARTMENT'),
  permRef(permissionByName, 'USER_UPDATE', 'DEPARTMENT'),
  permRef(permissionByName, 'ROLE_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'PERMISSION_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'DEPARTMENT_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'REPORT_VIEW', 'DEPARTMENT'),
  permRef(permissionByName, 'REPORT_EXPORT', 'DEPARTMENT'),
  permRef(permissionByName, `${deptCode}_VIEW`, 'DEPARTMENT'),
  permRef(permissionByName, `${deptCode}_CREATE`, 'DEPARTMENT'),
  permRef(permissionByName, `${deptCode}_UPDATE`, 'DEPARTMENT'),
  permRef(permissionByName, `${deptCode}_DELETE`, 'DEPARTMENT')
]

const buildApRoleDefs = (permissionByName) => [
  {
    name: 'NORMAL_USER',
    displayName: 'Normal User',
    level: 1,
    subRoles: [],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'OWN'),
      permRef(permissionByName, 'USER_VIEW', 'OWN'),
      permRef(permissionByName, 'AP_VIEW', 'OWN')
    ]
  },
  {
    name: 'TL',
    displayName: 'Team Leader',
    level: 2,
    subRoles: [],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'TEAM'),
      permRef(permissionByName, 'USER_VIEW', 'TEAM'),
      permRef(permissionByName, 'USER_UPDATE', 'TEAM'),
      permRef(permissionByName, 'REPORT_VIEW', 'TEAM'),
      permRef(permissionByName, 'AP_VIEW', 'TEAM'),
      permRef(permissionByName, 'AP_UPDATE', 'TEAM')
    ]
  },
  {
    name: 'COMPLIANCE',
    displayName: 'Compliance',
    level: 2,
    subRoles: [
      { name: 'HEAD', displayName: 'Compliance Head', permissions: [] },
      { name: 'MC', displayName: 'MC', permissions: [] },
      { name: 'T_AND_T', displayName: 'T&T', permissions: [] }
    ],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'DEPARTMENT'),
      permRef(permissionByName, 'COMPLIANCE_VIEW', 'DEPARTMENT'),
      permRef(permissionByName, 'COMPLIANCE_UPDATE', 'DEPARTMENT'),
      permRef(permissionByName, 'AP_VIEW', 'DEPARTMENT')
    ]
  },
  {
    name: 'ACCOUNTS',
    displayName: 'Accounts',
    level: 2,
    subRoles: [
      { name: 'AR', displayName: 'Accounts Receivable', permissions: [] },
      { name: 'AP', displayName: 'Accounts Payable', permissions: [] }
    ],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'DEPARTMENT'),
      permRef(permissionByName, 'ACCOUNT_VIEW', 'DEPARTMENT'),
      permRef(permissionByName, 'ACCOUNT_UPDATE', 'DEPARTMENT'),
      permRef(permissionByName, 'AP_VIEW', 'DEPARTMENT')
    ]
  },
  {
    name: 'DEPT_ADMIN',
    displayName: 'Department Admin',
    level: 3,
    subRoles: [],
    permissions: buildDeptAdminPermissions(permissionByName, 'AP')
  }
]

const buildGenericDeptRoles = (permissionByName, deptCode) => [
  {
    name: 'NORMAL_USER',
    displayName: 'Normal User',
    level: 1,
    subRoles: [],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'OWN'),
      permRef(permissionByName, 'USER_VIEW', 'OWN'),
      permRef(permissionByName, `${deptCode}_VIEW`, 'OWN')
    ]
  },
  {
    name: 'TL',
    displayName: 'Team Leader',
    level: 2,
    subRoles: [],
    permissions: [
      permRef(permissionByName, 'DASHBOARD_VIEW', 'TEAM'),
      permRef(permissionByName, 'USER_VIEW', 'TEAM'),
      permRef(permissionByName, 'USER_UPDATE', 'TEAM'),
      permRef(permissionByName, 'REPORT_VIEW', 'TEAM'),
      permRef(permissionByName, `${deptCode}_VIEW`, 'TEAM'),
      permRef(permissionByName, `${deptCode}_UPDATE`, 'TEAM')
    ]
  },
  {
    name: 'DEPT_ADMIN',
    displayName: 'Department Admin',
    level: 3,
    subRoles: [],
    permissions: buildDeptAdminPermissions(permissionByName, deptCode)
  }
]

async function upsertDepartments() {
  const byCode = {}
  for (const dept of DEPARTMENTS) {
    const doc = await Department.findOneAndUpdate(
      { code: dept.code },
      { $set: dept },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    byCode[dept.code] = doc
  }
  return byCode
}

async function upsertPermissions() {
  const byName = {}
  for (const [name, displayName, module, action] of PERMISSION_DEFS) {
    const doc = await Permission.findOneAndUpdate(
      { name },
      {
        $set: {
          name,
          displayName,
          module,
          action,
          description: `${displayName}`,
          allowedScopes: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'],
          status: 'ACTIVE'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    byName[name] = doc
  }
  return byName
}

async function upsertRole(departmentId, roleDef, deptCode) {
  const scopedKey = `${deptCode}_${roleDef.name}`

  return Role.findOneAndUpdate(
    { name: roleDef.name, departmentId },
    {
      $set: {
        name: roleDef.name,
        displayName: roleDef.displayName,
        departmentId,
        parentRoleId: null,
        level: roleDef.level,
        subRoles: roleDef.subRoles || [],
        permissions: roleDef.permissions || [],
        key: scopedKey,
        label: roleDef.displayName,
        status: 'ACTIVE'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

async function seedRoles(departmentsByCode, permissionByName) {
  // Old Role schema had unique `key` — drop so same role names can exist per department
  try {
    await Role.collection.dropIndex('key_1')
    console.log('Dropped legacy unique index roles.key_1')
  } catch (error) {
    if (error?.codeName !== 'IndexNotFound' && error?.code !== 27) {
      console.warn('Could not drop key_1 index:', error.message)
    }
  }

  const rolesByDept = {}

  for (const code of Object.keys(departmentsByCode)) {
    const dept = departmentsByCode[code]
    const defs =
      code === 'AP'
        ? buildApRoleDefs(permissionByName)
        : buildGenericDeptRoles(permissionByName, code)

    rolesByDept[code] = {}
    for (const def of defs) {
      const role = await upsertRole(dept._id, def, code)
      rolesByDept[code][def.name] = role
    }
  }

  return rolesByDept
}

async function migrateExistingUsers(departmentsByCode, rolesByDept) {
  const users = await User.find()
  let migrated = 0

  for (const user of users) {
    // Already on new RBAC shape
    if (user.systemRole && (user.systemRole !== 'USER' || user.roleId || user.role === 'SUPER_ADMIN')) {
      // Still normalize status / SUPER_ADMIN mapping if needed
    }

    const legacyRole = user.role
    const mapping = LEGACY_USER_MAP[legacyRole]

    const updates = {}

    // Normalize status casing without changing meaning
    if (user.status === 'Active') updates.status = 'ACTIVE'
    if (user.status === 'Inactive') updates.status = 'INACTIVE'

    if (mapping) {
      updates.systemRole = mapping.systemRole

      if (mapping.systemRole === 'SUPER_ADMIN') {
        updates.departmentId = null
        updates.roleId = null
        updates.subRole = null
        updates.department = null
        updates.role = 'SUPER_ADMIN'
      } else if (mapping.deptCode) {
        const dept = departmentsByCode[mapping.deptCode]
        const deptAdminRole = rolesByDept[mapping.deptCode]?.DEPT_ADMIN
        updates.departmentId = dept?._id || null
        updates.roleId = deptAdminRole?._id || null
        updates.subRole = null
        updates.department = mapping.deptCode
        updates.role = 'DEPT_ADMIN'
      }
    } else if (!user.systemRole) {
      updates.systemRole = 'USER'
    }

    if (Object.keys(updates).length) {
      // Never touch password — keep existing Super Admin / admin credentials
      await User.updateOne({ _id: user._id }, { $set: updates })
      migrated += 1
    }
  }

  // Ensure Super Admin exists (credentials preserved if already present)
  const superAdminEmail = (
    process.env.SUPER_ADMIN_EMAIL || 'superadmin@amtrix.com'
  ).toLowerCase()

  const existingSuperAdmin = await User.findOne({
    $or: [
      { email: superAdminEmail },
      { systemRole: 'SUPER_ADMIN' },
      { role: 'SUPER_ADMIN' }
    ]
  })

  if (!existingSuperAdmin) {
    const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123'
    await User.create({
      name: 'Super Admin',
      email: superAdminEmail,
      password,
      systemRole: 'SUPER_ADMIN',
      role: 'SUPER_ADMIN',
      departmentId: null,
      roleId: null,
      subRole: null,
      status: 'ACTIVE'
    })
    console.log(`Created Super Admin (${superAdminEmail})`)
  } else {
    await User.updateOne(
      { _id: existingSuperAdmin._id },
      {
        $set: {
          systemRole: 'SUPER_ADMIN',
          role: 'SUPER_ADMIN',
          departmentId: null,
          roleId: null,
          subRole: null,
          status: existingSuperAdmin.status === 'Active' ? 'ACTIVE' : existingSuperAdmin.status || 'ACTIVE'
        }
      }
    )
  }

  return migrated
}

async function migrateLegacyRoleCatalog() {
  const legacyRoles = await Role.find({
    $or: [{ name: { $exists: false } }, { name: null }, { name: '' }]
  })

  for (const role of legacyRoles) {
    const name = String(role.key || role.label || role._id)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')

    await Role.updateOne(
      { _id: role._id },
      {
        $set: {
          name,
          displayName: role.label || role.key || name,
          departmentId: null,
          level: name === 'SUPER_ADMIN' ? 99 : 3,
          subRoles: role.subRoles || [],
          permissions: role.permissions || [],
          status: 'ACTIVE'
        }
      }
    )
  }
}

export const seedRbacData = async () => {
  console.log('Seeding RBAC data...')

  await migrateLegacyRoleCatalog()

  const departmentsByCode = await upsertDepartments()
  console.log(`Departments ready: ${Object.keys(departmentsByCode).join(', ')}`)

  const permissionByName = await upsertPermissions()
  console.log(`Permissions ready: ${Object.keys(permissionByName).length}`)

  const rolesByDept = await seedRoles(departmentsByCode, permissionByName)
  console.log('Department roles ready (incl. AP Compliance/Accounts sub-roles)')

  const migrated = await migrateExistingUsers(departmentsByCode, rolesByDept)
  console.log(`Migrated/updated ${migrated} existing user(s) to RBAC fields (passwords unchanged)`)

  console.log('RBAC seed complete')
}

export default seedRbacData
