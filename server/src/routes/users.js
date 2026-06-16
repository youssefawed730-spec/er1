// routes/users.js
// All user management — only 'admin' role has write/delete.
// Password changes use bcrypt. Never returns password field.

const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { z }   = require('zod');
const db      = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

const SAFE_COLS = 'id, name, email, role, whatsapp_phone, is_active, created_at, updated_at';

const CreateSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.string().min(1),
  whatsapp_phone: z.string().optional(),
});

const UpdateSchema = z.object({
  name:     z.string().min(1).optional(),
  email:    z.string().email().optional(),
  password: z.string().min(8).optional(),
  role:     z.string().optional(),
  whatsapp_phone: z.string().optional(),
  is_active: z.boolean().optional(),
});

// ── GET list ─────────────────────────────────
router.get('/', authenticate, authorize('users', 'read'), (req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_COLS} FROM users ORDER BY created_at DESC`).all();
  return res.json({ data: rows });
});

// ── GET single ────────────────────────────────
router.get('/:id', authenticate, authorize('users', 'read'), (req, res) => {
  const row = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({ data: row });
});

// ── POST create ───────────────────────────────
router.post('/', authenticate, authorize('users', 'write'), async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { name, email, password, role, whatsapp_phone } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const id   = uuidv4();
  const now  = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password, role, whatsapp_phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email, hash, role, whatsapp_phone || null, now, now);

  const row = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id);
  return res.status(201).json({ data: row });
});

// ── PUT update ────────────────────────────────
router.put('/:id', authenticate, authorize('users', 'write'), async (req, res) => {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const updates = { ...parsed.data, updated_at: new Date().toISOString() };

  if (updates.password) {
    updates.password = await bcrypt.hash(updates.password, SALT_ROUNDS);
  } else {
    delete updates.password;
  }

  const sets   = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...values);

  const row = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(req.params.id);
  return res.json({ data: row });
});

// ── DELETE ────────────────────────────────────
router.delete('/:id', authenticate, authorize('users', 'delete'), (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Soft-delete: deactivate rather than destroy (preserves audit trail)
  db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), req.params.id);
  return res.json({ ok: true });
});

// ── POST /:id/change-password (self-service) ──
router.post('/:id/change-password', authenticate, async (req, res) => {
  // Users can change their own password; admins can change anyone's
  if (req.params.id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  // For own password change, verify current password
  if (req.params.id === req.user.id) {
    if (!current_password) return res.status(400).json({ error: 'current_password required' });
    const match = await bcrypt.compare(current_password, user.password);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
  }

  const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
  db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?')
    .run(hash, new Date().toISOString(), req.params.id);

  // Invalidate all refresh tokens for this user
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.params.id);

  return res.json({ ok: true });
});

module.exports = router;
