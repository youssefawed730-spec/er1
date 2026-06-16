// routes/journalEntries.js
// Enforces double-entry balance (debit = credit) server-side before any persist.

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z }   = require('zod');
const db      = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const LineSchema = z.object({
  account_id:  z.string().min(1),
  debit:       z.number().min(0).default(0),
  credit:      z.number().min(0).default(0),
  description: z.string().optional(),
  currency:    z.string().default('USD'),
});

const JournalSchema = z.object({
  number:      z.string().optional(),
  date:        z.string().min(1),
  description: z.string().optional(),
  reference:   z.string().optional(),
  lines:       z.array(LineSchema).min(2),
});

function validateBalance(lines) {
  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.001) {
    throw new Error(`Journal not balanced: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`);
  }
}

// ── GET list ─────────────────────────────────
router.get('/', authenticate, authorize('journalEntries', 'read'), (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);
  const rows = db.prepare(
    'SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  return res.json({ data: rows });
});

// ── GET single + lines ────────────────────────
router.get('/:id', authenticate, authorize('journalEntries', 'read'), (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const lines = db.prepare('SELECT * FROM journal_lines WHERE journal_entry_id = ?').all(req.params.id);
  return res.json({ data: { ...entry, lines } });
});

// ── POST create ───────────────────────────────
router.post('/', authenticate, authorize('journalEntries', 'write'), (req, res) => {
  const parsed = JournalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { lines, ...header } = parsed.data;

  try {
    validateBalance(lines);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  const id  = uuidv4();
  const now = new Date().toISOString();
  const number = header.number || `JE-${Date.now()}`;

  const createEntry = db.transaction(() => {
    db.prepare(`
      INSERT INTO journal_entries (id, number, date, description, reference, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(id, number, header.date, header.description || null, header.reference || null, req.user.id, now);

    const insertLine = db.prepare(`
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertLine.run(uuidv4(), id, line.account_id, line.debit, line.credit, line.description || null, line.currency || 'USD');
    }
  });

  createEntry();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
  const createdLines = db.prepare('SELECT * FROM journal_lines WHERE journal_entry_id = ?').all(id);
  return res.status(201).json({ data: { ...entry, lines: createdLines } });
});

// ── PUT update (draft only) ───────────────────
router.put('/:id', authenticate, authorize('journalEntries', 'write'), (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.status === 'posted') {
    return res.status(422).json({ error: 'Posted journal entries cannot be edited' });
  }

  const parsed = JournalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { lines, ...header } = parsed.data;
  try { validateBalance(lines); } catch (err) { return res.status(422).json({ error: err.message }); }

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE journal_entries SET date=?, description=?, reference=? WHERE id=?
    `).run(header.date, header.description||null, header.reference||null, req.params.id);

    db.prepare('DELETE FROM journal_lines WHERE journal_entry_id = ?').run(req.params.id);
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertLine.run(uuidv4(), req.params.id, line.account_id, line.debit, line.credit, line.description||null, line.currency||'USD');
    }
  });
  update();

  const updated = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  const updatedLines = db.prepare('SELECT * FROM journal_lines WHERE journal_entry_id = ?').all(req.params.id);
  return res.json({ data: { ...updated, lines: updatedLines } });
});

// ── POST /:id/post ─────────────────────────────
router.post('/:id/post', authenticate, authorize('journalEntries', 'post'), (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.status === 'posted') return res.status(422).json({ error: 'Already posted' });

  const lines = db.prepare('SELECT * FROM journal_lines WHERE journal_entry_id = ?').all(req.params.id);
  try { validateBalance(lines); } catch (err) { return res.status(422).json({ error: err.message }); }

  db.prepare(`
    UPDATE journal_entries SET status='posted', posted_by=?, posted_at=? WHERE id=?
  `).run(req.user.id, new Date().toISOString(), req.params.id);

  return res.json({ data: db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id) });
});

// ── DELETE ────────────────────────────────────
router.delete('/:id', authenticate, authorize('journalEntries', 'delete'), (req, res) => {
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.status === 'posted') return res.status(422).json({ error: 'Cannot delete posted journal entries' });
  db.prepare('DELETE FROM journal_entries WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
