// ============================================================
// SurplusFlow AI — API Server (Fastify)
// ============================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { authPlugin } from './middleware/auth.js';
import { auditPlugin } from './middleware/audit.js';
import { errorHandler } from './middleware/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { caseRoutes } from './modules/cases/routes.js';
import { opportunityRoutes } from './modules/opportunities/routes.js';
import { documentRoutes } from './modules/documents/routes.js';
import { billingRoutes } from './modules/billing/routes.js';
import { outreachRoutes } from './modules/outreach/routes.js';
import { attorneyRoutes } from './modules/attorney/routes.js';
import { complianceRoutes } from './modules/compliance/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { config } from './config/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  // --- Global Plugins ---
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(','),
    credentials: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max
      files: 5,
    },
  });

  // --- Custom Plugins ---
  await app.register(authPlugin);
  await app.register(auditPlugin);

  // --- Error Handler ---
  app.setErrorHandler(errorHandler);

  // --- Health Check ---
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // --- API Routes ---
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(caseRoutes, { prefix: '/api/v1/cases' });
  await app.register(opportunityRoutes, { prefix: '/api/v1/opportunities' });
  await app.register(documentRoutes, { prefix: '/api/v1/documents' });
  await app.register(billingRoutes, { prefix: '/api/v1/billing' });
  await app.register(outreachRoutes, { prefix: '/api/v1/outreach' });
  await app.register(attorneyRoutes, { prefix: '/api/v1/attorney' });
  await app.register(complianceRoutes, { prefix: '/api/v1/rules' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  return app;
}

// --- Start Server ---
async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`SurplusFlow API running on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
