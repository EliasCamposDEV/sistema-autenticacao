import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
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
let PasswordResetToken;
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

async function resetPassword(token, password) {
  return request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token, password });
}

function signAccessToken(userId, { type = 'access', expiresIn = 900 } = {}) {
  return jwt.sign(
    { sub: userId, role: 'user', type },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn,
      issuer: 'sistema-autenticacao',
      audience: 'sistema-autenticacao-api'
    }
  );
}

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = (await import('../src/app.js')).createApp();
  User = (await import('../src/models/user.js')).User;
  RefreshToken = (await import('../src/models/refresh-token.js')).RefreshToken;
  PasswordResetToken = (await import('../src/models/password-reset-token.js')).PasswordResetToken;

  await User.init();
  await RefreshToken.init();
  await PasswordResetToken.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RefreshToken.deleteMany({});
  await PasswordResetToken.deleteMany({});
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

  it('bloqueia login de usuario inativo', async () => {
    await register();
    const user = await User.findOne({ email: VALID_USER.email });
    user.active = false;
    await user.save();

    const response = await login();
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'ACCOUNT_DISABLED');
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

  it('rejeita access token expirado, de tipo errado e de usuario inativo', async () => {
    const session = await register();
    const user = await User.findOne({ email: VALID_USER.email });

    const expired = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signAccessToken(user.id, { expiresIn: -1 })}`);
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, 'TOKEN_EXPIRED');

    const wrongType = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signAccessToken(user.id, { type: 'refresh' })}`);
    assert.equal(wrongType.status, 401);
    assert.equal(wrongType.body.code, 'INVALID_TOKEN');

    user.active = false;
    await user.save();

    const inactive = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`);
    assert.equal(inactive.status, 401);
    assert.equal(inactive.body.code, 'INVALID_TOKEN');
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

  it('rejeita refresh token expirado e de usuario inativo', async () => {
    const session = await register();
    const user = await User.findOne({ email: VALID_USER.email });

    await RefreshToken.updateMany(
      { user: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const expired = await refresh(session.body.refreshToken);
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, 'REFRESH_TOKEN_EXPIRED');

    const secondSession = await login();
    user.active = false;
    await user.save();

    const inactive = await refresh(secondSession.body.refreshToken);
    assert.equal(inactive.status, 401);
    assert.equal(inactive.body.code, 'INVALID_REFRESH_TOKEN');
  });

  it('trata rotacao concorrente de refresh token', async () => {
    const session = await register();

    const responses = await Promise.all([
      refresh(session.body.refreshToken),
      refresh(session.body.refreshToken)
    ]);

    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 401]
    );

    const loser = responses.find((response) => response.status === 401);
    assert.equal(loser.body.code, 'REFRESH_TOKEN_REUSED');

    const winner = responses.find((response) => response.status === 200);
    const afterRace = await refresh(winner.body.refreshToken);
    assert.equal(afterRace.status, 401);
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

  it('rejeita corpo acima de 10 kb com 413', async () => {
    const response = await register({ name: 'A'.repeat(11_000) });

    assert.equal(response.status, 413);
    assert.equal(response.body.code, 'PAYLOAD_TOO_LARGE');
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

  it('solicita redefinicao e so expoe o token em teste', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ninguem@email.com' });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.resetToken, undefined);

    await register();
    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });
    assert.equal(known.status, 200);
    assert.ok(known.body.resetToken);
  });

  it('redefine a senha e revoga as sessoes antigas', async () => {
    const session = await register();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.resetToken, password: 'NovaSenhaSegura123' });
    assert.equal(reset.status, 200);

    const oldLogin = await login();
    assert.equal(oldLogin.status, 401);
    assert.equal(oldLogin.body.code, 'INVALID_CREDENTIALS');

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: VALID_USER.email, password: 'NovaSenhaSegura123' });
    assert.equal(newLogin.status, 200);

    const reused = await refresh(session.body.refreshToken);
    assert.equal(reused.status, 401);
  });

  it('rejeita token de redefinicao invalido, usado ou expirado', async () => {
    await register();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });

    const invalid = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'token-invalido', password: 'NovaSenhaSegura123' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_RESET_TOKEN');

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.resetToken, password: 'NovaSenhaSegura123' });

    const reused = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.resetToken, password: 'OutraSenhaSegura123' });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.code, 'RESET_TOKEN_USED');

    const expiredRequest = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });
    const user = await User.findOne({ email: VALID_USER.email });

    await PasswordResetToken.updateOne(
      { user: user._id, usedAt: null },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const expired = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: expiredRequest.body.resetToken, password: 'OutraSenhaSegura123' });
    assert.equal(expired.status, 400);
    assert.equal(expired.body.code, 'RESET_TOKEN_EXPIRED');
  });

  it('valida a nova senha na redefinicao', async () => {
    await register();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });

    const weak = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.resetToken, password: 'fraca' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.code, 'VALIDATION_ERROR');
  });

  it('consome o token de redefinicao uma unica vez sob concorrencia', async () => {
    await register();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });

    const passwords = ['PrimeiraSenha123', 'SegundaSenha123'];
    const responses = await Promise.all(
      passwords.map((password) => resetPassword(forgot.body.resetToken, password))
    );

    assert.equal(responses.filter((response) => response.status === 200).length, 1);

    const successfulIndex = responses.findIndex((response) => response.status === 200);
    const failedIndex = 1 - successfulIndex;
    assert.equal(responses[failedIndex].status, 400);
    assert.equal(responses[failedIndex].body.code, 'RESET_TOKEN_USED');

    const winner = await login({ password: passwords[successfulIndex] });
    assert.equal(winner.status, 200);

    const loser = await login({ password: passwords[failedIndex] });
    assert.equal(loser.status, 401);
  });

  it('mantem apenas um token de redefinicao ativo sob concorrencia', async () => {
    await register();
    const user = await User.findOne({ email: VALID_USER.email });

    const responses = await Promise.all([
      request(app).post('/api/v1/auth/forgot-password').send({ email: VALID_USER.email }),
      request(app).post('/api/v1/auth/forgot-password').send({ email: VALID_USER.email })
    ]);

    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    assert.equal(
      await PasswordResetToken.countDocuments({ user: user._id, usedAt: null }),
      1
    );

    const attempts = await Promise.all(
      responses.map((response) => resetPassword(response.body.resetToken, 'NovaSenhaSegura123'))
    );

    assert.equal(attempts.filter((response) => response.status === 200).length, 1);
    assert.equal(
      attempts.filter(
        (response) => response.status === 400 && response.body.code === 'INVALID_RESET_TOKEN'
      ).length,
      1
    );
  });
});
