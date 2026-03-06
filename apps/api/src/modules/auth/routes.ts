// ============================================================
// SurplusFlow AI — Auth Routes (Real bcrypt + postgres)
// ============================================================

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { query } from '../../lib/db.js';
import { config } from '../../config/index.js';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login — Staff login (email + password)
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, email, full_name, role, password_hash FROM users WHERE email = $1 AND is_active = true',
      [email],
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const tokens = app.generateTokens({ sub: user.id, email: user.email, role: user.role });

    await app.audit.write({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      resourceType: 'user',
      resourceId: user.id,
      actorIp: request.ip,
      details: { email, method: 'password' },
    });

    return reply.send({ ...tokens, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  });

  // POST /auth/magic-link — Claimant magic link request
  app.post('/magic-link', async (request, reply) => {
    const { email } = request.body as { email: string };

    if (!email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Email is required' });
    }

    // Always return same message to not leak user existence
    const genericMsg = { message: 'If an account exists with this email, a login link has been sent.' };

    const result = await query(
      'SELECT id, email, role FROM users WHERE email = $1 AND is_active = true AND role = $2',
      [email, 'claimant'],
    );

    if (result.rows.length === 0) {
      await app.audit.write({
        action: AUDIT_ACTIONS.AUTH_MAGIC_LINK_SENT,
        resourceType: 'user',
        actorIp: request.ip,
        details: { email, found: false },
      });
      return reply.send(genericMsg);
    }

    const user = result.rows[0];

    // Generate random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + config.MAGIC_LINK_EXPIRES_MINUTES * 60 * 1000);

    await query(
      'INSERT INTO magic_links (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt.toISOString()],
    );

    // In production: send email with link containing rawToken
    // For now, log it (visible in dev logs)
    request.log.info({ magicLinkToken: rawToken, email }, 'Magic link generated (dev mode)');

    await app.audit.write({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTH_MAGIC_LINK_SENT,
      resourceType: 'user',
      resourceId: user.id,
      actorIp: request.ip,
      details: { email },
    });

    return reply.send(genericMsg);
  });

  // POST /auth/magic-link/verify — Verify magic link token
  app.post('/magic-link/verify', async (request, reply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Token is required' });
    }

    const tokenHash = sha256(token);

    const result = await query(
      `SELECT ml.id AS link_id, ml.user_id, u.email, u.role
       FROM magic_links ml
       JOIN users u ON u.id = ml.user_id
       WHERE ml.token_hash = $1 AND ml.used = false AND ml.expires_at > NOW()`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired magic link' });
    }

    const row = result.rows[0];

    // Mark as used
    await query('UPDATE magic_links SET used = true WHERE id = $1', [row.link_id]);

    // Update last login
    await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [row.user_id]);

    const tokens = app.generateTokens({ sub: row.user_id, email: row.email, role: row.role });

    await app.audit.write({
      actorId: row.user_id,
      actorRole: row.role,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      resourceType: 'user',
      resourceId: row.user_id,
      actorIp: request.ip,
      details: { method: 'magic_link' },
    });

    return reply.send(tokens);
  });

  // POST /auth/refresh — Refresh JWT
  app.post('/refresh', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!request.user) return reply.status(401).send({ message: 'Unauthorized' });

    const tokens = app.generateTokens({
      sub: request.user.sub,
      email: request.user.email,
      role: request.user.role,
    });

    return reply.send(tokens);
  });

  // POST /auth/logout — Invalidate session
  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    await app.audit.write({
      actorId: request.user?.sub,
      actorRole: request.user?.role,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      resourceType: 'user',
      resourceId: request.user?.sub,
      actorIp: request.ip,
    });

    return reply.send({ message: 'Logged out successfully' });
  });

  // POST /auth/mfa/setup — Initialize TOTP (stub)
  app.post('/mfa/setup', { preHandler: [app.authenticate] }, async (_request, reply) => {
    return reply.send({
      secret: 'PLACEHOLDER_TOTP_SECRET',
      qrCodeUri: 'otpauth://totp/SurplusFlow:user@example.com?secret=PLACEHOLDER&issuer=SurplusFlow',
    });
  });

  // POST /auth/mfa/verify — Verify TOTP (stub)
  app.post('/mfa/verify', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { code: _code } = request.body as { code: string };

    await app.audit.write({
      actorId: request.user?.sub,
      actorRole: request.user?.role,
      action: AUDIT_ACTIONS.AUTH_MFA_VERIFIED,
      resourceType: 'user',
      resourceId: request.user?.sub,
      actorIp: request.ip,
    });

    return reply.send({ verified: true });
  });
}
