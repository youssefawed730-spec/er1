// utils/audit.js
// Comprehensive audit logging for all business operations

const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');

/**
 * Log audit event - called for all mutations
 */
function auditLog(action, entityType, entityId, details, user) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, details, user_id, user_name, user_role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      action,
      entityType,
      entityId,
      JSON.stringify(details || {}),
      user?.id || null,
      user?.name || null,
      user?.role || null
    );
  } catch (err) {
    console.error('[audit] failed to log:', err);
  }
}

/**
 * Log invoice operation
 */
function logInvoice(action, invoice, user, changes = {}) {
  auditLog(action, 'invoice', invoice.id, {
    invoiceNumber: invoice.number,
    companyId: invoice.company_id,
    amount: invoice.total,
    status: invoice.status,
    ...changes,
  }, user);
}

/**
 * Log quotation operation
 */
function logQuotation(action, quotation, user, changes = {}) {
  auditLog(action, 'quotation', quotation.id, {
    quotationNumber: quotation.number,
    companyId: quotation.company_id,
    amount: quotation.total,
    status: quotation.status,
    ...changes,
  }, user);
}

/**
 * Log sales order operation
 */
function logSalesOrder(action, salesOrder, user, changes = {}) {
  auditLog(action, 'sales_order', salesOrder.id, {
    orderNumber: salesOrder.number,
    companyId: salesOrder.company_id,
    amount: salesOrder.total,
    status: salesOrder.status,
    ...changes,
  }, user);
}

/**
 * Log payment operation
 */
function logPayment(action, payment, user, changes = {}) {
  auditLog(action, 'payment', payment.id, {
    paymentReference: payment.reference,
    amount: payment.amount,
    type: payment.type,
    invoiceId: payment.invoice_id,
    ...changes,
  }, user);
}

/**
 * Log expense operation
 */
function logExpense(action, expense, user, changes = {}) {
  auditLog(action, 'expense', expense.id, {
    expenseNumber: expense.number,
    amount: expense.amount,
    status: expense.status,
    ...changes,
  }, user);
}

/**
 * Log journal entry operation
 */
function logJournalEntry(action, entry, user, changes = {}) {
  auditLog(action, 'journal_entry', entry.id, {
    journalNumber: entry.number,
    date: entry.date,
    status: entry.status,
    ...changes,
  }, user);
}

/**
 * Log company operation
 */
function logCompany(action, company, user, changes = {}) {
  auditLog(action, 'company', company.id, {
    companyName: company.name,
    type: company.type,
    ...changes,
  }, user);
}

/**
 * Log user operation
 */
function logUser(action, user, targetUser, changes = {}) {
  auditLog(action, 'user', targetUser.id, {
    userEmail: targetUser.email,
    userRole: targetUser.role,
    isActive: targetUser.is_active,
    ...changes,
  }, user);
}

/**
 * Log permission/role operation
 */
function logRolePermission(action, role, module, permissions, user) {
  auditLog(action, 'role_permission', `${role}:${module}`, {
    role,
    module,
    permissions,
  }, user);
}

/**
 * Log cost item operation
 */
function logCostItem(action, item, user, changes = {}) {
  auditLog(action, 'cost_item', item.id, {
    itemName: item.name,
    unitCost: item.unit_cost,
    status: item.status,
    ...changes,
  }, user);
}

/**
 * Log purchase cost operation
 */
function logPurchaseCost(action, purchaseCost, user, changes = {}) {
  auditLog(action, 'purchase_cost', purchaseCost.id, {
    pcNumber: purchaseCost.number,
    total: purchaseCost.total,
    status: purchaseCost.status,
    ...changes,
  }, user);
}

/**
 * Log tax config operation
 */
function logTaxConfig(action, taxConfig, user, changes = {}) {
  auditLog(action, 'tax_config', taxConfig.id, {
    taxName: taxConfig.name,
    rate: taxConfig.rate,
    ...changes,
  }, user);
}

/**
 * Log account operation
 */
function logAccount(action, account, user, changes = {}) {
  auditLog(action, 'account', account.id, {
    accountCode: account.code,
    accountName: account.name,
    accountType: account.type,
    ...changes,
  }, user);
}

/**
 * Log opportunity operation
 */
function logOpportunity(action, opportunity, user, changes = {}) {
  auditLog(action, 'opportunity', opportunity.id, {
    opportunityTitle: opportunity.title,
    companyId: opportunity.company_id,
    value: opportunity.value,
    stage: opportunity.stage,
    ...changes,
  }, user);
}

/**
 * Log activity operation
 */
function logActivity(action, activity, user, changes = {}) {
  auditLog(action, 'activity', activity.id, {
    activityType: activity.type,
    activityTitle: activity.title,
    refId: activity.ref_id,
    ...changes,
  }, user);
}

/**
 * Get audit logs with filtering
 */
function getAuditLogs(filters = {}) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (filters.entityType) {
    query += ' AND entity_type = ?';
    params.push(filters.entityType);
  }
  if (filters.action) {
    query += ' AND action = ?';
    params.push(filters.action);
  }
  if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }
  if (filters.entityId) {
    query += ' AND entity_id = ?';
    params.push(filters.entityId);
  }
  if (filters.fromDate) {
    query += ' AND created_at >= ?';
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    query += ' AND created_at <= ?';
    params.push(filters.toDate);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(filters.limit || 200);
  params.push(filters.offset || 0);

  return db.prepare(query).all(...params);
}

module.exports = {
  auditLog,
  logInvoice,
  logQuotation,
  logSalesOrder,
  logPayment,
  logExpense,
  logJournalEntry,
  logCompany,
  logUser,
  logRolePermission,
  logCostItem,
  logPurchaseCost,
  logTaxConfig,
  logAccount,
  logOpportunity,
  logActivity,
  getAuditLogs,
};
