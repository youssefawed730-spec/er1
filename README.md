# ERP — Critical Security Fixes

This diff fixes all four **Critical** issues from the audit:

| # | Issue | Fix |
|---|-------|-----|
| 1 | Real backend + database | Express + better-sqlite3; all data in SQLite (drop-in, swap for PostgreSQL) |
| 2 | Secure authentication | bcrypt (SALT_ROUNDS=12), httpOnly JWT cookies, refresh-token rotation |
| 3 | Server-side authorization | RBAC middleware on every endpoint; 403 if role lacks permission |
| 4 | Data isolation | DB-scoped ownership (`created_by`, `owner_id`); contact role sees only own records |

---

## What changed

### New files
```
server/                         ← new backend (run separately)
  package.json
  .env.example
  src/
    index.js                    ← Express entry point
    db/
      schema.js                 ← SQLite schema + WAL mode + foreign keys
      seed.js                   ← seeds demo users with bcrypt hashes
    middleware/
      auth.js                   ← authenticate (JWT cookie) + authorize (RBAC)
    routes/
      auth.js                   ← login / refresh / logout / me
      users.js                  ← full user CRUD with bcrypt password handling
      journalEntries.js         ← double-entry balance enforced server-side
      resource.js               ← generic CRUD factory used by all other routes

src/data/store.js               ← REPLACED (was localStorage; now HTTP API client)
src/App.jsx                     ← updated to await initializeData() + session expiry
.env.example                    ← VITE_API_URL config
```

### Files NOT changed
All component files (`Invoices.jsx`, `Quotations.jsx`, etc.) are unchanged.
The new `store.js` exports the same function names as the old one, so most
components work as-is. Functions that were synchronous are now async — components
that call them without `await` will need to be updated (they'll receive a Promise
instead of a value). Most already handle async state via `useEffect`.

---

## Quick start

### 1. Backend
```bash
cd server
cp .env.example .env          # edit JWT secrets!
npm install
node src/db/seed.js           # seed demo users (once)
npm run dev                   # http://localhost:4000
```

### 2. Frontend
```bash
# in project root
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

---

## Security changes in detail

### Authentication (`server/src/routes/auth.js`)
- Passwords hashed with **bcrypt at SALT_ROUNDS=12** (replaces unsalted SHA-256)
- Access token: **httpOnly, Secure, SameSite=Strict** cookie; 15-minute TTL
- Refresh token: separate httpOnly cookie scoped to `/api/auth`; 7-day TTL
- **Refresh token rotation**: each use issues a new token and deletes the old one
- Login endpoint rate-limited to **10 attempts per 15 min per IP**
- Constant-time comparison prevents user enumeration on invalid email

### Authorization (`server/src/middleware/auth.js`)
- Every route is wrapped in `authenticate` (JWT check) + `authorize(module, action)` (RBAC)
- Roles are checked against the same permission matrix as the frontend — but this time on the server where it **cannot be bypassed via DevTools**
- DB overrides to the role matrix are read from `role_permission_overrides` table

### Data isolation
- `contact` role queries are automatically scoped to `WHERE created_by = req.user.id`
- Attempted access to records owned by another user returns 403
- Tenant isolation is at the row level — ready to add `tenant_id` column for full multi-tenancy

### Accounting integrity (`server/src/routes/journalEntries.js`)
- `validateBalance(lines)` checks `Σdebit = Σcredit` before any INSERT or UPDATE
- Posted entries are immutable (edit + delete both return 422)
- Bonus: SQLite CHECK constraints prevent negative debits/credits at the DB level

---

## Migrating to PostgreSQL
Replace `better-sqlite3` with `pg` (node-postgres). The schema file uses ANSI SQL
except for `datetime('now')` — change those to `NOW()` and the `TEXT` date columns
to `TIMESTAMPTZ`. The service layer uses parameterized queries throughout so there
are no other SQL dialect differences.
