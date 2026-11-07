import { fileURLToPath } from 'node:url';

// Carrega .env quando existir, sem sobrescrever variaveis ja definidas.
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`A variavel de ambiente ${name} deve ser um numero positivo`);
  }
  return parsed;
}

const accessSecret = process.env.JWT_ACCESS_SECRET
  || (isProduction ? undefined : 'dev-only-access-secret-change-me-32-chars');

if (!accessSecret || accessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET e obrigatorio e deve ter pelo menos 32 caracteres');
}

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProduction,
  isTest,
  port: numberFromEnv('PORT', 3000),
  mongoUri: process.env.MONGODB_URI || null,
  corsOrigins: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  bcryptRounds: numberFromEnv('BCRYPT_ROUNDS', isTest ? 4 : 12),
  accessToken: {
    secret: accessSecret,
    ttlSeconds: numberFromEnv('ACCESS_TOKEN_TTL_SECONDS', 900),
    issuer: 'sistema-autenticacao',
    audience: 'sistema-autenticacao-api'
  },
  refreshTokenTtlDays: numberFromEnv('REFRESH_TOKEN_TTL_DAYS', 7),
  rateLimit: {
    windowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: numberFromEnv('RATE_LIMIT_MAX', 20)
  }
});
