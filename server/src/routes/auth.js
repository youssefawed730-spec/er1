// routes/auth.js
// POST /api/auth/login   — bcrypt verify, issue httpOnly JWT + refresh token
// POST /api/auth/refresh — rotate refresh token, issue new access token
// POST /api/auth/logout  — revoke refresh token, clear cookies

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { z }   = require('zod');
const db      = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

const ACCESS_SECRET   = process.env.JWT_ACCESS_SECRET   || 'change-me-access-secret';
const REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET  || 'change-me-refresh-secret';
const ACCESS_TTL_S    = 15 * 60;          // 15 minutes
const REFRESH_TTL_S   = 7 * 24 * 3600;   // 7 days
const RESET_TTL_S     = 60 * 60;         // 1 hour
const IS_PROD         = process.env.NODE_ENV === 'production';

// Limit how often someone can request a reset email per IP
const forgotPasswordLimiter = process.env.NODE_ENV === 'development'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many reset requests. Try again later.' },
      handler: (req, res) => res.status(429).json({ error: 'Too many reset requests. Try again later.' }),
    });

// Brute-force protection: max 10 login attempts per 15 minutes per IP
const loginLimiter = process.env.NODE_ENV === 'development'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts. Try again later.' },
      handler: (req, res) => res.status(429).json({ error: 'Too many login attempts. Try again later.' }),
    });

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

function issueTokens(userId) {
  const accessToken = jwt.sign(
    { sub: userId },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL_S }
  );

  const rawRefresh  = crypto.randomBytes(48).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  const refreshExp  = new Date(Date.now() + REFRESH_TTL_S * 1000).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), userId, refreshHash, refreshExp);

  return { accessToken, rawRefresh };
}

function setAuthCookies(res, accessToken, rawRefresh) {
  const cookieOpts = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    path: '/',
  };
  res.cookie('access_token',   accessToken, { ...cookieOpts, maxAge: ACCESS_TTL_S  * 1000 });
  res.cookie('refresh_token',  rawRefresh,  { ...cookieOpts, maxAge: REFRESH_TTL_S * 1000, path: '/api/auth' });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token',  { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
}

// ── POST /api/auth/login ─────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);

  // Constant-time check even on missing user to prevent user enumeration
  const hash = user?.password || '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
  const match = await bcrypt.compare(password, hash);

  if (!user || !match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { accessToken, rawRefresh } = issueTokens(user.id);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, action, entity_type, entity_id, details, user_id, user_name, user_role)
    VALUES (?, 'login', 'auth', ?, ?, ?, ?, ?)
  `).run(uuidv4(), user.id, JSON.stringify({ email }), user.id, user.name, user.role);

  setAuthCookies(res, accessToken, rawRefresh);

  const { password: _pw, ...safeUser } = user;
  return res.json({ user: safeUser });
});

// ── POST /api/auth/refresh ───────────────────
router.post('/refresh', (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (!raw) return res.status(401).json({ error: 'No refresh token' });

  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const stored = db.prepare(`
    SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')
  `).get(hash);

  if (!stored) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Refresh token invalid or expired' });
  }

  // Rotate: delete old token
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);

  const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(stored.user_id);
  if (!user || !user.is_active) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'User not found' });
  }

  const { accessToken, rawRefresh } = issueTokens(user.id);
  setAuthCookies(res, accessToken, rawRefresh);
  return res.json({ ok: true });
});

// ── POST /api/auth/logout ────────────────────
router.post('/logout', (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (raw) {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  }
  clearAuthCookies(res);
  return res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────
router.get('/me', authenticate, (req, res) => {
  const { password: _pw, ...safe } = req.user;
  return res.json({ user: safe });
});

// ── POST /api/auth/forgot-password ───────────
// Always returns 200 (even if the email doesn't exist) to avoid leaking
// which emails are registered.
const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { email } = parsed.data;
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ? AND is_active = 1').get(email);

  if (user) {
    // Invalidate any previous unused tokens for this user
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0').run(user.id);

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_S * 1000).toISOString();

    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), user.id, tokenHash, expiresAt);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink   = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your password',
        html: `
          <p>Hi ${user.name || ''},</p>
          <p>We received a request to reset your password. Click the link below to choose a new one:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `,
        text: `Reset your password: ${resetLink} (expires in 1 hour)`,
      });
    } catch (err) {
      console.error('[auth/forgot-password] failed to send email:', err);
      // Don't reveal failure details to the client — still respond 200
    }
  }

  return res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

// ── POST /api/auth/reset-password ────────────
const ResetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8),
});

router.post('/reset-password', async (req, res) => {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const stored = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
  `).get(tokenHash);

  if (!stored) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const now  = new Date().toISOString();

  db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(hash, now, stored.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(stored.id);

  // Invalidate all existing sessions for this user — force re-login everywhere
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(stored.user_id);

  return res.json({ ok: true, message: 'Password has been reset. You can now sign in.' });
});

module.exports = router;
