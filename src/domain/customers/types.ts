/**
 * The signed-in person.
 *
 * VERIFIED against `UserSerializer` / `UserProfile` in the Web repository:
 * Django uses the stock `auth.User` (username, email, first_name, last_name)
 * plus a `UserProfile.role`. There is no phone or avatar field, so neither is
 * modelled here — inventing them would produce a profile screen that cannot be
 * filled from the backend.
 */

/** `UserProfile.ROLE_*` in Django. */
export type CustomerRole = 'customer' | 'sales' | 'inventory' | 'technician' | 'admin' | 'superadmin';

export type Customer = {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: CustomerRole;
  /** Django deactivates the account until the email is verified. */
  isEmailVerified: boolean;
};

/**
 * Best available name for greeting the customer.
 *
 * Falls back through first name → username → a neutral greeting, because
 * `first_name` is `blank=True` on Django's User and is very often empty.
 */
export function displayName(customer: Customer | null): string | null {
  if (!customer) return null;
  const first = customer.firstName.trim();
  if (first) return first;
  const username = customer.username.trim();
  return username || null;
}

export function initials(customer: Customer | null): string {
  if (!customer) return '?';
  const first = customer.firstName.trim();
  const last = customer.lastName.trim();
  if (first && last) return (first.charAt(0) + last.charAt(0)).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  const username = customer.username.trim();
  return username ? username.slice(0, 2).toUpperCase() : '?';
}
