import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'mail-test-secret-with-at-least-32-characters';
process.env.EMAIL_FROM = 'nao-responda@example.com';

const { buildResetEmail } = await import('../src/services/mail.service.js');

describe('Template de e-mail de redefinicao', () => {
  it('gera link e token quando a URL base esta configurada', () => {
    const message = buildResetEmail({
      to: 'maria@email.com',
      token: 'token-de-teste',
      resetUrlBase: 'https://app.example.com/redefinir-senha'
    });

    assert.equal(message.to, 'maria@email.com');
    assert.equal(message.from, 'nao-responda@example.com');
    assert.match(message.text, /https:\/\/app\.example\.com\/redefinir-senha\?token=token-de-teste/);
    assert.match(message.text, /Token de uso unico: token-de-teste/);
    assert.match(message.html, /href="https:\/\/app\.example\.com\/redefinir-senha\?token=token-de-teste"/);
    assert.match(message.html, /token-de-teste/);
  });

  it('inclui apenas o token quando a URL base esta vazia', () => {
    const message = buildResetEmail({
      to: 'maria@email.com',
      token: 'outro-token',
      resetUrlBase: ''
    });

    assert.doesNotMatch(message.text, /https:\/\/app\.example\.com/);
    assert.match(message.text, /outro-token/);
    assert.match(message.html, /outro-token/);
    assert.doesNotMatch(message.html, /<a href=/);
  });
});
