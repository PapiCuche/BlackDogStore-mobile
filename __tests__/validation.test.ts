import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  verifyEmailSchema,
} from '@/validation/auth-schemas';

describe('loginSchema', () => {
  it('accepts a well-formed credential pair', () => {
    const result = loginSchema.safeParse({ email: 'carlos@example.com', password: 'anything' });
    expect(result.success).toBe(true);
  });

  it('trims the email before validating', () => {
    const result = loginSchema.safeParse({ email: '  carlos@example.com ', password: 'x' });
    expect(result.success && result.data.email).toBe('carlos@example.com');
  });

  it('rejects a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'carlos@', password: 'x' }).success).toBe(false);
  });

  it('does not impose a length rule on an existing password', () => {
    // Login must accept any non-empty password: an account may predate whatever
    // rule we apply today, and rejecting it would lock the user out.
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'abc' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    firstName: 'Carlos',
    email: 'carlos@example.com',
    password: 'unaClaveSegura',
    confirmPassword: 'unaClaveSegura',
  };

  it('accepts a complete registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('enforces the 8-character minimum Django also enforces', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'corto1', confirmPassword: 'corto1' });
    expect(result.success).toBe(false);
  });

  it('reports mismatched passwords on the confirmation field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'otraClaveSegura' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error must land on the field the user has to fix, not on the form.
      expect(result.error.issues[0]!.path).toEqual(['confirmPassword']);
    }
  });
});

describe('forgotPasswordSchema', () => {
  it('requires a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'carlos@example.com' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('verifyEmailSchema', () => {
  it('accepts exactly six digits', () => {
    expect(verifyEmailSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 456'])('rejects %p', (code) => {
    expect(verifyEmailSchema.safeParse({ code }).success).toBe(false);
  });
});
