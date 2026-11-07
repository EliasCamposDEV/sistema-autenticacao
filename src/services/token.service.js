import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, type: 'access' },
    config.accessToken.secret,
    {
      algorithm: 'HS256',
      expiresIn: config.accessToken.ttlSeconds,
      issuer: config.accessToken.issuer,
      audience: config.accessToken.audience
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.accessToken.secret, {
    algorithms: ['HS256'],
    issuer: config.accessToken.issuer,
    audience: config.accessToken.audience
  });
}

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
