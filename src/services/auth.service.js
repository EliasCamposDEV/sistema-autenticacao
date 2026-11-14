import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.js';
import { RefreshToken } from '../models/refresh-token.js';
import { PasswordResetToken, generateResetToken } from '../models/password-reset-token.js';
import { AppError } from '../errors.js';
import { config } from '../config.js';
import {
  createAccessToken,
  generateRefreshToken,
  hashToken
} from './token.service.js';

// Hash fixo para igualar o tempo de resposta quando o e-mail nao existe.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('invalid-password-placeholder', config.bcryptRounds);

const REFRESH_TOKEN_TTL_MS = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function createSession(user, meta, familyId = crypto.randomUUID()) {
  const accessToken = createAccessToken(user);
  const refreshToken = generateRefreshToken();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    createdByIp: meta.ip,
    userAgent: meta.userAgent
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.accessToken.ttlSeconds,
    user: user.toJSON()
  };
}

async function revokeFamily(familyId) {
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export async function register({ name, email, password }, meta) {
  const normalizedEmail = normalizeEmail(email);

  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ja existe uma conta com este e-mail');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  let user;
  try {
    user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ja existe uma conta com este e-mail');
    }
    throw error;
  }

  return createSession(user, meta);
}

export async function login({ email, password }, meta) {
  const user = await User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await bcrypt.compare(password, passwordHash);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha invalidos');
  }

  if (!user.active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Esta conta esta desativada');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return createSession(user, meta);
}

export async function refresh(refreshToken, meta) {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });

  if (!stored) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalido');
  }

  if (stored.revokedAt) {
    await revokeFamily(stored.familyId);
    throw new AppError(
      401,
      'REFRESH_TOKEN_REUSED',
      'Refresh token ja utilizado. Todas as sessoes desta familia foram encerradas'
    );
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token expirado');
  }

  const user = await User.findById(stored.user);

  if (!user || !user.active) {
    await revokeFamily(stored.familyId);
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalido');
  }

  const session = await createSession(user, meta, stored.familyId);

  // Rotacao atomica: se outro processo ja revogou este token, a familia e encerrada.
  const rotation = await RefreshToken.updateOne(
    { _id: stored._id, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        replacedByHash: hashToken(session.refreshToken)
      }
    }
  );

  if (rotation.modifiedCount !== 1) {
    await revokeFamily(stored.familyId);
    throw new AppError(
      401,
      'REFRESH_TOKEN_REUSED',
      'Refresh token ja utilizado. Todas as sessoes desta familia foram encerradas'
    );
  }

  return session;
}

export async function logout(refreshToken) {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });

  if (stored) {
    await revokeFamily(stored.familyId);
  }
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId);

  if (!user || !user.active) {
    throw new AppError(401, 'INVALID_TOKEN', 'Usuario do token nao esta ativo');
  }

  return user.toJSON();
}

export async function requestPasswordReset(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

  // Resposta generica para nao revelar se o e-mail existe.
  if (!user || !user.active) {
    return { message: 'Se o e-mail existir, um link de redefinicao sera enviado' };
  }

  await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });

  const resetToken = generateResetToken();
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashToken(resetToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
  });

  // Em producao, envie o token por e-mail em vez de retornar na resposta.
  return {
    message: 'Se o e-mail existir, um link de redefinicao sera enviado',
    resetToken
  };
}

export async function resetPassword(token, newPassword) {
  const stored = await PasswordResetToken.findOne({ tokenHash: hashToken(token) });

  if (!stored) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Token de redefinicao invalido');
  }

  if (stored.usedAt) {
    throw new AppError(400, 'RESET_TOKEN_USED', 'Token de redefinicao ja utilizado');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'RESET_TOKEN_EXPIRED', 'Token de redefinicao expirado');
  }

  const user = await User.findById(stored.user).select('+passwordHash');

  if (!user || !user.active) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Token de redefinicao invalido');
  }

  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await user.save();

  stored.usedAt = new Date();
  await stored.save();

  await revokeAllForUser(user._id);

  return { message: 'Senha redefinida com sucesso' };
}
