// routes/settings.js
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../db/schema');

const router = express.Router();

const DEFAULT_CONFIG = {
  companyName: '',
  companyLogo: '',
  currency: 'USD',
  language: 'en',
  darkMode: false,
  dateFormat: 'MM/DD/YYYY',
  timezone: 'UTC',
  fiscalYearStart: '',
  customContactSources: [],   // kept in sync with /contact-sources endpoints
};

function readConfig() {
  const rows = db.prepare('SELECT key, value FROM system_config').all();
  const cfg = { ...DEFAULT_CONFIG };
  for (const { key, value } of rows) {
    try { cfg[key] = JSON.parse(value); } catch { cfg[key] = value; }
  }
  return cfg;
}

// GET /api/settings/config — no auth required (needed for login page branding)
router.get('/config', (req, res) => {
  try {
    return res.json({ data: readConfig() });
  } catch (err) {
    console.error('[settings] GET config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/settings/config
router.put('/config', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    const upsert = db.prepare(`
      INSERT INTO system_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const upsertMany = db.transaction((entries) => {
      for (const [k, v] of entries) upsert.run(k, JSON.stringify(v));
    });
    const allowed = Object.keys(DEFAULT_CONFIG);
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    upsertMany(entries);
    return res.json({ data: readConfig() });
  } catch (err) {
    console.error('[settings] PUT config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/settings/role-permission-overrides
router.get('/role-permission-overrides', authenticate, authorize('settings', 'read'), (req, res) => {
  try {
    const rows = db.prepare('SELECT role, module, actions FROM role_permission_overrides').all();
    const result = {};
    for (const { role, module, actions } of rows) {
      if (!result[role]) result[role] = { permissions: {} };
      try { result[role].permissions[module] = JSON.parse(actions); } catch {}
    }
    return res.json({ data: result });
  } catch (err) {
    console.error('[settings] GET overrides:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/settings/role-permission-overrides
router.put('/role-permission-overrides', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    const upsert = db.prepare(`
      INSERT INTO role_permission_overrides (role, module, actions) VALUES (?, ?, ?)
      ON CONFLICT(role, module) DO UPDATE SET actions = excluded.actions
    `);
    const upsertMany = db.transaction((entries) => {
      for (const { role, module, actions } of entries) upsert.run(role, module, JSON.stringify(actions));
    });
    const entries = [];
    for (const [role, roleData] of Object.entries(req.body || {})) {
      if (roleData?.permissions) {
        for (const [mod, actions] of Object.entries(roleData.permissions)) {
          if (Array.isArray(actions)) entries.push({ role, module: mod, actions });
        }
      }
    }
    upsertMany(entries);
    const rows = db.prepare('SELECT role, module, actions FROM role_permission_overrides').all();
    const result = {};
    for (const { role, module, actions } of rows) {
      if (!result[role]) result[role] = { permissions: {} };
      try { result[role].permissions[module] = JSON.parse(actions); } catch {}
    }
    return res.json({ data: result });
  } catch (err) {
    console.error('[settings] PUT overrides:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/settings/contact-sources
router.get('/contact-sources', authenticate, (req, res) => {
  try {
    const rows = db.prepare("SELECT value FROM system_config WHERE key = 'customContactSources'").get();
    const sources = rows ? JSON.parse(rows.value) : [];
    return res.json({ data: sources });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/settings/contact-sources
router.post('/contact-sources', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: 'source required' });
    const existing = db.prepare("SELECT value FROM system_config WHERE key = 'customContactSources'").get();
    const sources = existing ? JSON.parse(existing.value) : [];
    if (!sources.includes(source)) sources.push(source);
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('customContactSources', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(sources));
    return res.json({ data: sources });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/settings/contact-sources/:source
router.delete('/contact-sources/:source', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    const source = decodeURIComponent(req.params.source);
    const existing = db.prepare("SELECT value FROM system_config WHERE key = 'customContactSources'").get();
    const sources = existing ? JSON.parse(existing.value).filter(s => s !== source) : [];
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('customContactSources', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(sources));
    return res.json({ data: sources });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/settings/currency-rates  — store custom override rates
router.post('/currency-rates', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    const { code, rate } = req.body;
    if (!code || rate == null) return res.status(400).json({ error: 'code and rate required' });
    const key = `currencyRate_${code}`;
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(rate));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/settings/role-permission-overrides — clear all custom overrides (reset to defaults)
router.delete('/role-permission-overrides', authenticate, authorize('settings', 'write'), (req, res) => {
  try {
    db.prepare('DELETE FROM role_permission_overrides').run();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[settings] DELETE overrides:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
