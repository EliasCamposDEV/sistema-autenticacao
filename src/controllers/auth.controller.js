import * as authService from '../services/auth.service.js';

function requestMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null
  };
}

export async function register(req, res) {
  const session = await authService.register(req.validated.body, requestMeta(req));
  res.status(201).json(session);
}

export async function login(req, res) {
  const session = await authService.login(req.validated.body, requestMeta(req));
  res.json(session);
}

export async function refresh(req, res) {
  const session = await authService.refresh(req.validated.body.refreshToken, requestMeta(req));
  res.json(session);
}

export async function logout(req, res) {
  await authService.logout(req.validated.body.refreshToken);
  res.status(204).send();
}

export async function me(req, res) {
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ user });
}
