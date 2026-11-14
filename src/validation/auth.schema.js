import { z } from 'zod';

const passwordSchema = z
  .string({ required_error: 'A senha e obrigatoria' })
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .max(72, 'A senha deve ter no maximo 72 caracteres')
  .regex(/[a-z]/, 'A senha deve conter uma letra minuscula')
  .regex(/[A-Z]/, 'A senha deve conter uma letra maiuscula')
  .regex(/\d/, 'A senha deve conter um numero');

const emailSchema = z
  .string({ required_error: 'O e-mail e obrigatorio' })
  .trim()
  .toLowerCase()
  .email('Informe um e-mail valido')
  .max(160, 'O e-mail deve ter no maximo 160 caracteres');

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'O nome e obrigatorio' })
      .trim()
      .min(2, 'O nome deve ter pelo menos 2 caracteres')
      .max(120, 'O nome deve ter no maximo 120 caracteres'),
    email: emailSchema,
    password: passwordSchema
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string({ required_error: 'A senha e obrigatoria' }).min(1, 'A senha e obrigatoria')
  })
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z
      .string({ required_error: 'O refresh token e obrigatorio' })
      .min(1, 'O refresh token e obrigatorio')
  })
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema
  })
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z
      .string({ required_error: 'O token e obrigatorio' })
      .min(1, 'O token e obrigatorio'),
    password: passwordSchema
  })
});
