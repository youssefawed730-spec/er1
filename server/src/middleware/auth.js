// middleware/auth.js
// Provides:
//   authenticate  – verifies the httpOnly access token cookie
//   authorize(module, action)  – RBAC gate (server-side)

const jwt = require('jsonwebtoken');
const db  = require('../db/schema');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'change-me-access-secret';

// ─── Default role permission table (mirrors the frontend DEFAULT_ROLE_PERMISSIONS) ───
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    chartOfAccounts: ['read','write','delete'],
    invoices:        ['read','write','delete','approve','confirm'],
    salesOrders:     ['read','write','delete','approve','confirm'],
    payments:        ['read','write','delete'],
    expenses:        ['read','write','delete','approve'],
    journalEntries:  ['read','write','delete','post'],
    taxConfig:       ['read','write','delete'],
    reports:         ['read','export'],
    contacts:        ['read','write','delete'],
    companies:       ['read','write','delete'],
    opportunities:   ['read','write','delete','approve'],
    activities:      ['read','write','delete'],
    quotations:      ['read','write','delete','approve'],
    costItems:       ['read','write','delete','approve'],
    purchaseCosts:   ['read','write','delete','approve'],
    users:           ['read','write','delete'],
    settings:        ['read','write'],
    vendors:         ['read','write','delete'],
    auditLogs:       ['read'],
    notifications:   ['read','write'],
  },
  manager: {
    invoices:      ['read','write','delete','approve'],
    salesOrders:   ['read','write','delete','approve','confirm'],
    payments:      ['read','write','delete'],
    expenses:      ['read','write','delete','approve'],
    reports:       ['read','export'],
    contacts:      ['read','write','delete'],
    companies:     ['read','write','delete'],
    opportunities: ['read','write','delete','approve'],
    activities:    ['read','write','delete'],
    quotations:    ['read','write','delete','approve'],
    purchaseCosts: ['read','write','delete','approve'],
    costItems:     ['read','write','delete','approve'],
    users:         ['read'],
    auditLogs:     ['read'],
    notifications: ['read'],
  },
  head_of_accounting: {
    chartOfAccounts: ['read','write'],
    invoices:        ['read','write','approve','confirm'],
    salesOrders:     ['read','write','confirm'],
    payments:        ['read','write','approve'],
    expenses:        ['read','write','approve'],
    journalEntries:  ['read','write','post'],
    taxConfig:       ['read','write'],
    reports:         ['read','export'],
    contacts:        ['read'],
    companies:       ['read'],
    purchaseCosts:   ['read','write','approve','confirm'],
    quotations:      ['read','approve'],
    vendors:         ['read','write'],
    users:           ['read'],
    notifications:   ['read'],
  },
  accounting: {
    chartOfAccounts: ['read'],
    invoices:        ['read','write','confirm'],
    salesOrders:     ['read'],
    payments:        ['read','write'],
    expenses:        ['read','write','approve'],
    journalEntries:  ['read','write'],
    reports:         ['read'],
    contacts:        ['read'],
    companies:       ['read'],
    purchaseCosts:   ['read','write','confirm'],
    vendors:         ['read','write'],
    users:           ['read'],
    notifications:   ['read'],
  },
  head_of_sales: {
    invoices:      ['read'],
    salesOrders:   ['read','write','approve'],
    contacts:      ['read','write'],
    companies:     ['read','write'],
    opportunities: ['read','write','approve'],
    activities:    ['read','write','delete'],
    quotations:    ['read','write','approve'],
    reports:       ['read','export'],
    users:         ['read'],
    notifications: ['read'],
  },
  sales: {
    contacts:      ['read'],
    companies:     ['read'],
    opportunities: ['read','write'],
    activities:    ['read','write'],
    quotations:    ['read','write'],
    salesOrders:   ['read','write'],
    users:         ['read'],
    notifications: ['read'],
  },
  operation: {
    invoices:      ['read','write'],
    salesOrders:   ['read','write','convert_to_invoice'],
    expenses:      ['read','write','approve'],
    opportunities: ['read'],
    activities:    ['read','write'],
    quotations:    ['read','write','convert_to_sales_order'],
    costItems:     ['read','write','approve'],
    purchaseCosts: ['read','write'],
    companies:     ['read'],
    contacts:      ['read'],
    users:         ['read'],
    notifications: ['read'],
  },
  head_of_operation: {
    invoices:      ['read','write'],
    salesOrders:   ['read','write','convert_to_invoice'],
    expenses:      ['read','write','approve'],
    opportunities: ['read','write','approve'],
    activities:    ['read','write','delete'],
    quotations:    ['read','write','approve','confirm','convert_to_sales_order'],
    costItems:     ['read','write','approve'],
    purchaseCosts: ['read','write'],
    companies:     ['read'],
    contacts:      ['read'],
    users:         ['read'],
    notifications: ['read'],
  },
  contact: {
    contacts:      ['read','write'],
    companies:     ['read','write'],
    notifications: ['read'],
  },
};

/**
 * Get effective permissions for a role, merging DB overrides.
 */
function getEffectivePermissions(role) {
  const base = { ...(DEFAULT_ROLE_PERMISSIONS[role] || {}) };
  const overrides = db.prepare('SELECT module, actions FROM role_permission_overrides WHERE role = ?').all(role);
  for (const row of overrides) {
    try { base[row.module] = JSON.parse(row.actions); } catch {}
  }
  return base;
}

/**
 * Checks whether a role has a specific action on a module.
 */
function roleHasPermission(role, module, action) {
  const perms = getEffectivePermissions(role);
  return Array.isArray(perms[module]) && perms[module].includes(action);
}

/**
 * Middleware: verify the httpOnly access token cookie.
 * Attaches `req.user = { id, email, role, name }`.
 */
function authenticate(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    // Fetch fresh user from DB so deactivated users are rejected immediately
    const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.is_active) return res.status(401).json({ error: 'User not found or deactivated' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory: require a specific permission.
 * Usage:  router.delete('/invoices/:id', authenticate, authorize('invoices','delete'), handler)
 */
function authorize(module, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roleHasPermission(req.user.role, module, action)) {
      return res.status(403).json({ error: `Forbidden: requires ${module}.${action}` });
    }
    next();
  };
}

module.exports = { authenticate, authorize, roleHasPermission, getEffectivePermissions };
