import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'production';
process.env.JWT_ACCESS_SECRET = 'production-test-secret-with-at-least-32-characters';
process.env.BCRYPT_ROUNDS = '4';
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';

const VALID_USER = {
  name: 'Maria Silva',
  email: 'maria@email.com',
  password: 'SenhaSegura123'
};

let app;
let User;
let PasswordResetToken;
let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(mongoServer.getUri());

  app = (await import('../src/app.js')).createApp();
  User = (await import('../src/models/user.js')).User;
  PasswordResetToken = (await import('../src/models/password-reset-token.js')).PasswordResetToken;

  await User.init();
  await PasswordResetToken.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Sistema de autenticacao em producao', () => {
  it('nao devolve resetToken e mantem a resposta generica', async () => {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send(VALID_USER);
    assert.equal(registration.status, 201);

    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: VALID_USER.email });
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ninguem@email.com' });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.body.resetToken, undefined);
    assert.deepEqual(known.body, unknown.body);

    const user = await User.findOne({ email: VALID_USER.email });
    assert.equal(
      await PasswordResetToken.countDocuments({ user: user._id, usedAt: null }),
      1
    );
  });
});
