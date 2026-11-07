import { AppError } from '../errors.js';
import { config } from '../config.js';

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      timestamp: new Date().toISOString()
    });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      code: 'INVALID_JSON',
      message: 'Corpo da requisicao nao e um JSON valido',
      timestamp: new Date().toISOString()
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Dados invalidos',
      details: Object.values(error.errors).map((item) => ({
        field: item.path,
        message: item.message
      })),
      timestamp: new Date().toISOString()
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Ja existe uma conta com este e-mail',
      timestamp: new Date().toISOString()
    });
  }

  console.error('[error]', error);

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Erro interno. Tente novamente mais tarde.',
    ...(config.isProduction ? {} : { debug: error.message }),
    timestamp: new Date().toISOString()
  });
}
