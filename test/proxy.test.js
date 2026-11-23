import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'development';
process.env.JWT_ACCESS_SECRET = 'proxy-test-secret-with-at-least-32-characters';
process.env.TRUST_PROXY = '1';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX = '2';
process.env.CORS_ORIGIN = 'https://app.example.com';

const { createApp } = await import('../src/app.js');
const app = createApp();

function loginFrom(ip) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email: 'invalido', password: 'x' });
}

describe('Operacao atras de proxy', () => {
  it('usa X-Forwarded-For e mantem um limite por cliente', async () => {
    const first = await loginFrom('203.0.113.10');
    const second = await loginFrom('203.0.113.10');
    const otherClient = await loginFrom('203.0.113.20');

    assert.deepEqual(
      [first.status, second.status, otherClient.status],
      [400, 400, 400]
    );

    const limited = await loginFrom('203.0.113.10');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, 'RATE_LIMITED');
  });

  it('respeita a origem configurada no CORS', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://app.example.com');

    assert.equal(
      response.headers['access-control-allow-origin'],
      'https://app.example.com'
    );
  });
});
