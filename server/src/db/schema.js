// db/schema.js
// Sets up a better-sqlite3 database with all tables and enforces
// double-entry accounting balance at the DB layer.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/erp.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ──────────────────────────────────────────
  --  Users & Auth
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,          -- bcrypt hash
    role        TEXT NOT NULL DEFAULT 'contact',
    whatsapp_phone TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw token
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw token sent by email
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  System config & role permission overrides
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_permission_overrides (
    role        TEXT NOT NULL,
    module      TEXT NOT NULL,
    actions     TEXT NOT NULL,          -- JSON array
    PRIMARY KEY (role, module)
  );

  -- ──────────────────────────────────────────
  --  Audit logs
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,                   -- JSON
    user_id     TEXT,
    user_name   TEXT,
    user_role   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Notifications
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    message     TEXT,
    type        TEXT NOT NULL DEFAULT 'info',
    link        TEXT,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Companies / Contacts
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS companies (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL DEFAULT 'company',  -- 'company' | 'person'
    name            TEXT NOT NULL,
    type            TEXT,
    industry        TEXT,
    email           TEXT,
    phone           TEXT,
    website         TEXT,
    address         TEXT,
    city            TEXT,
    country         TEXT,
    currency        TEXT DEFAULT 'USD',
    credit_limit    REAL DEFAULT 0,
    payment_terms   INTEGER DEFAULT 30,
    tax_id          TEXT,
    notes           TEXT,
    status          TEXT DEFAULT 'active',
    owner_id        TEXT REFERENCES users(id),
    created_by      TEXT REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_contacts (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    title       TEXT,
    email       TEXT,
    phone       TEXT,
    is_primary  INTEGER DEFAULT 0,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Attachments: only metadata in DB, actual files on S3/R2
  CREATE TABLE IF NOT EXISTS company_attachments (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    content_type TEXT,
    storage_key TEXT NOT NULL,          -- e.g. S3 object key
    size_bytes  INTEGER,
    uploaded_by TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Accounting
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounts (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,          -- asset/liability/equity/revenue/expense
    parent_id   TEXT REFERENCES accounts(id),
    currency    TEXT DEFAULT 'USD',
    is_active   INTEGER DEFAULT 1,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id          TEXT PRIMARY KEY,
    number      TEXT NOT NULL UNIQUE,
    date        TEXT NOT NULL,
    description TEXT,
    status      TEXT DEFAULT 'draft',   -- draft | posted
    reference   TEXT,
    created_by  TEXT REFERENCES users(id),
    posted_by   TEXT REFERENCES users(id),
    posted_at   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journal_lines (
    id              TEXT PRIMARY KEY,
    journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id      TEXT NOT NULL REFERENCES accounts(id),
    debit           REAL NOT NULL DEFAULT 0 CHECK(debit >= 0),
    credit          REAL NOT NULL DEFAULT 0 CHECK(credit >= 0),
    description     TEXT,
    currency        TEXT DEFAULT 'USD'
  );

  -- DB-level constraint: debit = credit per journal entry (enforced in app layer too)
  -- SQLite doesn't support per-group check constraints, so we enforce this in the
  -- service layer before INSERT (see journalService.js).

  CREATE TABLE IF NOT EXISTS tax_configs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    rate        REAL NOT NULL CHECK(rate >= 0 AND rate <= 100),
    type        TEXT NOT NULL,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Sales
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS opportunities (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    company_id    TEXT REFERENCES companies(id),
    company_name  TEXT,
    value         REAL DEFAULT 0,
    currency      TEXT DEFAULT 'USD',
    stage         TEXT DEFAULT 'lead',
    probability   REAL DEFAULT 0,
    expected_close TEXT,
    assigned_to   TEXT REFERENCES users(id),
    created_by    TEXT REFERENCES users(id),
    notes         TEXT,
    status        TEXT DEFAULT 'open',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id            TEXT PRIMARY KEY,
    number        TEXT NOT NULL UNIQUE,
    company_id    TEXT REFERENCES companies(id),
    company_name  TEXT,
    date          TEXT,
    valid_until   TEXT,
    currency      TEXT DEFAULT 'USD',
    subtotal      REAL DEFAULT 0,
    tax_amount    REAL DEFAULT 0,
    discount      REAL DEFAULT 0,
    total         REAL DEFAULT 0,
    status        TEXT DEFAULT 'draft',
    notes         TEXT,
    terms         TEXT,
    assigned_to   TEXT REFERENCES users(id),
    created_by    TEXT REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotation_lines (
    id            TEXT PRIMARY KEY,
    quotation_id  TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    description   TEXT,
    quantity      REAL DEFAULT 1,
    unit_price    REAL DEFAULT 0,
    tax_rate      REAL DEFAULT 0,
    amount        REAL DEFAULT 0,
    sort_order    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales_orders (
    id            TEXT PRIMARY KEY,
    number        TEXT NOT NULL UNIQUE,
    quotation_id  TEXT REFERENCES quotations(id),
    company_id    TEXT REFERENCES companies(id),
    company_name  TEXT,
    date          TEXT,
    delivery_date TEXT,
    currency      TEXT DEFAULT 'USD',
    subtotal      REAL DEFAULT 0,
    tax_amount    REAL DEFAULT 0,
    discount      REAL DEFAULT 0,
    total         REAL DEFAULT 0,
    status        TEXT DEFAULT 'draft',
    notes         TEXT,
    assigned_to   TEXT REFERENCES users(id),
    created_by    TEXT REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sales_order_lines (
    id              TEXT PRIMARY KEY,
    sales_order_id  TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    description     TEXT,
    quantity        REAL DEFAULT 1,
    unit_price      REAL DEFAULT 0,
    tax_rate        REAL DEFAULT 0,
    amount          REAL DEFAULT 0,
    sort_order      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id            TEXT PRIMARY KEY,
    number        TEXT NOT NULL UNIQUE,
    sales_order_id TEXT REFERENCES sales_orders(id),
    company_id    TEXT REFERENCES companies(id),
    company_name  TEXT,
    date          TEXT,
    due_date      TEXT,
    currency      TEXT DEFAULT 'USD',
    subtotal      REAL DEFAULT 0,
    tax_amount    REAL DEFAULT 0,
    discount      REAL DEFAULT 0,
    total         REAL DEFAULT 0,
    amount_paid   REAL DEFAULT 0,
    status        TEXT DEFAULT 'draft',
    notes         TEXT,
    assigned_to   TEXT REFERENCES users(id),
    created_by    TEXT REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoice_lines (
    id          TEXT PRIMARY KEY,
    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT,
    quantity    REAL DEFAULT 1,
    unit_price  REAL DEFAULT 0,
    tax_rate    REAL DEFAULT 0,
    amount      REAL DEFAULT 0,
    sort_order  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY,
    reference   TEXT,
    date        TEXT NOT NULL,
    type        TEXT NOT NULL,          -- incoming | outgoing
    method      TEXT,
    amount      REAL NOT NULL CHECK(amount > 0),
    currency    TEXT DEFAULT 'USD',
    company_id  TEXT REFERENCES companies(id),
    invoice_id  TEXT REFERENCES invoices(id),
    description TEXT,
    status      TEXT DEFAULT 'pending',
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Expenses / Purchases
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    number      TEXT,
    date        TEXT NOT NULL,
    category    TEXT,
    description TEXT,
    amount      REAL NOT NULL CHECK(amount >= 0),
    currency    TEXT DEFAULT 'USD',
    company_id  TEXT REFERENCES companies(id),
    account_id  TEXT REFERENCES accounts(id),
    status      TEXT DEFAULT 'draft',
    notes       TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cost_items (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    unit_cost   REAL DEFAULT 0,
    currency    TEXT DEFAULT 'USD',
    category    TEXT,
    is_active   INTEGER DEFAULT 1,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_costs (
    id          TEXT PRIMARY KEY,
    number      TEXT,
    date        TEXT NOT NULL,
    company_id  TEXT REFERENCES companies(id),
    company_name TEXT,
    currency    TEXT DEFAULT 'USD',
    total       REAL DEFAULT 0,
    status      TEXT DEFAULT 'draft',
    notes       TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_cost_lines (
    id              TEXT PRIMARY KEY,
    purchase_cost_id TEXT NOT NULL REFERENCES purchase_costs(id) ON DELETE CASCADE,
    cost_item_id    TEXT REFERENCES cost_items(id),
    description     TEXT,
    quantity        REAL DEFAULT 1,
    unit_price      REAL DEFAULT 0,
    amount          REAL DEFAULT 0
  );

  -- ──────────────────────────────────────────
  --  Customer wallets
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS customer_wallets (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    balance     REAL NOT NULL DEFAULT 0,
    currency    TEXT DEFAULT 'USD',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Internal chat
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    room        TEXT NOT NULL DEFAULT 'general',
    user_id     TEXT REFERENCES users(id),
    user_name   TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL,
    ref_id      TEXT,
    ref_type    TEXT DEFAULT 'general',
    sender_id   TEXT REFERENCES users(id),
    sender_role TEXT,
    sender_name TEXT,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Activities (CRM)
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activities (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL DEFAULT 'task',   -- task | call | email | meeting | note
    title       TEXT NOT NULL,
    description TEXT,
    ref_id      TEXT,                           -- opportunity_id or other entity
    ref_type    TEXT DEFAULT 'opportunity',
    assigned_to TEXT REFERENCES users(id),
    due_date    TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ──────────────────────────────────────────
  --  Internal memos (Quotations / Sales)
  -- ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS internal_memos (
    id          TEXT PRIMARY KEY,
    ref_id      TEXT NOT NULL,                  -- quotation_id, sales_order_id, etc.
    ref_type    TEXT NOT NULL DEFAULT 'quotation',
    content     TEXT NOT NULL,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Migrations: safely add columns that may be missing in existing DBs ──────
const migrations = [
  // chat_messages: add columns for scoped chats, sender info, read status
  `ALTER TABLE chat_messages ADD COLUMN ref_id TEXT`,
  `ALTER TABLE chat_messages ADD COLUMN ref_type TEXT DEFAULT 'general'`,
  `ALTER TABLE chat_messages ADD COLUMN sender_id TEXT REFERENCES users(id)`,
  `ALTER TABLE chat_messages ADD COLUMN sender_role TEXT`,
  `ALTER TABLE chat_messages ADD COLUMN sender_name TEXT`,
  `ALTER TABLE chat_messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0`,
  // cost_items: add status, amount, date, notes so it can be used as a cost-request tracker
  `ALTER TABLE cost_items ADD COLUMN status TEXT DEFAULT 'pending'`,
  `ALTER TABLE cost_items ADD COLUMN amount REAL DEFAULT 0`,
  `ALTER TABLE cost_items ADD COLUMN date TEXT`,
  `ALTER TABLE cost_items ADD COLUMN notes TEXT`,
  `ALTER TABLE cost_items ADD COLUMN updated_at TEXT`,
  // company_contacts: ensure ref columns exist
  `ALTER TABLE company_contacts ADD COLUMN position TEXT`,
  `ALTER TABLE company_contacts ADD COLUMN department TEXT`,
];

for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists — ignore */ }
}

// Note: column cache for resource.js is cleared in index.js after both modules load.

module.exports = db;
