// utils/validation.js
// Business logic validation for all entities

const { validateMultiCurrencyBalance } = require('./currency');

/**
 * Validate invoice before save
 */
function validateInvoice(invoice) {
  const errors = [];

  if (!invoice.company_id && !invoice.company_name) {
    errors.push('Company is required');
  }
  if (!invoice.date) {
    errors.push('Invoice date is required');
  }
  if (!invoice.number) {
    errors.push('Invoice number is required');
  }
  if (Number(invoice.total) < 0) {
    errors.push('Invoice total cannot be negative');
  }
  if (invoice.due_date && new Date(invoice.due_date) < new Date(invoice.date)) {
    errors.push('Due date cannot be before invoice date');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate quotation before save
 */
function validateQuotation(quotation) {
  const errors = [];

  if (!quotation.company_id && !quotation.company_name) {
    errors.push('Company is required');
  }
  if (!quotation.number) {
    errors.push('Quotation number is required');
  }
  if (Number(quotation.total) < 0) {
    errors.push('Quotation total cannot be negative');
  }
  if (quotation.valid_until && new Date(quotation.valid_until) < new Date()) {
    errors.push('Quotation has already expired');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate sales order before save
 */
function validateSalesOrder(salesOrder) {
  const errors = [];

  if (!salesOrder.company_id && !salesOrder.company_name) {
    errors.push('Company is required');
  }
  if (!salesOrder.number) {
    errors.push('Sales order number is required');
  }
  if (Number(salesOrder.total) < 0) {
    errors.push('Sales order total cannot be negative');
  }
  if (salesOrder.delivery_date && salesOrder.date && new Date(salesOrder.delivery_date) < new Date(salesOrder.date)) {
    errors.push('Delivery date cannot be before order date');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate payment before save
 */
function validatePayment(payment) {
  const errors = [];

  if (!payment.date) {
    errors.push('Payment date is required');
  }
  if (!payment.type || !['incoming', 'outgoing'].includes(payment.type)) {
    errors.push('Payment type must be "incoming" or "outgoing"');
  }
  if (Number(payment.amount) <= 0) {
    errors.push('Payment amount must be greater than 0');
  }
  if (!payment.method) {
    errors.push('Payment method is required');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate expense before save
 */
function validateExpense(expense) {
  const errors = [];

  if (!expense.date) {
    errors.push('Expense date is required');
  }
  if (Number(expense.amount) < 0) {
    errors.push('Expense amount cannot be negative');
  }
  if (!expense.category) {
    errors.push('Expense category is required');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate journal entry with multi-currency support
 */
function validateJournalEntry(entry, lines) {
  const errors = [];

  if (!entry.date) {
    errors.push('Journal entry date is required');
  }
  if (!entry.number) {
    errors.push('Journal entry number is required');
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    errors.push('Journal entry must have at least 2 lines');
  }

  // Check if all lines have account_id
  for (const line of lines) {
    if (!line.account_id) {
      errors.push('All lines must have an account');
    }
    if (Number(line.debit) < 0 || Number(line.credit) < 0) {
      errors.push('Debit and credit amounts cannot be negative');
    }
    // Ensure only one of debit or credit is set per line
    if (Number(line.debit) > 0 && Number(line.credit) > 0) {
      errors.push('A line cannot have both debit and credit amounts');
    }
  }

  // Validate multi-currency balance
  if (lines && lines.length > 0) {
    const balanceCheck = validateMultiCurrencyBalance(lines);
    if (!balanceCheck.isBalanced) {
      errors.push(
        `Journal not balanced: debits ${balanceCheck.totalDebit} ≠ credits ${balanceCheck.totalCredit}`
      );
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate company/contact before save
 */
function validateCompany(company) {
  const errors = [];

  if (!company.name) {
    errors.push('Company name is required');
  }
  if (company.email && !isValidEmail(company.email)) {
    errors.push('Invalid email format');
  }
  if (Number(company.credit_limit) < 0) {
    errors.push('Credit limit cannot be negative');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate user before save
 */
function validateUser(user) {
  const errors = [];

  if (!user.name) {
    errors.push('User name is required');
  }
  if (!user.email || !isValidEmail(user.email)) {
    errors.push('Valid email is required');
  }
  if (!user.role) {
    errors.push('User role is required');
  }
  if (user.password && user.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate account (chart of accounts) before save
 */
function validateAccount(account) {
  const errors = [];

  if (!account.code) {
    errors.push('Account code is required');
  }
  if (!account.name) {
    errors.push('Account name is required');
  }
  if (!account.type || !['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account.type)) {
    errors.push('Invalid account type');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate opportunity before save
 */
function validateOpportunity(opportunity) {
  const errors = [];

  if (!opportunity.title) {
    errors.push('Opportunity title is required');
  }
  if (Number(opportunity.value) < 0) {
    errors.push('Opportunity value cannot be negative');
  }
  if (Number(opportunity.probability) < 0 || Number(opportunity.probability) > 100) {
    errors.push('Probability must be between 0 and 100');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Helper: validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  validateInvoice,
  validateQuotation,
  validateSalesOrder,
  validatePayment,
  validateExpense,
  validateJournalEntry,
  validateCompany,
  validateUser,
  validateAccount,
  validateOpportunity,
  isValidEmail,
};
