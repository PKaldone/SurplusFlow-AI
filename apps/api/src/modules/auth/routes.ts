// ============================================================
// SurplusFlow AI — Auth Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login — Staff login (email + password)
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Email and password are required' });
    }

    // In production: query users table, verify bcrypt hash
    // const user = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    // const valid = await bcrypt.compare(password, user.password_hash);

    // Placeholder response structure
    const tokens = app.generateTokens({ sub: 'user-id', email, role: 'admin' });

    await app.audit.write({
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      resourceType: 'user',
      actorIp: request.ip,
      details: { email, method: 'password' },
    });

    return reply.send(tokens);
  });

  // POST /auth/magic-link — Claimant magic link request
  app.post('/magic-link', async (request, reply) => {
    const { email } = request.body as { email: string };

    if (!email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Email is required' });
    }

    // In production:
    // 1. Find or create claimant user
    // 2. Generate token, hash it, store in magic_links table
    // 3. Send email with link containing token

    await app.audit.write({
      action: AUDIT_ACTIONS.AUTH_MAGIC_LINK_SENT,
      resourceType: 'user',
      actorIp: request.ip,
      details: { email },
    });

    return reply.send({ message: 'If an account exists with this email, a login link has been sent.' });
  });

  // POST /auth/magic-link/verify — Verify magic link token
  app.post('/magic-link/verify', async (request, reply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Token is required' });
    }

    // In production:
    // 1. Hash token, look up in magic_links table
    // 2. Check not used and not expired
    // 3. Mark as used
    // 4. Generate JWT for the claimant user

    const tokens = app.generateTokens({ sub: 'claimant-id', email: 'claimant@example.com', role: 'claimant' });

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
    // In production: delete session from sessions table
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

  // POST /auth/mfa/setup — Initialize TOTP
  app.post('/mfa/setup', { preHandler: [app.authenticate] }, async (request, reply) => {
    // In production: generate TOTP secret, return QR code URI
    return reply.send({
      secret: 'PLACEHOLDER_TOTP_SECRET',
      qrCodeUri: 'otpauth://totp/SurplusFlow:user@example.com?secret=PLACEHOLDER&issuer=SurplusFlow',
    });
  });

  // POST /auth/mfa/verify — Verify TOTP
  app.post('/mfa/verify', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { code } = request.body as { code: string };
    // In production: verify TOTP code against stored secret
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
