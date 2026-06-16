// data/store.js  ← DROP-IN REPLACEMENT
//
// Replaces the localStorage data layer with a real HTTP API client.
// All auth is handled via httpOnly cookies (no tokens in JS memory).
// Permission checks in the UI use the role matrix for UX only —
// the backend enforces everything server-side.
//
// MIGRATION GUIDE:
// - Every call that was synchronous (getInvoices()) is now async (await api.get('/invoices'))
// - Components should switch from calling store functions to using the `api` helper directly.
// - The legacy compatibility shims below keep existing components working with minimal changes.

// ─────────────────────────────────────────────
//  API base URL — change in .env: VITE_API_URL=http://localhost:4000
// ─────────────────────────────────────────────
const API_BASE = (import.meta.env?.VITE_API_URL || 'http://localhost:4000') + '/api';

// ─────────────────────────────────────────────
//  Core fetch wrapper
// ─────────────────────────────────────────────

let _refreshPromise = null;

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',           // send httpOnly cookies
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  // Transparent token refresh on 401
  // NOTE: /auth/me is excluded — a 401 there simply means "not logged in yet"
  // (e.g. first visit, cleared cookies). Treating that as a real "session
  // expired" event would trigger a hard redirect to /login, which reloads
  // the app, re-runs this same check, and loops forever.
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh' && path !== '/auth/me') {
    if (!_refreshPromise) {
      _refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST', credentials: 'include',
      }).finally(() => { _refreshPromise = null; });
    }
    const refreshRes = await _refreshPromise;
    if (refreshRes.ok) {
      // Retry original request once
      return fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } else {
      // Refresh failed — user must log in again
      emitEvent('session_expired', {});
      throw new Error('Session expired');
    }
  }

  return res;
}

// Backend errors are usually `{ error: "message" }`, but Zod validation
// failures return `{ error: [{ path, message }, ...] }`. Without this,
// `new Error(arrayOfObjects)` produces the useless message "[object Object]".
function formatApiError(body, fallback) {
  const err = body?.error;
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (Array.isArray(err)) {
    return err
      .map(issue => {
        const field = Array.isArray(issue?.path) ? issue.path.join('.') : issue?.path;
        return field ? `${field}: ${issue.message}` : issue?.message;
      })
      .filter(Boolean)
      .join(', ') || fallback;
  }
  return fallback;
}

async function throwApiError(res, fallback) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  throw new Error(formatApiError(body, fallback || res.statusText));
}

export const api = {
  async get(path, query = {}) {
    const qs = Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
    const res = await apiFetch(path + qs);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  async post(path, body) {
    const res = await apiFetch(path, { method: 'POST', body });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  async put(path, body) {
    const res = await apiFetch(path, { method: 'PUT', body });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
  async delete(path) {
    const res = await apiFetch(path, { method: 'DELETE' });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },
};

// ─────────────────────────────────────────────
//  Event system (in-memory — no localStorage)
// ─────────────────────────────────────────────
const _listeners = [];

export function subscribeToEvents(callback) {
  _listeners.push(callback);
  return () => {
    const i = _listeners.indexOf(callback);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function emitEvent(type, data) {
  for (const cb of _listeners) {
    try { cb({ type, data }); } catch {}
  }
}

// ─────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────

// In-memory session cache — NOT localStorage
let _currentUser = null;

export async function initializeData() {
  try {
    const { user } = await api.get('/auth/me');
    _currentUser = user;
    emitEvent('session_ready', user);
  } catch {
    _currentUser = null;
  }
}

export function getCurrentUser() {
  return _currentUser;
}

export async function login(email, password) {
  try {
    const { user } = await api.post('/auth/login', { email, password });
    _currentUser = user;
    emitEvent('login', user);
    return { success: true, user };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function forgotPassword(email) {
  try {
    const result = await api.post('/auth/forgot-password', { email });
    return { success: true, message: result.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function resetPassword(token, password) {
  try {
    const result = await api.post('/auth/reset-password', { token, password });
    return { success: true, message: result.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function logout() {
  try {
    await api.post('/auth/logout', {});
  } catch {}
  _currentUser = null;
  emitEvent('logout', {});
}

// ─────────────────────────────────────────────
//  Role / Permission helpers
//  (UI-only — backend enforces independently)
// ─────────────────────────────────────────────

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    name: 'System Administrator',
    permissions: {
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
      quotations:      ['read','write','delete','approve'],
      costItems:       ['read','write','delete','approve'],
      purchaseCosts:   ['read','write','delete','approve'],
      users:           ['read','write','delete'],
      settings:        ['read','write'],
      vendors:         ['read','write','delete'],
      auditLogs:       ['read'],
      notifications:   ['read','write'],
    },
  },
  manager: {
    name: 'General Manager',
    permissions: {
      invoices:      ['read','write','delete','approve'],
      salesOrders:   ['read','write','delete','approve','confirm'],
      payments:      ['read','write','delete'],
      expenses:      ['read','write','delete','approve'],
      reports:       ['read','export'],
      contacts:      ['read','write','delete'],
      companies:     ['read','write','delete'],
      opportunities: ['read','write','delete','approve'],
      quotations:    ['read','write','delete','approve'],
      purchaseCosts: ['read','write','delete','approve'],
      costItems:     ['read','write','delete','approve'],
      auditLogs:     ['read'],
      notifications: ['read'],
    },
  },
  head_of_accounting: {
    name: 'Head of Accounting',
    permissions: {
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
      notifications:   ['read'],
    },
  },
  accounting: {
    name: 'Accountant',
    permissions: {
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
      notifications:   ['read'],
    },
  },
  head_of_sales: {
    name: 'Head of Sales',
    permissions: {
      invoices:      ['read'],
      salesOrders:   ['read','write','approve'],
      contacts:      ['read','write'],
      companies:     ['read','write'],
      opportunities: ['read','write','approve'],
      quotations:    ['read','write','approve'],
      reports:       ['read','export'],
      notifications: ['read'],
    },
  },
  sales: {
    name: 'Sales Representative',
    permissions: {
      contacts:      ['read'],
      companies:     ['read'],
      opportunities: ['read','write'],
      quotations:    ['read','write'],
      salesOrders:   ['read','write'],
      notifications: ['read'],
    },
  },
  operation: {
    name: 'Operations Manager',
    permissions: {
      invoices:      ['read','write'],
      salesOrders:   ['read','write','convert_to_invoice'],
      expenses:      ['read','write','approve'],
      opportunities: ['read'],
      quotations:    ['read','write','convert_to_sales_order'],
      costItems:     ['read','write','approve'],
      purchaseCosts: ['read','write'],
      companies:     ['read'],
      contacts:      ['read'],
      notifications: ['read'],
    },
  },
  head_of_operation: {
    name: 'Head of Operation',
    permissions: {
      invoices:      ['read','write'],
      salesOrders:   ['read','write','convert_to_invoice'],
      expenses:      ['read','write','approve'],
      opportunities: ['read','write','approve'],
      quotations:    ['read','write','approve','confirm','convert_to_sales_order'],
      costItems:     ['read','write','approve'],
      purchaseCosts: ['read','write'],
      companies:     ['read'],
      contacts:      ['read'],
      notifications: ['read'],
    },
  },
  contact: {
    name: 'External Contact',
    permissions: {
      contacts:      ['read','write'],
      companies:     ['read','write'],
      notifications: ['read'],
    },
  },
};

// Fetch role overrides from server (async, best-effort)
let _roleOverrides = {};
export async function fetchRolePermissionOverrides() {
  try {
    const res = await api.get('/settings/role-permission-overrides');
    _roleOverrides = res.data || {};
  } catch {}
}

export function getEffectiveRolePermissions() {
  const merged = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
  for (const [role, override] of Object.entries(_roleOverrides)) {
    if (!merged[role]) merged[role] = { name: role, permissions: {} };
    if (override.name) merged[role].name = override.name;
    if (override.permissions) merged[role].permissions = { ...merged[role].permissions, ...override.permissions };
  }
  return merged;
}

export const ROLE_PERMISSIONS = new Proxy({}, {
  get(_t, role) { return getEffectiveRolePermissions()[role]; },
  ownKeys()     { return Object.keys(getEffectiveRolePermissions()); },
  getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
});

export function hasPermission(userOrRole, module, action) {
  if (!userOrRole) return false;
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const rolePerms = getEffectiveRolePermissions()[role];
  if (!rolePerms) return false;
  const modulePerm = rolePerms.permissions[module];
  return Array.isArray(modulePerm) && modulePerm.includes(action);
}

// ─────────────────────────────────────────────
//  Currency helpers (client-side, uses cached rates)
// ─────────────────────────────────────────────

export const CURRENCIES = {
  USD: { code:'USD', symbol:'$',    name:'US Dollar',       rate:1 },
  EUR: { code:'EUR', symbol:'€',    name:'Euro',            rate:0.92 },
  GBP: { code:'GBP', symbol:'£',    name:'British Pound',   rate:0.79 },
  JPY: { code:'JPY', symbol:'¥',    name:'Japanese Yen',    rate:154.32 },
  CAD: { code:'CAD', symbol:'C$',   name:'Canadian Dollar', rate:1.37 },
  AUD: { code:'AUD', symbol:'A$',   name:'Australian Dollar',rate:1.52 },
  CNY: { code:'CNY', symbol:'¥',    name:'Chinese Yuan',    rate:7.24 },
  INR: { code:'INR', symbol:'₹',    name:'Indian Rupee',    rate:83.45 },
  AED: { code:'AED', symbol:'د.إ',  name:'UAE Dirham',      rate:3.67 },
  SAR: { code:'SAR', symbol:'ر.س',  name:'Saudi Riyal',     rate:3.75 },
  EGP: { code:'EGP', symbol:'ج.م',  name:'Egyptian Pound',  rate:48.50 },
};

export function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = CURRENCIES[fromCurrency]?.rate || 1;
  const toRate   = CURRENCIES[toCurrency]?.rate   || 1;
  return amount * (toRate / fromRate);
}

export function formatCurrencyWithRate(amount, currency = null) {
  const targetCurrency = currency || (_systemConfig?.currency) || 'USD';
  const info = CURRENCIES[targetCurrency];
  return `${info?.symbol || '$'}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export async function fetchLatestExchangeRates() {
  try {
    const res = await fetch(`${API_BASE}/currency-rates`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (data?.rates) {
      Object.entries(data.rates).forEach(([code, rate]) => {
        if (CURRENCIES[code]) CURRENCIES[code].rate = rate;
      });
      emitEvent('currency_rates_updated', { rates: data.rates });
      return { success: true };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ─────────────────────────────────────────────
//  System config — read/write via API
// ─────────────────────────────────────────────

let _systemConfig = null;

const defaultSystemConfig = {
  companyName: 'Logistics ERP', currency: 'USD',
  language: 'en', emailNotifications: false,
};

export function getSystemConfig() {
  return _systemConfig || { ...defaultSystemConfig };
}

export async function fetchSystemConfig() {
  try {
    const res = await api.get('/settings/config');
    _systemConfig = res.data || { ...defaultSystemConfig };
    return _systemConfig;
  } catch {
    return { ...defaultSystemConfig };
  }
}

export async function updateSystemConfig(config) {
  const res = await api.put('/settings/config', config);
  _systemConfig = res.data;
  emitEvent('config_changed', _systemConfig);
  return _systemConfig;
}

// ─────────────────────────────────────────────
//  PDF generation (client-side, identical to original)
// ─────────────────────────────────────────────
export async function generatePDF(type, data) {
  const escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let bodyHtml = '';
  const title = (type || 'Document').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (['invoice','quotation','sales_order'].includes(type)) {
    const lines = (data.lineItems || data.lines || []).map(li =>
      `<tr><td>${escHtml(li.description || li.name)}</td><td style="text-align:right">${fmt(li.quantity || 1)}</td><td style="text-align:right">${fmt(li.unit_price || li.unitPrice || li.price)}</td><td style="text-align:right">${fmt(li.amount)}</td></tr>`
    ).join('');
    bodyHtml = `
      <h2 style="margin:0 0 4px">${escHtml(title)} ${escHtml(data.number || '')}</h2>
      <p style="color:#64748b;margin:0 0 16px">Date: ${escHtml(data.date || data.created_at?.slice(0,10) || '')}</p>
      <p><strong>Customer:</strong> ${escHtml(data.company_name || data.customerName || '')}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr style="background:#f1f5f9">
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Description</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Qty</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Unit Price</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0">Amount</th>
        </tr></thead>
        <tbody>${lines}</tbody>
        <tfoot>
          <tr><td colspan="3" style="text-align:right;padding:8px;font-weight:bold">Total</td>
              <td style="text-align:right;padding:8px;font-weight:bold">${fmt(data.total || data.grand_total)}</td></tr>
        </tfoot>
      </table>
      ${data.notes ? `<p style="margin-top:16px;color:#64748b">${escHtml(data.notes)}</p>` : ''}`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>body{font-family:sans-serif;padding:32px;color:#1e293b}table{width:100%;border-collapse:collapse}</style>
    </head><body>${bodyHtml}</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) win.onload = () => { URL.revokeObjectURL(url); };
  return { success: true };
}

// ─────────────────────────────────────────────
//  CSV export (unchanged)
// ─────────────────────────────────────────────
export function exportToCSV(data, filename) {
  if (!data?.length) return;
  const headers = Object.keys(data[0]);
  const rows    = [headers.join(','), ...data.map(row =>
    headers.map(h => `"${String(row[h] ?? '').replace(/"/g,'""')}"`).join(',')
  )];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
//  Email — now a real API call
// ─────────────────────────────────────────────
export async function sendEmail(to, subject, body, template = 'default') {
  try {
    const res = await api.post('/email/send', { to, subject, body, template });
    return { success: true, ...res };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ─────────────────────────────────────────────
//  Legacy shims — async wrappers around api calls
//  Components can migrate gradually to `api.*` calls
// ─────────────────────────────────────────────

async function _list(path) {
  const res = await api.get(path);
  return Array.isArray(res.data) ? res.data : [];
}

// Like _list but silently returns [] for 403 (role not permitted) and 404.
// Use this for endpoints that only some roles can access — so the UI degrades
// gracefully (e.g. tax-configs shows manual input, dashboard hides finance tiles)
// instead of throwing an uncaught error that breaks the component.
async function _listPermissive(path) {
  try {
    const qs = path.includes('?') ? '' : '';
    const res = await apiFetch(path);
    if (res.status === 403 || res.status === 404) return [];
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch {}
      throw new Error(formatApiError(body, res.statusText));
    }
    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    // Network errors or unexpected failures — return empty rather than crashing
    if (err.message && (err.message.includes('403') || err.message.includes('Forbidden'))) return [];
    throw err;
  }
}

// The /opportunities API stores fields in snake_case (bl_number, company_id,
// customer_id, company_name, customer_name, industrial_sector, cost_estimate,
// expected_close_date, lost_reason, assigned_to, ...) but the UI components
// read/write camelCase. Normalize on the way in so the UI always sees
// camelCase, regardless of which casing the API returns.
function normalizeOpportunity(o) {
  if (!o || typeof o !== 'object') return o;
  const companyId  = o.companyId  ?? o.company_id  ?? o.customerId ?? o.customer_id ?? '';
  const customerId = o.customerId ?? o.customer_id ?? o.companyId  ?? o.company_id  ?? '';
  const companyName  = o.companyName  ?? o.company_name  ?? o.customerName ?? o.customer_name ?? '';
  const customerName = o.customerName ?? o.customer_name ?? o.companyName  ?? o.company_name  ?? '';
  return {
    ...o,
    blNumber: o.blNumber ?? o.bl_number ?? '',
    companyId,
    customerId,
    companyName,
    customerName,
    industrialSector: o.industrialSector ?? o.industrial_sector ?? '',
    costEstimate: o.costEstimate ?? o.cost_estimate ?? 0,
    expectedCloseDate: o.expectedCloseDate ?? o.expected_close_date ?? '',
    lostReason: o.lostReason ?? o.lost_reason ?? '',
    assignedTo: o.assignedTo ?? o.assigned_to ?? '',
    createdAt: o.createdAt ?? o.created_at,
    updatedAt: o.updatedAt ?? o.updated_at,
  };
}

// ─────────────────────────────────────────────
//  Quotation normalization
//  The backend stores snake_case fields (company_id, line_items,
//  operation_confirmed, total_currency, etc.) but the UI reads/writes
//  camelCase (companyId, lineItems, operationConfirmed, totalCurrency).
//  Also derive boolean "stage" flags from `status` so the operation
//  workflow (approve -> convert to sales order) renders correctly
//  regardless of which casing/shape the API returns.
// ─────────────────────────────────────────────
function normalizeQuotation(q) {
  if (!q || typeof q !== 'object') return q;

  const companyId   = q.companyId   ?? q.company_id   ?? '';
  const companyName = q.companyName ?? q.company_name ?? '';
  const opportunityId    = q.opportunityId    ?? q.opportunity_id    ?? null;
  const opportunityTitle = q.opportunityTitle ?? q.opportunity_title ?? '';
  const lineItems = q.lineItems ?? q.line_items ?? [];
  const status = q.status ?? 'draft';

  const operationConfirmed = q.operationConfirmed ?? q.operation_confirmed ??
    ['approved', 'confirmed', 'converted'].includes(status);
  const accountingConfirmed = q.accountingConfirmed ?? q.accounting_confirmed ?? false;
  const convertedToSalesOrder = q.convertedToSalesOrder ?? q.converted_to_sales_order ??
    (status === 'converted');

  return {
    ...q,
    companyId,
    companyName,
    opportunityId,
    opportunityTitle,
    lineItems,
    status,
    operationConfirmed,
    accountingConfirmed,
    convertedToSalesOrder,
    taxRate:   q.taxRate   ?? q.tax_rate   ?? 0,
    taxAmount: q.taxAmount ?? q.tax_amount ?? 0,
    validUntil: q.validUntil ?? q.valid_until ?? null,
    displayCurrency: q.displayCurrency ?? q.display_currency ?? 'USD',
    totalCurrency: q.totalCurrency ?? q.total_currency ?? q.currency ?? 'USD',
    currencyTotals: q.currencyTotals ?? q.currency_totals ?? {},
    createdAt: q.createdAt ?? q.created_at,
    updatedAt: q.updatedAt ?? q.updated_at,
  };
}

export const getUsers         = () => _listPermissive('/users');
export const getCompanies     = () => _list('/companies');
export const getContacts      = () => _list('/contacts');
export const getInvoices      = () => _list('/invoices');
export const getQuotations    = async () => (await _list('/quotations')).map(normalizeQuotation);
export const getSalesOrders   = () => _list('/sales-orders');
export const getPayments      = () => _listPermissive('/payments');
export const getExpenses      = () => _listPermissive('/expenses');
export const getAccounts      = () => _listPermissive('/accounts');
export const getJournalEntries= () => _listPermissive('/journal-entries');
export const getTaxConfigs    = () => _listPermissive('/tax-configs');
export const getOpportunities = async () => (await _list('/opportunities')).map(normalizeOpportunity);
export const getCostItems     = () => _listPermissive('/cost-items');
export const getPurchaseCosts = () => _listPermissive('/purchase-costs');
export const getAuditLogs     = () => _listPermissive('/audit-logs');
export const getNotifications = (userId) => _listPermissive(`/notifications${userId ? `?user_id=${userId}` : ''}`);

export async function saveUser(user) {
  // Backend expects snake_case for this field; map it so it isn't silently
  // stripped by the Zod schema (zod drops unrecognized keys by default).
  const { whatsappPhone, ...rest } = user;
  const payload = { ...rest };
  if (whatsappPhone !== undefined) payload.whatsapp_phone = whatsappPhone;

  if (user.id) { const r = await api.put(`/users/${user.id}`, payload); return r.data; }
  const r = await api.post('/users', payload); return r.data;
}
export const deleteUser = (id) => api.delete(`/users/${id}`);

export async function saveCompany(company) {
  if (company.id) { const r = await api.put(`/companies/${company.id}`, company); return r.data; }
  const r = await api.post('/companies', company); return r.data;
}
export const deleteCompany = (id) => api.delete(`/companies/${id}`);

export async function saveInvoice(invoice) {
  if (invoice.id) { const r = await api.put(`/invoices/${invoice.id}`, invoice); return r.data; }
  const r = await api.post('/invoices', invoice); return r.data;
}
export const deleteInvoice = (id) => api.delete(`/invoices/${id}`);

export async function getNextQuotationNumber() {
  try {
    const r = await api.get('/quotations', { limit: 1, sort: 'created_at:desc' });
    const last = r.data?.[0]?.number;
    if (last) {
      const num = parseInt(last.replace(/\D/g, ''), 10);
      if (!isNaN(num)) return `QT-${String(num + 1).padStart(5, '0')}`;
    }
  } catch {}
  return `QT-${String(Date.now()).slice(-5)}`;
}

export async function saveQuotation(q) {
  // Ensure number is always set — the DB has a NOT NULL constraint on quotations.number
  const payload = { ...q };
  if (!payload.number) {
    payload.number = await getNextQuotationNumber();
  }
  // Normalize snake_case fields the backend may expect
  payload.company_id        = payload.company_id        ?? payload.companyId        ?? null;
  payload.company_name      = payload.company_name      ?? payload.companyName      ?? '';
  payload.opportunity_id    = payload.opportunity_id    ?? payload.opportunityId    ?? null;
  payload.opportunity_title = payload.opportunity_title ?? payload.opportunityTitle ?? '';
  payload.tax_rate          = payload.tax_rate          ?? payload.taxRate          ?? 0;
  payload.tax_amount        = payload.tax_amount        ?? payload.taxAmount        ?? 0;
  payload.valid_until       = payload.valid_until       ?? payload.validUntil       ?? null;
  payload.display_currency  = payload.display_currency  ?? payload.displayCurrency  ?? 'USD';
  payload.total_currency    = payload.total_currency    ?? payload.totalCurrency    ?? payload.currency ?? 'USD';
  payload.line_items         = payload.line_items         ?? payload.lineItems         ?? [];
  payload.currency_totals    = payload.currency_totals    ?? payload.currencyTotals    ?? {};
  payload.operation_confirmed    = payload.operation_confirmed    ?? payload.operationConfirmed    ?? false;
  payload.accounting_confirmed   = payload.accounting_confirmed   ?? payload.accountingConfirmed   ?? false;
  payload.converted_to_sales_order = payload.converted_to_sales_order ?? payload.convertedToSalesOrder ?? false;

  if (payload.id) { const r = await api.put(`/quotations/${payload.id}`, payload); return normalizeQuotation(r.data); }
  const r = await api.post('/quotations', payload); return normalizeQuotation(r.data);
}
export const deleteQuotation = (id) => api.delete(`/quotations/${id}`);

export async function saveSalesOrder(so) {
  if (so.id) { const r = await api.put(`/sales-orders/${so.id}`, so); return r.data; }
  const r = await api.post('/sales-orders', so); return r.data;
}
export const deleteSalesOrder = (id) => api.delete(`/sales-orders/${id}`);

export async function savePayment(p) {
  if (p.id) { const r = await api.put(`/payments/${p.id}`, p); return r.data; }
  const r = await api.post('/payments', p); return r.data;
}
export const deletePayment = (id) => api.delete(`/payments/${id}`);

export async function saveJournalEntry(entry) {
  if (entry.id) { const r = await api.put(`/journal-entries/${entry.id}`, entry); return r.data; }
  const r = await api.post('/journal-entries', entry); return r.data;
}
export const deleteJournalEntry = (id) => api.delete(`/journal-entries/${id}`);

export async function addNotification(userId, title, message, type = 'info', link = null) {
  return api.post('/notifications', { user_id: userId, title, message, type, link });
}
export async function markNotificationRead(id) {
  return api.put(`/notifications/${id}`, { is_read: 1 });
}
export async function markAllNotificationsRead(userId) {
  return api.post('/notifications/mark-all-read', { user_id: userId });
}

export function addAuditLog(action, entityType, entityId, details) {
  // Fire-and-forget — backend auto-logs on all mutations
  api.post('/audit-logs', {
    action, entity_type: entityType, entity_id: entityId,
    details: JSON.stringify(details), user_id: _currentUser?.id,
  }).catch(() => {});
}

// Ownership helpers — kept for UI conditional rendering
export function isCompanyOwner(user, company) {
  if (!user || !company) return false;
  return company.owner_id === user.id || company.created_by === user.id;
}
export function canManageCompany(user, company, action = 'write') {
  if (!user) return false;
  if (hasPermission(user.role, 'companies', action)) {
    if (user.role === 'contact') {
      if (!company?.id) return action === 'write';
      return isCompanyOwner(user, company);
    }
    return true;
  }
  return false;
}
export function canManageCompanyContact(user, companyId) {
  if (!user) return false;
  if (hasPermission(user.role, 'contacts', 'write')) {
    if (user.role === 'contact') return false; // requires ownership — checked server-side
    return true;
  }
  return false;
}

// Misc helpers used across components
export function getVisibleCompanies(user) {
  // Async — components should use `await api.get('/companies')` directly
  return getCompanies();
}
export function getCompanyEmployees() { return []; }
export function getEmployeesWithWhatsApp() { return getUsers().then(u => u.filter(x => x.whatsapp_phone)); }
export function getCompanyContacts(companyId) {
  return _list(`/contacts${companyId ? `?company_id=${companyId}` : ''}`);
}
export function shouldUpdateCurrencyRates() { return true; }
export const autoUpdateCurrencyRatesIfNeeded = fetchLatestExchangeRates;
export function getCurrencyRatesLastUpdated() { return null; }
export function getRolePermissionOverrides() { return _roleOverrides; }
export async function saveRolePermissionOverrides(overrides) {
  await api.put('/settings/role-permission-overrides', overrides);
  _roleOverrides = overrides;
  emitEvent('role_permissions_changed', overrides);
}
export async function resetRolePermissions() {
  await api.delete('/settings/role-permission-overrides');
  _roleOverrides = {};
  emitEvent('role_permissions_changed', {});
}

// ─────────────────────────────────────────────────────────────────────────────
//  Missing exports — added to satisfy component imports
// ─────────────────────────────────────────────────────────────────────────────

// Accounts (Chart of Accounts)
export async function saveAccount(account) {
  if (account.id) { const r = await api.put(`/accounts/${account.id}`, account); return r.data; }
  const r = await api.post('/accounts', account); return r.data;
}
export const deleteAccount = (id) => api.delete(`/accounts/${id}`);
export async function getARBreakdown() {
  try {
    const r = await api.get('/invoices', { limit: 200 });
    return (r.data || []).filter(inv => inv.status !== 'paid');
  } catch { return []; }
}
export async function getAPBreakdown() {
  try {
    const r = await api.get('/purchase-costs', { limit: 200 });
    return (r.data || []).filter(pc => pc.status !== 'paid');
  } catch { return []; }
}

// Contacts / Company Contacts
export async function saveCompanyContact(contact) {
  const payload = {
    ...contact,
    company_id:
      contact.company_id ||
      contact.companyId
  };

  if (!payload.company_id) {
    throw new Error('company_id is required');
  }

  if (payload.id) {
    const r = await api.put(`/contacts/${payload.id}`, payload);
    return r.data;
  }

  const r = await api.post('/contacts', payload);
  return r.data;
}
export const deleteCompanyContact = (id) => api.delete(`/contacts/${id}`);

// Expenses
export async function saveExpense(expense) {
  if (expense.id) { const r = await api.put(`/expenses/${expense.id}`, expense); return r.data; }
  const r = await api.post('/expenses', expense); return r.data;
}
export const deleteExpense = (id) => api.delete(`/expenses/${id}`);
export async function approveExpense(id) {
  return api.post(`/expenses/${id}/approve`, {});
}
export async function rejectExpense(id) {
  return api.post(`/expenses/${id}/reject`, {});
}

// Tax Config
export async function saveTaxConfig(tc) {
  if (tc.id) { const r = await api.put(`/tax-configs/${tc.id}`, tc); return r.data; }
  const r = await api.post('/tax-configs', tc); return r.data;
}
export const deleteTaxConfig = (id) => api.delete(`/tax-configs/${id}`);

// Cost Items
export async function saveCostItem(item) {
  if (item.id) { const r = await api.put(`/cost-items/${item.id}`, item); return r.data; }
  const r = await api.post('/cost-items', item); return r.data;
}
export const deleteCostItem = (id) => api.delete(`/cost-items/${id}`);
export async function approveCostItem(id, status = 'approved') {
  return api.put(`/cost-items/${id}`, { status });
}

// Purchase Costs
export async function savePurchaseCost(pc) {
  if (pc.id) { const r = await api.put(`/purchase-costs/${pc.id}`, pc); return r.data; }
  const r = await api.post('/purchase-costs', pc); return r.data;
}
export async function confirmPurchaseCost(id) {
  return api.post(`/purchase-costs/${id}/confirm`, {});
}

// Journal Entries
export async function postJournalEntry(id) {
  return api.post(`/journal-entries/${id}/post`, {});
}

// Payments — ledger / wallet helpers
export async function getCustomerLedger(companyId) {
  const [invR, payR] = await Promise.all([
    api.get('/invoices', { company_id: companyId, limit: 200 }),
    api.get('/payments', { company_id: companyId, limit: 200 }),
  ]);
  return { invoices: invR.data, payments: payR.data };
}
export async function getVendorLedger(companyId) {
  const [pcR, payR] = await Promise.all([
    api.get('/purchase-costs', { company_id: companyId, limit: 200 }),
    api.get('/payments', { company_id: companyId, limit: 200 }),
  ]);
  return { purchaseCosts: pcR.data, payments: payR.data };
}
export async function getCustomerWalletBalance(companyId) {
  const r = await api.get('/payments', { company_id: companyId, type: 'credit', limit: 200 });
  return r.data.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}
export async function getCustomerWalletTransactions(companyId) {
  const r = await api.get('/payments', { company_id: companyId, type: 'credit', limit: 200 });
  return r.data;
}
export async function applyContactPayment(invoiceId, paymentId) {
  return api.put(`/invoices/${invoiceId}`, { payment_id: paymentId, status: 'paid' });
}
export async function applyVendorPayment(purchaseCostId, paymentId) {
  return api.put(`/purchase-costs/${purchaseCostId}`, { payment_id: paymentId, status: 'paid' });
}
export async function useFromCustomerWallet(companyId, amount, invoiceId) {
  return api.post('/payments', {
    company_id: companyId, amount, type: 'wallet_debit',
    reference_id: invoiceId, status: 'applied',
  });
}

// Reports
export async function getReportsData() {
  // Each endpoint is fetched independently and silently returns [] on 403
  // so roles that lack access to payments/journal-entries don't crash the Dashboard.
  const safe = async (path, params = {}) => {
    try {
      const res = await apiFetch(path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''));
      if (res.status === 403 || res.status === 404) return [];
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [];
    } catch { return []; }
  };
  const [invoices, payments, expenses, journalEntries] = await Promise.all([
    safe('/invoices',        { limit: 200 }),
    safe('/payments',        { limit: 200 }),
    safe('/expenses',        { limit: 200 }),
    safe('/journal-entries', { limit: 200 }),
  ]);
  return { invoices, payments, expenses, journalEntries };
}

// Chats (internal chat)
export async function getChats(refId) {
  const params = { limit: 200 };
  if (refId) params.ref_id = refId;
  const r = await api.get('/chat-messages', params);
  return Array.isArray(r.data) ? r.data : [];
}
export async function sendChatMessage(message) {
  // Normalize payload: InternalChat sends {refId, refType, text, senderId, senderRole, senderName}
  // but the DB schema uses {user_id, user_name, content, room, ref_id, ref_type, sender_id, sender_role, sender_name}
  const payload = {
    user_id:     message.senderId   || message.user_id   || _currentUser?.id,
    user_name:   message.senderName || message.user_name  || _currentUser?.name || '',
    content:     message.text       || message.content,
    room:        message.refId      || message.room       || 'general',
    ref_id:      message.refId      || message.ref_id,
    ref_type:    message.refType    || message.ref_type   || 'general',
    sender_id:   message.senderId   || message.sender_id  || _currentUser?.id,
    sender_role: message.senderRole || message.sender_role || _currentUser?.role,
    sender_name: message.senderName || message.sender_name || _currentUser?.name,
  };
  const r = await api.post('/chat-messages', payload);
  return r.data;
}
export async function markChatRead(id) {
  return api.put(`/chat-messages/${id}`, { is_read: 1 });
}
export async function getOpportunityChatReplies(opportunityId) {
  const r = await api.get('/chat-messages', { ref_id: opportunityId, limit: 100 });
  return r.data;
}

// Custom contact sources (Settings)
export async function getCustomContactSources() {
  try {
    const r = await api.get('/settings/config');
    const raw = r.data?.customContactSources;
    return Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
  } catch { return []; }
}
export async function saveCustomContactSource(source) {
  const current = await getCustomContactSources();
  const updated = source.id
    ? current.map(s => s.id === source.id ? source : s)
    : [...current, { ...source, id: Date.now().toString() }];
  await api.put('/settings/config', { customContactSources: updated });
  return updated;
}
export async function deleteCustomContactSource(id) {
  const current = await getCustomContactSources();
  const updated = current.filter(s => s.id !== id);
  await api.put('/settings/config', { customContactSources: updated });
  return updated;
}

// Currency rate management
export async function updateCurrencyRate(currency, rate) {
  const current = _exchangeRates || {};
  const updated = { ...current, [currency]: rate };
  _exchangeRates = updated;
  emitEvent('currency_rates_updated', { rates: updated });
  return updated;
}

// Quotation expiry checker (no-op stubs — logic lives in components)
export function startQuotationExpiryChecker() {}
export function stopQuotationExpiryChecker() {}

// ─────────────────────────────────────────────────────────────────────────────
//  Remaining missing exports — batch 2
// ─────────────────────────────────────────────────────────────────────────────

// Opportunities
export async function saveOpportunity(opp) {
  // Send ONLY the snake_case fields the DB columns expect.
  // Sending extra camelCase keys causes Zod strict-mode backends to return 500.
  // camelCase values from the UI are mapped to their snake_case equivalents here.
  const payload = {
    ...(opp.id ? { id: opp.id } : {}),
    title:               opp.title               ?? '',
    description:         opp.description         ?? '',
    stage:               opp.stage               ?? 'prospecting',
    status:              opp.status              ?? 'active',
    priority:            opp.priority            ?? 'medium',
    probability:         opp.probability         ?? 0,
    value:               opp.value               ?? 0,
    currency:            opp.currency            ?? 'USD',
    notes:               opp.notes               ?? '',
    tags:                opp.tags                ?? [],
    bl_number:           opp.blNumber            ?? opp.bl_number            ?? '',
    company_id:          opp.companyId           ?? opp.company_id           ?? opp.customerId  ?? opp.customer_id  ?? null,
    customer_id:         opp.customerId          ?? opp.customer_id          ?? opp.companyId   ?? opp.company_id   ?? null,
    company_name:        opp.companyName         ?? opp.company_name         ?? opp.customerName ?? opp.customer_name ?? '',
    customer_name:       opp.customerName        ?? opp.customer_name        ?? opp.companyName  ?? opp.company_name  ?? '',
    industrial_sector:   opp.industrialSector    ?? opp.industrial_sector    ?? '',
    cost_estimate:       opp.costEstimate        ?? opp.cost_estimate        ?? 0,
    expected_close_date: opp.expectedCloseDate   ?? opp.expected_close_date  ?? null,
    lost_reason:         opp.lostReason          ?? opp.lost_reason          ?? '',
    assigned_to:         opp.assignedTo          ?? opp.assigned_to          ?? null,
    created_at:          opp.createdAt           ?? opp.created_at           ?? new Date().toISOString(),
    updated_at:          new Date().toISOString(),
  };
  if (opp.id) { const r = await api.put(`/opportunities/${opp.id}`, payload); return normalizeOpportunity(r.data); }
  const r = await api.post('/opportunities', payload); return normalizeOpportunity(r.data);
}
export const deleteOpportunity = (id) => api.delete(`/opportunities/${id}`);

// Activities (CRM tasks, calls, meetings, etc.)
export async function getActivities(refId) {
  const r = await api.get('/activities', refId ? { ref_id: refId, limit: 200 } : { limit: 200 });
  return Array.isArray(r.data) ? r.data : [];
}
export async function saveActivity(activity) {
  const payload = {
    ...activity,
    ref_id:   activity.refId   || activity.ref_id,
    ref_type: activity.refType || activity.ref_type || 'opportunity',
  };
  if (payload.id) { const r = await api.put(`/activities/${payload.id}`, payload); return r.data; }
  const r = await api.post('/activities', payload); return r.data;
}
export const deleteActivity = (id) => api.delete(`/activities/${id}`);

// Internal memos
export async function getInternalMemos(refId) {
  const r = await api.get('/internal-memos', refId ? { ref_id: refId, limit: 100 } : { limit: 100 });
  return Array.isArray(r.data) ? r.data : [];
}
export async function saveInternalMemo(memo) {
  // The DB requires ref_id NOT NULL. Use quotationId first, fall back to opportunityId.
  // Also send ref_type so the backend knows what the ref points to.
  const payload = {
    ...memo,
    ref_id:   memo.ref_id   ?? memo.quotationId   ?? memo.opportunityId ?? null,
    ref_type: memo.ref_type ?? (memo.quotationId ? 'quotation' : 'opportunity'),
    // Normalize snake_case aliases the backend may expect
    quotation_id:      memo.quotation_id      ?? memo.quotationId      ?? null,
    quotation_number:  memo.quotation_number  ?? memo.quotationNumber  ?? '',
    opportunity_id:    memo.opportunity_id    ?? memo.opportunityId    ?? null,
    opportunity_title: memo.opportunity_title ?? memo.opportunityTitle ?? '',
    company_id:        memo.company_id        ?? memo.companyId        ?? null,
    company_name:      memo.company_name      ?? memo.companyName      ?? '',
    tax_rate:          memo.tax_rate          ?? memo.taxRate          ?? 0,
    tax_amount:        memo.tax_amount        ?? memo.taxAmount        ?? 0,
    display_currency:  memo.display_currency  ?? memo.displayCurrency  ?? 'USD',
    created_by:        memo.created_by        ?? memo.createdBy        ?? null,
    is_aggregate:      memo.is_aggregate      ?? memo.isAggregate      ?? false,
    profit_by_currency: memo.profit_by_currency ?? memo.profitByCurrency ?? {},
    quotation_ids:     memo.quotation_ids     ?? memo.quotationIds     ?? [],
    total_purchase_cost: memo.total_purchase_cost ?? memo.totalPurchaseCost ?? 0,
  };
  if (!payload.ref_id) {
    throw new Error('saveInternalMemo: ref_id is required (quotationId or opportunityId must be set)');
  }
  if (payload.id) { const r = await api.put(`/internal-memos/${payload.id}`, payload); return r.data; }
  const r = await api.post('/internal-memos', payload); return r.data;
}

// Company attachments
export async function getCompanyAttachments(companyId) {
  const r = await api.get('/company-attachments', companyId ? { company_id: companyId, limit: 100 } : { limit: 100 });
  return Array.isArray(r.data) ? r.data : [];
}
export async function saveCompanyAttachment(att) {
  if (att.id) { const r = await api.put(`/company-attachments/${att.id}`, att); return r.data; }
  const r = await api.post('/company-attachments', att); return r.data;
}
export const deleteCompanyAttachment = (id) => api.delete(`/company-attachments/${id}`);

// Invoice helpers
export async function updateInvoiceStatus(id, status) {
  const r = await api.put(`/invoices/${id}`, { status });
  return r.data;
}
export async function confirmInvoice(id) {
  return api.put(`/invoices/${id}`, { status: 'confirmed' });
}
export async function applyPaymentToInvoice(invoiceId, amount) {
  const inv = await api.get(`/invoices/${invoiceId}`);
  const paid = (Number(inv.data?.amount_paid) || 0) + Number(amount);
  const status = paid >= (Number(inv.data?.total) || 0) ? 'paid' : 'partial';
  return api.put(`/invoices/${invoiceId}`, { amount_paid: paid, status });
}
export async function issueCreditNote(invoiceId, reason, amount) {
  // Create a new negative invoice as credit note
  const orig = (await api.get(`/invoices/${invoiceId}`)).data;
  const r = await api.post('/invoices', {
    number:     `CN-${Date.now()}`,
    company_id: orig?.company_id,
    company_name: orig?.company_name,
    date:       new Date().toISOString().slice(0, 10),
    total:      -(Number(amount) || 0),
    subtotal:   -(Number(amount) || 0),
    status:     'confirmed',
    notes:      reason || `Credit note for invoice ${orig?.number}`,
    sales_order_id: orig?.sales_order_id,
  });
  return r.data;
}
export async function sendInvoiceEmail(invoice) {
  // No email backend — log and return ok
  console.log('[sendInvoiceEmail] would send invoice', invoice?.number);
  return { ok: true };
}
export async function getNextInvoiceNumber() {
  try {
    const r = await api.get('/invoices', { limit: 1 });
    const last = r.data?.[0]?.number;
    if (last) {
      const num = parseInt(last.replace(/\D/g, ''), 10);
      if (!isNaN(num)) return `INV-${String(num + 1).padStart(5, '0')}`;
    }
  } catch {}
  return `INV-${String(Date.now()).slice(-5)}`;
}
export async function isInvoiceNumberUnique(number, excludeId) {
  try {
    const r = await api.get('/invoices', { limit: 200 });
    return !r.data.some(inv => inv.number === number && inv.id !== excludeId);
  } catch { return true; }
}

// Quotation helpers
//
// Operation workflow:
//   draft --(operation approves)--> approved/operationConfirmed=true
//   approved --(operation converts)--> sales order created, status=converted,
//                                       convertedToSalesOrder=true
export async function confirmQuotation(id) {
  const r = await api.put(`/quotations/${id}`, {
    status: 'approved',
    operation_confirmed: true,
  });
  return normalizeQuotation(r.data);
}

export async function convertQuotationToSalesOrder(quotationId) {
  const q = normalizeQuotation((await api.get(`/quotations/${quotationId}`)).data);

  if (!q) throw new Error('Quotation not found');
  if (!q.operationConfirmed) {
    throw new Error('Quotation must be approved by Operations before it can be converted to a Sales Order');
  }
  if (q.convertedToSalesOrder) {
    throw new Error('Quotation has already been converted to a Sales Order');
  }

  const defaultCur = q.totalCurrency || q.currency || 'USD';
  const lineItems = (q.lineItems || []).map(item => ({
    ...item,
    currency: item.currency || defaultCur,
  }));

  const subtotal   = Number(q.subtotal)   || 0;
  const taxAmount  = Number(q.taxAmount)  || 0;
  const discount   = Number(q.discount)   || 0;
  const total      = Number(q.total)      || (subtotal + taxAmount - discount);
  const orderNumber = `SO-${Date.now()}`;

  const payload = {
    number:          orderNumber,
    quotation_id:    quotationId,
    quotationId:     quotationId,
    quotation_number: q.number,
    quotationNumber: q.number,
    opportunity_id:  q.opportunityId,
    opportunityId:   q.opportunityId,
    company_id:      q.companyId,
    companyId:       q.companyId,
    company_name:    q.companyName,
    companyName:     q.companyName,
    date:            new Date().toISOString().slice(0, 10),
    currency:        defaultCur,
    total_currency:  defaultCur,
    totalCurrency:   defaultCur,
    currency_totals: q.currencyTotals || {},
    currencyTotals:  q.currencyTotals || {},
    subtotal,
    tax_rate:        q.taxRate ?? 0,
    taxRate:         q.taxRate ?? 0,
    tax_amount:      taxAmount,
    taxAmount:       taxAmount,
    discount,
    total,
    line_items:      lineItems,
    lineItems:       lineItems,
    notes:           q.notes || '',
    status:          'draft',
    confirmed:       false,
  };

  const r = await api.post('/sales-orders', payload);

  // Mark quotation as converted
  await api.put(`/quotations/${quotationId}`, {
    status: 'converted',
    converted_to_sales_order: true,
  });

  return r.data;
}

// Sales order helpers
export async function confirmSalesOrder(id) {
  return api.put(`/sales-orders/${id}`, { status: 'confirmed' });
}
export async function convertSalesOrderToInvoice(salesOrderId) {
  const so = (await api.get(`/sales-orders/${salesOrderId}`)).data;
  const r = await api.post('/invoices', {
    number:        `INV-${Date.now()}`,
    sales_order_id: salesOrderId,
    company_id:    so?.company_id,
    company_name:  so?.company_name,
    date:          new Date().toISOString().slice(0, 10),
    currency:      so?.currency || 'USD',
    subtotal:      so?.subtotal || 0,
    tax_amount:    so?.tax_amount || 0,
    discount:      so?.discount || 0,
    total:         so?.total || 0,
    notes:         so?.notes,
    status:        'draft',
  });
  await api.put(`/sales-orders/${salesOrderId}`, { status: 'invoiced' });
  return r.data;
}
export async function recordSalesOrderFulfillment(id, fulfillments, notes) {
  return api.put(`/sales-orders/${id}`, {
    status: 'fulfilled',
    notes: notes || undefined,
  });
}
