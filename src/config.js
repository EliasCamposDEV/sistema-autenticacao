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

function trustProxyFromEnv() {
  const raw = (process.env.TRUST_PROXY || '').trim();

  if (raw === '' || raw === 'false' || raw === '0') {
    return false;
  }

  if (raw === 'true') {
    throw new Error('TRUST_PROXY=true permite bypass do rate limit; informe o numero de saltos ou a lista de proxies');
  }

  if (/^-?\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops > 0) {
      return hops;
    }
    throw new Error('TRUST_PROXY deve ser false, um numero positivo ou uma lista de IPs/redes');
  }

  const proxies = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (proxies.length === 0) {
    throw new Error('TRUST_PROXY deve ser false, um numero positivo ou uma lista de IPs/redes');
  }
  return proxies;
}

// Congela tambem os objetos aninhados para evitar mutacao acidental da configuracao.
function deepFreeze(value) {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}

const accessSecret = process.env.JWT_ACCESS_SECRET
  || (isProduction ? undefined : 'dev-only-access-secret-change-me-32-chars');

if (!accessSecret || accessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET e obrigatorio e deve ter pelo menos 32 caracteres');
}

export const config = deepFreeze({
  env: process.env.NODE_ENV || 'development',
  isProduction,
  isTest,
  port: numberFromEnv('PORT', 3000),
  mongoUri: process.env.MONGODB_URI || null,
  trustProxy: trustProxyFromEnv(),
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
