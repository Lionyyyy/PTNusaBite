'use strict';
const { AccessError } = require('./errors');

const ROLES = {
  sales: 'Sales',
  warehouse: 'Warehouse',
  finance: 'Finance',
  hr: 'HR',
  cashier: 'Cashier',
  owner: 'Owner',
  master_admin: 'Master Admin',
  audit: 'Audit',
};

// Matriks hak akses operasional (SR-13). Owner mempertahankan hak operasional penuh.
const PERMS = {
  'contacts.view': ['sales', 'warehouse', 'finance'],
  'contacts.create_customer': ['sales', 'finance'],
  'contacts.create_vendor': ['warehouse', 'finance'],
  'contacts.edit_credit': ['finance'],
  'products.view': ['sales', 'warehouse', 'finance', 'cashier'],
  'products.edit': ['warehouse', 'finance'],
  'products.edit_price': ['finance'],
  'crm.view': ['sales'],
  'crm.edit': ['sales'],
  'sales.view': ['sales', 'finance', 'warehouse'],
  'sales.edit': ['sales'],
  'sales.approve_discount': [],
  'sales.revision_request': ['sales'],
  'sales.revision_approve': [],
  'counter.use': ['cashier', 'sales'],
  'inventory.view': ['warehouse', 'sales', 'finance', 'cashier'],
  'inventory.operate': ['warehouse'],
  'purchase.view': ['warehouse', 'finance'],
  'purchase.edit': ['warehouse'],
  'invoicing.view': ['finance', 'sales'],
  'invoicing.edit': ['finance'],
  'accounting.view': ['finance'],
  'accounting.edit': ['finance'],
  'employees.view': ['hr', 'finance'],
  'employees.edit': ['hr'],
  'payroll.view': ['hr', 'finance'],
  'payroll.prepare': ['hr'],
  'payroll.post': ['finance'],
  'dashboard.view': ['finance'],
  'audit.view': ['finance'],
  'admin.reset': [],
  'masterdata.view': [],
  'masterdata.manage': [],
  'admin.manage': ['master_admin'],
  'audit.review': ['audit'],
};

// Custom roles may receive business and catalog permissions. Administration and audit
// review stay with their respective built-in roles.
const AUDIT_READ = new Set([
  'audit.view', 'sales.view', 'purchase.view', 'inventory.view', 'invoicing.view',
  'accounting.view', 'employees.view', 'payroll.view', 'products.view', 'crm.view', 'contacts.view',
]);
const RESERVED = new Set(['admin.reset', 'admin.manage', 'audit.view', 'audit.review', 'sales.approve_discount', 'sales.revision_approve']);
const ACTIONS = {
  'masterdata.manage': ['create', 'update', 'delete'],
  'contacts.create_customer': ['create', 'update'],
  'contacts.create_vendor': ['create', 'update'],
  'contacts.edit_credit': ['create', 'update'],
  'products.edit': ['create', 'update'],
  'products.edit_price': ['create', 'update'],
  'crm.edit': ['create', 'update'],
  'sales.edit': ['create', 'update', 'cancel'],
  'sales.revision_request': ['create'],
  'counter.use': ['create'],
  'inventory.operate': ['create', 'update', 'cancel'],
  'purchase.edit': ['create', 'update', 'cancel'],
  'invoicing.edit': ['create', 'update', 'approve'],
  'accounting.edit': ['create', 'update', 'approve'],
  'employees.edit': ['create', 'update'],
  'payroll.prepare': ['create', 'update', 'approve'],
  'payroll.post': ['approve'],
};
const GRANTS = Object.keys(PERMS).filter((p) => !RESERVED.has(p)).flatMap((p) =>
  ACTIONS[p] ? ACTIONS[p].map((operation) => `${p}:${operation}`) : [p]);

function can(subject, perm, operation) {
  if (!Object.hasOwn(PERMS, perm)) throw new Error(`Permission tidak dikenal: ${perm}`);
  const role = typeof subject === 'string' ? subject : subject?.role;
  if (role === 'master_admin') return ['admin.manage', 'audit.view', 'masterdata.view', 'masterdata.manage'].includes(perm);
  if (role === 'audit') return AUDIT_READ.has(perm) || perm === 'audit.review';
  if (role === 'owner') return !['admin.manage', 'audit.review', 'masterdata.view', 'masterdata.manage'].includes(perm);
  if (Object.hasOwn(ROLES, role)) return PERMS[perm].includes(role);
  if (RESERVED.has(perm) || !Array.isArray(subject?.grants)) return false;
  if (!ACTIONS[perm]) return subject.grants.includes(perm);
  const operations = operation ? [operation] : ACTIONS[perm];
  return operations.some((op) => subject.grants.includes(`${perm}:${op}`));
}

function requirePerm(ctx, perm, docNumber = null, operation) {
  const role = ctx && ctx.user ? ctx.user.role : 'anonymous';
  if (!ctx || !ctx.user || !can(ctx.user, perm, operation)) {
    throw new AccessError(`Akses ditolak: peran ${ROLES[role] || role} tidak memiliki hak "${perm}" (SR-13).`, { perm, docNumber });
  }
}

function permsFor(subject) {
  const out = {};
  for (const p of Object.keys(PERMS)) out[p] = can(subject, p);
  return out;
}

module.exports = { ROLES, PERMS, GRANTS, can, requirePerm, permsFor };
