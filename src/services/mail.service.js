import nodemailer from 'nodemailer';
import { config } from '../config.js';

let cachedTransporter;
let transporterResolved = false;

function smtpConfigured() {
  return Boolean(config.email.from && config.email.smtp.host);
}

function getTransporter() {
  if (transporterResolved) {
    return cachedTransporter;
  }

  transporterResolved = true;

  if (!smtpConfigured()) {
    cachedTransporter = null;
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: config.email.smtp.user
      ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
      : undefined
  });

  return cachedTransporter;
}

export function buildResetEmail({ to, token, resetUrlBase = config.email.resetUrlBase }) {
  const subject = 'Redefinicao de senha';
  const resetUrl = resetUrlBase
    ? `${resetUrlBase}${resetUrlBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : null;

  const textLines = [
    'Voce solicitou a redefinicao de senha.',
    '',
    resetUrl ? `Acesse o link abaixo para definir uma nova senha:` : 'Use o token abaixo em POST /api/v1/auth/reset-password:',
    resetUrl || token,
    ''
  ];

  if (resetUrl) {
    textLines.push(`Token de uso unico: ${token}`);
    textLines.push('');
  }

  textLines.push('O token expira em 1 hora. Se voce nao fez este pedido, ignore este e-mail.');

  const text = textLines.join('\n');

  const linkHtml = resetUrl
    ? `<p><a href="${resetUrl}">Redefinir senha</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
  <main style="max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px; margin-bottom: 16px;">Redefinicao de senha</h1>
    <p>Voce solicitou a redefinicao de senha da sua conta.</p>
    ${linkHtml}
    <p>Se o link nao funcionar, use o token abaixo em <code>POST /api/v1/auth/reset-password</code>:</p>
    <p style="word-break: break-all; font-family: monospace; background: #f3f4f6; padding: 12px; border-radius: 6px;">${token}</p>
    <p>O token expira em 1 hora. Se voce nao fez este pedido, ignore este e-mail.</p>
  </main>
</body>
</html>`;

  return {
    from: config.email.from,
    to,
    subject,
    text,
    html
  };
}

export async function sendPasswordResetEmail({ to, token }) {
  const transporter = getTransporter();
  const message = buildResetEmail({ to, token });

  if (!transporter) {
    if (config.isProduction) {
      console.warn('[mail] SMTP nao configurado; e-mail de redefinicao nao enviado.');
    } else {
      console.log(`[mail] (desenvolvimento) token de redefinicao para ${to}: ${token}`);
    }
    return;
  }

  await transporter.sendMail(message);
}