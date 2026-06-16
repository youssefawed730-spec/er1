// routes/resource.js
// Reusable factory that wires up GET/POST/PUT/DELETE for any table,
// enforcing authenticate + authorize on every mutating route.
//
// Usage:
//   const { makeRouter } = require('./resource');
//   router.use('/invoices', makeRouter('invoices', { module: 'invoices', table: 'invoices' }));

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @param {string} table   - DB table name
 * @param {string} module  - permission module key (e.g. 'invoices')
 * @param {object} opts
 *   opts.ownerField  - if set, filter rows by this field = req.user.id for non-admin roles
 *   opts.tenantField - if set AND opts.tenantRoles defined, scope read by role
 *   opts.extraColumns - extra columns to allow in INSERT/UPDATE (default: all non-system cols)
 */
function makeRouter(table, module, opts = {}) {
  const router = express.Router();

  // ── GET (list) ───────────────────────────────
  router.get('/', authenticate, authorize(module, 'read'), (req, res) => {
    try {
      let query  = `SELECT * FROM ${table}`;
      const params = [];
      const conditions = [];

      // Contact role sees only their own records if ownerField is set
      if (opts.ownerField && req.user.role === 'contact') {
        conditions.push(`${opts.ownerField} = ?`);
        params.push(req.user.id);
      }

      // Generic column filters: any query param that matches a real column (excluding system params)
      const SKIP_PARAMS = new Set(['limit', 'offset', 'order', 'sort']);
      const allowedCols = new Set(db.pragma(`table_info(${table})`).map(c => c.name));
      for (const [key, val] of Object.entries(req.query)) {
        if (SKIP_PARAMS.has(key)) continue;
        if (allowedCols.has(key)) {
          conditions.push(`${key} = ?`);
          params.push(val);
        }
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      // Fall back to sort_order or id if this table has no created_at column
      const tableColumns = new Set(db.pragma(`table_info(${table})`).map(c => c.name));
      if (tableColumns.has('created_at')) {
        query += ' ORDER BY created_at DESC';
      } else if (tableColumns.has('sort_order')) {
        query += ' ORDER BY sort_order ASC';
      } else {
        query += ' ORDER BY id ASC';
      }

      // Pagination
      const limit  = Math.min(parseInt(req.query.limit)  || 50,  200);
      const offset = Math.max(parseInt(req.query.offset) || 0,   0);
      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = db.prepare(query).all(...params);
      return res.json({ data: rows });
    } catch (err) {
      console.error(`[${table}] GET list error:`, err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── GET (single) ─────────────────────────────
  router.get('/:id', authenticate, authorize(module, 'read'), (req, res) => {
    try {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      // Ownership check for contact role
      if (opts.ownerField && req.user.role === 'contact' && row[opts.ownerField] !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return res.json({ data: row });
    } catch (err) {
      console.error(`[${table}] GET single error:`, err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── POST (create) ─────────────────────────────
  router.post('/', authenticate, authorize(module, 'write'), (req, res) => {
    try {
      const id = req.body.id || uuidv4();
      const now = new Date().toISOString();

      // Sanitize: only allow known columns
      const allowed = getAllowedColumns(table, opts.extraColumns);
      const data = sanitize(req.body, allowed);

      data.id = id;
      if (allowed.includes('created_by')) {
        data.created_by = data.created_by || req.user.id;
      }
      if (allowed.includes('created_at')) data.created_at = data.created_at || now;
      if (allowed.includes('updated_at')) data.updated_at = now;

      const keys   = Object.keys(data);
      const values = keys.map(k => data[k]);
      const sql    = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;

      db.prepare(sql).run(...values);

      const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      return res.status(201).json({ data: created });
    } catch (err) {
      console.error(`[${table}] POST error:`, err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // ── PUT (update) ──────────────────────────────
  router.put('/:id', authenticate, authorize(module, 'write'), (req, res) => {
    try {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });

      // Ownership check for contact role
      if (opts.ownerField && req.user.role === 'contact' && existing[opts.ownerField] !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const allowed = getAllowedColumns(table, opts.extraColumns);
      const data = sanitize(req.body, allowed);
      delete data.id;          // never update PK
      delete data.created_at;  // never update created timestamp
      delete data.created_by;  // never update creator

      if (allowed.includes('updated_at')) data.updated_at = new Date().toISOString();

      const sets   = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(data), req.params.id];
      db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...values);

      const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      return res.json({ data: updated });
    } catch (err) {
      console.error(`[${table}] PUT error:`, err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── DELETE ────────────────────────────────────
  router.delete('/:id', authenticate, authorize(module, 'delete'), (req, res) => {
    try {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });

      if (opts.ownerField && req.user.role === 'contact' && existing[opts.ownerField] !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error(`[${table}] DELETE error:`, err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SYSTEM_COLS = new Set(['id', 'created_at', 'updated_at', 'created_by']);

// Cache column names per table
const _colCache = {};
function clearColumnCache() { for (const k in _colCache) delete _colCache[k]; }
function getAllowedColumns(table, extras = []) {
  if (!_colCache[table]) {
    const cols = db.pragma(`table_info(${table})`).map(c => c.name);
    _colCache[table] = cols;
  }
  if (extras && extras.length > 0) {
    // Merge extra columns without mutating the cache
    const merged = [...new Set([..._colCache[table], ...extras])];
    return merged;
  }
  return _colCache[table];
}

/** Strip keys that don't correspond to real DB columns; also remove attempts to inject SQL. */
function sanitize(body, allowed) {
  const out = {};
  for (const col of allowed) {
    if (col in body && !SYSTEM_COLS.has(col)) {
      out[col] = body[col] === undefined ? null : body[col];
    }
  }
  return out;
}

module.exports = { makeRouter, clearColumnCache };
