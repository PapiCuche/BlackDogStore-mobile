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
  // M1 correction: the backend mints `secrets.token_urlsafe(48)`, not a
  // six-digit code. The old rule would have rejected every real token.
  const realShapedToken = 'x7Qv-3kZ_9abcDEFghijKLMnop012345678-_qrstuvWXYZ0123456789ab';

  it('accepts a token of the shape the backend actually mints', () => {
    expect(verifyEmailSchema.safeParse({ code: realShapedToken }).success).toBe(true);
  });

  it('trims surrounding whitespace from a pasted token', () => {
    const result = verifyEmailSchema.safeParse({ code: `  ${realShapedToken} ` });
    expect(result.success && result.data.code).toBe(realShapedToken);
  });

  it('rejects a six-digit code, which this backend never issues', () => {
    expect(verifyEmailSchema.safeParse({ code: '123456' }).success).toBe(false);
  });

  it.each(['', 'corto', 'tiene espacios en medio aaaaaaaaaaaaaaaa', 'con/barra/aaaaaaaaaaaaaaaa'])(
    'rejects %p',
    (code) => {
      expect(verifyEmailSchema.safeParse({ code }).success).toBe(false);
    },
  );
});
