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

/**
 * Email verification token.
 *
 * CORRECTED IN M1. This used to require exactly six digits, which the real
 * backend can never produce: verified on `origin/master` `2624d478`,
 * `AccountToken.make()` issues `secrets.token_urlsafe(48)` and
 * `VerifyEmailSerializer` accepts it as a plain `CharField` named `token`.
 * A six-digit rule would have rejected every genuine token.
 *
 * The realistic flow is a deep link carrying the token, not a typed code — but
 * until BR-001 settles the mobile verification contract, the field accepts the
 * token shape the backend actually mints.
 */
export const verifyEmailSchema = z.object({
  code: z
    .string()
    .trim()
    .min(16, 'El código de verificación no es válido.')
    .max(256, 'El código de verificación no es válido.')
    // `token_urlsafe` yields base64url: letters, digits, '-' and '_'.
    .regex(/^[A-Za-z0-9_-]+$/, 'El código de verificación no es válido.'),
});

export type VerifyEmailFormValues = z.infer<typeof verifyEmailSchema>;
