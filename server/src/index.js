// src/index.js
// Main Express server — wires up all routes, security middleware, error handling.

require('./db/schema'); // run schema creation immediately on boot

const express      = require('express');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const { makeRouter, clearColumnCache } = require('./routes/resource');
const db           = require('./db/schema');

// Clear column cache so that columns added by migrations are picked up
// (must happen after both schema.js and resource.js are fully loaded)
clearColumnCache();

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Security / CORS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Currency rates proxy (avoids browser CORS issues with frankfurter.app)
app.get('/api/currency-rates', async (req, res) => {
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch rates' });
  }
});

if (process.env.NODE_ENV !== 'development') {
  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  }));
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ─── Named routes (must be registered BEFORE generic resource routers) ───────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/users',           require('./routes/users'));
app.use('/api/journal-entries', require('./routes/journalEntries'));
app.use('/api/settings',        require('./routes/settings'));

// Custom action endpoints — registered before generic resource routers so they
// are matched first and never accidentally intercepted by a resource's POST /.
const { authenticate } = require('./middleware/auth');

// POST /api/notifications/mark-all-read
app.post('/api/notifications/mark-all-read', authenticate, (req, res) => {
  try {
    const userId = req.body.user_id || req.user.id;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/mark-all-read]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/expenses/:id/approve
app.post('/api/expenses/:id/approve', authenticate, (req, res) => {
  try {
    db.prepare("UPDATE expenses SET status='approved', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/expenses/:id/reject
app.post('/api/expenses/:id/reject', authenticate, (req, res) => {
  try {
    db.prepare("UPDATE expenses SET status='rejected', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cost-items/:id/approve
app.post('/api/cost-items/:id/approve', authenticate, (req, res) => {
  try {
    db.prepare("UPDATE cost_items SET status='approved', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/purchase-costs/:id/confirm
app.post('/api/purchase-costs/:id/confirm', authenticate, (req, res) => {
  try {
    db.prepare("UPDATE purchase_costs SET status='confirmed', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Generic resource routes ─────────────────────────────────────────────────
const resources = [
  ['/api/companies',           'companies',           'companies',       { ownerField: 'created_by' }],
  ['/api/contacts',            'company_contacts',    'contacts',        { ownerField: 'created_by' }],
  ['/api/invoices',            'invoices',            'invoices',        {}],
  ['/api/invoice-lines',       'invoice_lines',       'invoices',        {}],
  ['/api/quotations',          'quotations',          'quotations',      {}],
  ['/api/quotation-lines',     'quotation_lines',     'quotations',      {}],
  ['/api/sales-orders',        'sales_orders',        'salesOrders',     {}],
  ['/api/sales-order-lines',   'sales_order_lines',   'salesOrders',     {}],
  ['/api/payments',            'payments',            'payments',        {}],
  ['/api/expenses',            'expenses',            'expenses',        {}],
  ['/api/accounts',            'accounts',            'chartOfAccounts', {}],
  ['/api/tax-configs',         'tax_configs',         'taxConfig',       {}],
  ['/api/opportunities',       'opportunities',       'opportunities',   { ownerField: 'created_by' }],
  ['/api/cost-items',          'cost_items',          'costItems',       {}],
  ['/api/purchase-costs',      'purchase_costs',      'purchaseCosts',   {}],
  ['/api/purchase-cost-lines', 'purchase_cost_lines', 'purchaseCosts',   {}],
  ['/api/audit-logs',          'audit_logs',          'auditLogs',       {}],
  ['/api/notifications',       'notifications',       'notifications',   { ownerField: 'user_id' }],
  ['/api/chat-messages',       'chat_messages',       'notifications',   {}],
  ['/api/activities',          'activities',          'opportunities',   { ownerField: 'created_by' }],
  ['/api/internal-memos',      'internal_memos',      'quotations',      {}],
  ['/api/company-attachments', 'company_attachments', 'companies',       {}],
];

for (const [path, table, mod, opts] of resources) {
  app.use(path, makeRouter(table, mod, opts));
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
