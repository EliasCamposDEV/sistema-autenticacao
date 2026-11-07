import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-at-least-32-characters';
process.env.BCRYPT_ROUNDS = '4';

const VALID_USER = {
  name: 'Maria Silva',
  email: 'maria@email.com',
  password: 'SenhaSegura123'
};

let app;
let User;
let RefreshToken;
let mongoServer;

async function register(overrides = {}) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ ...VALID_USER, ...overrides });
}

async function login(overrides = {}) {
  return request(app)
    .post('/api/v1/auth/login')
    .send({
      email: VALID_USER.email,
      password: VALID_USER.password,
      ...overrides
    });
}

async function refresh(refreshToken) {
  return request(app)
    .post('/api/v1/auth/refresh')
    .send({ refreshToken });
}

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = (await import('../src/app.js')).createApp();
  User = (await import('../src/models/user.js')).User;
  RefreshToken = (await import('../src/models/refresh-token.js')).RefreshToken;

  await User.init();
  await RefreshToken.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RefreshToken.deleteMany({});
});

describe('Sistema de autenticação', () => {
  it('responde ao health check com o banco conectado', async () => {
    const response = await request(app).get('/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.database, 'up');
  });

  it('registra um usuario e nao expoe o hash da senha', async () => {
    const response = await register();

    assert.equal(response.status, 201);
    assert.ok(response.body.accessToken);
    assert.ok(response.body.refreshToken);
    assert.equal(response.body.tokenType, 'Bearer');
    assert.equal(response.body.user.name, VALID_USER.name);
    assert.equal(response.body.user.email, VALID_USER.email);
    assert.equal(response.body.user.role, 'user');
    assert.equal(response.body.user.passwordHash, undefined);

    const stored = await User.findOne({ email: VALID_USER.email }).select('+passwordHash');
    assert.ok(stored.passwordHash.startsWith('$2'));
    assert.notEqual(stored.passwordHash, VALID_USER.password);
  });

  it('normaliza o e-mail e impede cadastro duplicado', async () => {
    const first = await register({ email: 'MARIA@EMAIL.COM' });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.email, 'maria@email.com');

    const duplicate = await register({ email: 'maria@email.com' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, 'EMAIL_ALREADY_EXISTS');
  });

  it('rejeita dados invalidos no cadastro', async () => {
    const response = await register({
      name: 'A',
      email: 'email-invalido',
      password: 'fraca'
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'VALIDATION_ERROR');
    assert.ok(response.body.details.some((item) => item.field === 'name'));
    assert.ok(response.body.details.some((item) => item.field === 'email'));
    assert.ok(response.body.details.some((item) => item.field === 'password'));
  });

  it('faz login com credenciais validas e rejeita invalidas', async () => {
    await register();

    const success = await login();
    assert.equal(success.status, 200);
    assert.ok(success.body.accessToken);

    const wrongPassword = await login({ password: 'SenhaErrada123' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.code, 'INVALID_CREDENTIALS');

    const unknownEmail = await login({ email: 'ninguem@email.com' });
    assert.equal(unknownEmail.status, 401);
    assert.equal(unknownEmail.body.code, 'INVALID_CREDENTIALS');
  });

  it('protege a rota /me com access token', async () => {
    const session = await register();

    const unauthorized = await request(app).get('/api/v1/auth/me');
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.body.code, 'UNAUTHORIZED');

    const authorized = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`);

    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.user.email, VALID_USER.email);

    const invalid = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer token-invalido');

    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.code, 'INVALID_TOKEN');
  });

  it('rotaciona o refresh token e detecta reutilizacao', async () => {
    const session = await register();
    const firstRefreshToken = session.body.refreshToken;

    const rotated = await refresh(firstRefreshToken);
    assert.equal(rotated.status, 200);
    assert.ok(rotated.body.refreshToken);
    assert.notEqual(rotated.body.refreshToken, firstRefreshToken);

    const reuse = await refresh(firstRefreshToken);
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.code, 'REFRESH_TOKEN_REUSED');

    const familyRevoked = await refresh(rotated.body.refreshToken);
    assert.equal(familyRevoked.status, 401);
  });

  it('faz logout encerrando a familia de refresh tokens', async () => {
    const session = await register();

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.body.refreshToken });

    assert.equal(logout.status, 204);

    const afterLogout = await refresh(session.body.refreshToken);
    assert.equal(afterLogout.status, 401);
  });

  it('retorna 404 para rotas inexistentes e 400 para JSON invalido', async () => {
    const notFound = await request(app).get('/api/v1/nao-existe');
    assert.equal(notFound.status, 404);
    assert.equal(notFound.body.code, 'ROUTE_NOT_FOUND');

    const invalidJson = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJson.body.code, 'INVALID_JSON');
  });

  it('retorna 503 no health check quando o banco esta fora', async () => {
    await mongoose.disconnect();

    try {
      const response = await request(app).get('/health');
      assert.equal(response.status, 503);
      assert.equal(response.body.status, 'degraded');
      assert.equal(response.body.database, 'down');
    } finally {
      await mongoose.connect(mongoServer.getUri());
    }
  });
});
