// ============================================================
// SurplusFlow AI — Error Handler
// ============================================================

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({
    err: error,
    url: request.url,
    method: request.method,
    userId: (request as any).user?.sub,
  });

  // Validation errors
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: error.message,
      details: error.validation,
    });
  }

  // Rate limit
  if (error.statusCode === 429) {
    return reply.status(429).send({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }

  // Known HTTP errors
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || 'Error',
      message: error.message,
    });
  }

  // Unknown errors — don't leak details
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again or contact support.',
  });
}
