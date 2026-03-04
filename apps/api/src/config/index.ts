// ============================================================
// SurplusFlow AI — API Configuration
// All environment variables with defaults
// ============================================================

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL', 'postgresql://sfuser:sfpass_local_dev@localhost:5432/surplusflow'),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10', 10),

  // Redis
  REDIS_URL: requireEnv('REDIS_URL', 'redis://:sfredis_local_dev@localhost:6379'),

  // JWT
  JWT_SECRET: requireEnv('JWT_SECRET', 'dev-secret-change-in-production-MUST-BE-32-chars!'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Magic Link
  MAGIC_LINK_SECRET: requireEnv('MAGIC_LINK_SECRET', 'dev-magic-link-secret-change-me!'),
  MAGIC_LINK_EXPIRES_MINUTES: parseInt(process.env.MAGIC_LINK_EXPIRES_MINUTES || '15', 10),

  // MinIO / S3
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_ACCESS_KEY: requireEnv('S3_ACCESS_KEY', 'sfminio'),
  S3_SECRET_KEY: requireEnv('S3_SECRET_KEY', 'sfminio_secret_local'),
  S3_REGION: process.env.S3_REGION || 'us-east-1',
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',

  // Encryption
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY', 'dev-encryption-key-32-characters!'),
  SSN_ENCRYPTION_KEY: requireEnv('SSN_ENCRYPTION_KEY', 'dev-ssn-key-32-characters-long!!'),

  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3002',

  // Email (for sending)
  SMTP_HOST: process.env.SMTP_HOST || 'localhost',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '1025', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'claims@surplusflow.com',

  // SMS
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'console', // 'twilio' | 'console'
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',

  // App
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  PORTAL_URL: process.env.PORTAL_URL || 'http://localhost:3002',
} as const;
