import { AppError } from '../errors.js';
import { User } from '../models/user.js';
import { verifyAccessToken } from '../services/token.service.js';

export async function requireAuth(req, _res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token de acesso ausente');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Token de acesso expirado');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Token de acesso invalido');
  }

  if (payload.type !== 'access') {
    throw new AppError(401, 'INVALID_TOKEN', 'Tipo de token invalido');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) {
    throw new AppError(401, 'INVALID_TOKEN', 'Usuario do token nao esta ativo');
  }

  req.user = user;
  next();
}
