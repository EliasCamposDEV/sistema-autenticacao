import { AppError } from '../errors.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Rota ${req.method} ${req.originalUrl} nao encontrada`));
}
