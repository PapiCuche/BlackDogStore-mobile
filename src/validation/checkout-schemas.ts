import { z } from 'zod';

/**
 * Checkout form rules.
 *
 * Mirrors what the SERVER enforces, so a mistake is caught before a round trip
 * rather than as a 400 the user has to interpret. The server still validates
 * everything: this is convenience, never authority.
 *
 * The Peruvian phone shape matches the backend's `_PERU_PHONE_RE`. The DNI rule
 * matches its eight-digit check.
 */
const PERU_PHONE = /^(\+?51)?\s*9\d{2}\s*\d{3}\s*\d{3}$/;

export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, 'Ingresa tu nombre completo.')
    .max(255, 'El nombre es demasiado largo.'),
  customerPhone: z
    .string()
    .trim()
    .refine((value) => PERU_PHONE.test(value.replace(/\s/g, '')), {
      message: 'Teléfono inválido. Ejemplo: 987654321.',
    }),
  documentNumber: z
    .string()
    .trim()
    .regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos.'),
});

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
