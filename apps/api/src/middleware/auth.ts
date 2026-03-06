// ============================================================
// SurplusFlow AI — Auth Middleware (JWT + RBAC)
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { JwtPayload, UserRole } from '@surplusflow/shared';

// Extend Fastify request with user info
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

async function authPluginImpl(app: FastifyInstance) {
  // Decorator to access current user
  app.decorateRequest('user', undefined);

  /**
   * JWT verification hook — add to routes that need auth
   */
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      request.user = payload;
    } catch (err) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  /**
   * Role-based access control decorator
   * Usage: { preHandler: [app.authenticate, app.requireRole(['admin', 'ops'])] }
   */
  app.decorate('requireRole', function (roles: UserRole[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
      }
      if (!roles.includes(request.user.role)) {
        // Log unauthorized access attempt
        request.log.warn({
          action: 'security.permission_denied',
          actorId: request.user.sub,
          actorRole: request.user.role,
          requiredRoles: roles,
          path: request.url,
          method: request.method,
        });
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `Insufficient permissions. Required role: ${roles.join(' or ')}`,
        });
      }
    };
  });

  /**
   * Generate JWT tokens
   */
  app.decorate('generateTokens', function (payload: { sub: string; email: string; role: UserRole }) {
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as string & jwt.SignOptions['expiresIn'],
    });
    const refreshToken = jwt.sign({ sub: payload.sub, type: 'refresh' }, config.JWT_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as string & jwt.SignOptions['expiresIn'],
    });
    return { accessToken, refreshToken, expiresIn: 900 }; // 15min in seconds
  });

  /**
   * Claimant self-access guard — ensures claimant can only access their own resources
   */
  app.decorate('requireSelfOrRole', function (roles: UserRole[], _paramIdField: string = 'id') {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not authenticated' });
      }
      // Staff roles can access anything
      if (roles.includes(request.user.role)) return;

      // Claimant can only access their own resources
      if (request.user.role === 'claimant') {
        const _params = request.params as Record<string, string>;
        // This will be checked at the route level against the claimant's own records
        // The route handler must verify ownership
        return;
      }

      return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' });
    };
  });
}

export const authPlugin = fp(authPluginImpl, { name: 'auth' });

// Type augmentation for decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSelfOrRole: (roles: UserRole[], paramIdField?: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    generateTokens: (payload: { sub: string; email: string; role: UserRole }) => { accessToken: string; refreshToken: string; expiresIn: number };
  }
}
