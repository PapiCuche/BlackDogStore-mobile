import { z } from 'zod';

/**
 * Form schemas.
 *
 * Client-side validation is a UX affordance, not a security control — Django
 * revalidates everything. What it buys us is an error next to the field instead
 * of a round trip, and one definition of "valid" shared by the form and its
 * inferred TypeScript type.
 *
 * Messages are the ones the user reads, so they are written in Spanish here
 * rather than mapped somewhere else.
 */

const email = z
  .string()
  .trim()
  .min(1, 'Ingresa tu correo.')
  .email('Ingresa un correo válido.');

/**
 * Password rules mirror Django's `AUTH_PASSWORD_VALIDATORS` defaults, which
 * enforce a minimum of 8 characters. Being stricter here than the server would
 * reject an account the backend would have accepted.
 */
const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(128, 'La contraseña es demasiado larga.');

export const loginSchema = z.object({
  email,
  // Login only checks presence: an existing account may predate any rule we
  // apply now, and telling someone their correct password is "too short" is
  // both wrong and a hint about the format.
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Ingresa tu nombre.').max(64, 'El nombre es demasiado largo.'),
    email,
    password,
    confirmPassword: z.string().min(1, 'Repite tu contraseña.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/** Django issues a 6-digit code for email verification flows. */
export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'El código tiene 6 dígitos.'),
});

export type VerifyEmailFormValues = z.infer<typeof verifyEmailSchema>;
