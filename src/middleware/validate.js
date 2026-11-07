import { AppError } from '../errors.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.').replace(/^body\./, ''),
        message: issue.message
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Dados invalidos', details));
    }

    req.validated = result.data;
    return next();
  };
}
