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

export async function sendPasswordResetEmail({ to, token }) {
  const transporter = getTransporter();

  const subject = 'Redefinicao de senha';
  const text = [
    'Voce solicitou a redefinicao de senha.',
    '',
    'Use o token abaixo em POST /api/v1/auth/reset-password:',
    token,
    '',
    'O token expira em 1 hora. Se voce nao fez este pedido, ignore este e-mail.'
  ].join('\n');

  if (!transporter) {
    if (config.isProduction) {
      console.warn('[mail] SMTP nao configurado; e-mail de redefinicao nao enviado.');
    } else {
      console.log(`[mail] (desenvolvimento) token de redefinicao para ${to}: ${token}`);
    }
    return;
  }

  await transporter.sendMail({
    from: config.email.from,
    to,
    subject,
    text
  });
}