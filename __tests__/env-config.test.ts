import {
  PILOT_COMPANY_SLUG,
  collectConfigurationIssues,
  isInsecureApiUrl,
  isLocalOnlyApiHost,
  resolveAppEnvironment,
  resolveMockDataPolicy,
  resolveTenant,
  type AppEnvironment,
} from '@/config/env';

/**
 * The fail-safe rules from M0.1.
 *
 * Every case below describes a real way a release could ship wrong: a variable
 * left unset, a stale `=true` carried over from a staging build, a tenant slug
 * nobody filled in. The rule under test is always the same — a MISSING variable
 * must resolve to the strict answer, never the permissive one.
 */

const RELEASES: AppEnvironment[] = ['staging', 'production'];

describe('resolveAppEnvironment', () => {
  it('treats a Metro build as development regardless of the variable', () => {
    expect(resolveAppEnvironment({ isDev: true, appEnv: undefined })).toBe('development');
    expect(resolveAppEnvironment({ isDev: true, appEnv: 'production' })).toBe('development');
  });

  it('resolves an unset variable in a release to production, the stricter one', () => {
    expect(resolveAppEnvironment({ isDev: false, appEnv: undefined })).toBe('production');
    expect(resolveAppEnvironment({ isDev: false, appEnv: '' })).toBe('production');
  });

  it('recognises staging only when it is named explicitly', () => {
    expect(resolveAppEnvironment({ isDev: false, appEnv: 'staging' })).toBe('staging');
    expect(resolveAppEnvironment({ isDev: false, appEnv: ' staging ' })).toBe('staging');
    expect(resolveAppEnvironment({ isDev: false, appEnv: 'stage' })).toBe('production');
  });
});

describe('resolveMockDataPolicy', () => {
  it('enables mocks in development when nothing is configured', () => {
    // The whole point of the development default: the app runs after a clone.
    const policy = resolveMockDataPolicy({ environment: 'development', raw: undefined });
    expect(policy.enabled).toBe(true);
    expect(policy.reason).toBe('development-default');
  });

  it('lets a developer opt out', () => {
    expect(resolveMockDataPolicy({ environment: 'development', raw: 'false' }).enabled).toBe(false);
  });

  it.each(RELEASES)('does NOT enable mocks in %s when the variable is unset', (environment) => {
    // The regression this exists to prevent: a release shipping fake data
    // because somebody forgot a variable.
    expect(resolveMockDataPolicy({ environment, raw: undefined }).enabled).toBe(false);
  });

  it.each(RELEASES)('does NOT enable mocks in %s when the variable is empty', (environment) => {
    expect(resolveMockDataPolicy({ environment, raw: '' }).enabled).toBe(false);
    expect(resolveMockDataPolicy({ environment, raw: '   ' }).enabled).toBe(false);
  });

  it('allows mocks in staging only via an explicit opt-in', () => {
    const optedIn = resolveMockDataPolicy({ environment: 'staging', raw: 'true' });
    expect(optedIn.enabled).toBe(true);
    expect(optedIn.reason).toBe('staging-explicit-opt-in');
  });

  it.each(['true', 'TRUE', 'yes', '1', 'false', undefined])(
    'REFUSES mocks in production for value %p',
    (raw) => {
      // Production has no value that turns mocks on. Showing a customer a
      // fabricated repair or order is not a mistake we leave reachable.
      const policy = resolveMockDataPolicy({ environment: 'production', raw });
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('production-forbidden');
    },
  );

  it('ignores a stray value that is not exactly true/false', () => {
    // Staging: anything other than "true" is not an opt-in.
    expect(resolveMockDataPolicy({ environment: 'staging', raw: 'yes' }).enabled).toBe(false);
    // Development: anything other than "false" is not an opt-out.
    expect(resolveMockDataPolicy({ environment: 'development', raw: 'no' }).enabled).toBe(true);
  });
});

describe('resolveTenant', () => {
  it('assumes the pilot only in development', () => {
    const result = resolveTenant({ environment: 'development', raw: undefined });
    expect(result).toEqual({
      status: 'resolved',
      slug: PILOT_COMPANY_SLUG,
      source: 'development-pilot',
    });
  });

  it.each(RELEASES)('reports a missing tenant in %s instead of assuming one', (environment) => {
    // A SaaS build must not silently become Black Dog Store because a variable
    // was left blank.
    expect(resolveTenant({ environment, raw: undefined })).toEqual({ status: 'missing' });
    expect(resolveTenant({ environment, raw: '   ' })).toEqual({ status: 'missing' });
  });

  it.each(RELEASES)('uses the configured tenant in %s', (environment) => {
    expect(resolveTenant({ environment, raw: 'otra-empresa' })).toEqual({
      status: 'resolved',
      slug: 'otra-empresa',
      source: 'environment',
    });
  });

  it('normalises the slug', () => {
    const result = resolveTenant({ environment: 'production', raw: '  BlackDog  ' });
    expect(result).toEqual({ status: 'resolved', slug: 'blackdog', source: 'environment' });
  });
});

describe('collectConfigurationIssues', () => {
  const okPolicy = { enabled: false, reason: 'release-default-off' } as const;

  it('reports nothing in development, where defaults are intentional', () => {
    const issues = collectConfigurationIssues({
      environment: 'development',
      tenant: { status: 'missing' },
      apiConfigured: false,
      mockPolicy: { enabled: true, reason: 'development-default' },
    });
    expect(issues).toEqual([]);
  });

  it('flags a release with no tenant and no API url', () => {
    const issues = collectConfigurationIssues({
      environment: 'production',
      tenant: { status: 'missing' },
      apiConfigured: false,
      mockPolicy: okPolicy,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['missing-tenant', 'missing-api-url']);
  });

  it('flags a release that somehow ended up on mocks', () => {
    const issues = collectConfigurationIssues({
      environment: 'staging',
      tenant: { status: 'resolved', slug: 'acme', source: 'environment' },
      apiConfigured: true,
      mockPolicy: { enabled: true, reason: 'staging-explicit-opt-in' },
    });
    expect(issues.map((issue) => issue.code)).toEqual(['mocks-in-release']);
  });

  it('reports nothing for a correctly configured release', () => {
    const issues = collectConfigurationIssues({
      environment: 'production',
      tenant: { status: 'resolved', slug: 'acme', source: 'environment' },
      apiConfigured: true,
      mockPolicy: okPolicy,
    });
    expect(issues).toEqual([]);
  });
});

/**
 * A DISTRIBUTED BUILD MAY NOT POINT AT A LOCAL MACHINE.
 *
 * `localhost` baked into an EAS preview or production binary is the
 * developer's laptop as seen from somebody else's phone: every request fails,
 * or worse, reaches whatever answers on that port on THEIR network. The build
 * resolves to no API at all and says it is unconfigured, loudly and once,
 * instead of failing one request at a time.
 *
 * Development is exempt, because a local backend is the whole point there —
 * the QA flow of this project runs Django on `localhost:8000`.
 */
describe('isLocalOnlyApiHost', () => {
  it('recognises every way of writing «this machine»', () => {
    for (const url of [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://0.0.0.0:8000',
      // The Android emulator's alias for its host Mac. Outside an emulator it
      // addresses somebody's LAN, which is not a Black Dog server.
      'http://10.0.2.2:8000',
      'http://macbook-de-ana.local:8000',
      'https://LOCALHOST/api',
    ]) {
      expect(isLocalOnlyApiHost(url)).toBe(true);
    }
  });

  it('leaves a real deployment alone', () => {
    for (const url of [
      'https://blackdogstoreperu.com',
      'https://api.example.test',
      'http://192.168.1.40:8000',
    ]) {
      expect(isLocalOnlyApiHost(url)).toBe(false);
    }
  });

  it('says nothing about a string it cannot read as a URL', () => {
    // Not a hostname we can clear, so not one we can condemn either: the
    // configuration check reports an unusable value on its own terms.
    expect(isLocalOnlyApiHost('not a url')).toBe(false);
    expect(isLocalOnlyApiHost('')).toBe(false);
  });
});

/**
 * Cleartext in a distributed build is not a weaker connection: iOS refuses it
 * under App Transport Security and Android refuses it under its network
 * config, so every request fails — after somebody has already typed their
 * password into it.
 */
describe('isInsecureApiUrl', () => {
  it('condemns anything that is not HTTPS', () => {
    for (const url of [
      'http://blackdogstoreperu.com',
      'http://192.168.1.40:8000',
      'ws://blackdogstoreperu.com',
    ]) {
      expect(isInsecureApiUrl(url)).toBe(true);
    }
  });

  it('leaves HTTPS alone, whatever the case', () => {
    expect(isInsecureApiUrl('https://blackdogstoreperu.com')).toBe(false);
    expect(isInsecureApiUrl('HTTPS://BLACKDOGSTOREPERU.COM')).toBe(false);
  });

  it('says nothing about a string it cannot read as a URL', () => {
    expect(isInsecureApiUrl('not a url')).toBe(false);
    expect(isInsecureApiUrl('')).toBe(false);
  });
});

describe('the API base a release resolves to', () => {
  function load(env: Record<string, string | undefined>, isDev: boolean) {
    let module!: typeof import('@/config/env');
    jest.isolateModules(() => {
      const previous = { ...process.env };
      Object.assign(process.env, env);
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = isDev;
      module = require('@/config/env');
      process.env = previous;
    });
    return module;
  }

  it('refuses a local host in a release build', () => {
    const module = load(
      {
        EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8000',
        EXPO_PUBLIC_APP_ENV: 'staging',
      },
      false,
    );

    expect(module.apiBaseUrl).toBe('');
    expect(module.isApiConfigured).toBe(false);
  });

  it('keeps a local host in a development build', () => {
    const module = load(
      { EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8000' },
      true,
    );

    expect(module.apiBaseUrl).toBe('http://localhost:8000');
  });

  it('refuses a cleartext deployment in a release build', () => {
    // A real host, reachable, and still not shippable: the platform will not
    // make the call, so the app says it is unconfigured instead of failing
    // one request at a time.
    const module = load(
      {
        EXPO_PUBLIC_API_BASE_URL: 'http://blackdogstoreperu.com',
        EXPO_PUBLIC_APP_ENV: 'production',
      },
      false,
    );

    expect(module.apiBaseUrl).toBe('');
    expect(module.isApiConfigured).toBe(false);
  });

  it('keeps plain HTTP in a development build', () => {
    const module = load(
      { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.0.141:8000' },
      true,
    );

    expect(module.apiBaseUrl).toBe('http://192.168.0.141:8000');
  });

  it('keeps a real deployment in a release build, without its trailing slash', () => {
    const module = load(
      {
        EXPO_PUBLIC_API_BASE_URL: 'https://blackdogstoreperu.com/',
        EXPO_PUBLIC_APP_ENV: 'production',
      },
      false,
    );

    expect(module.apiBaseUrl).toBe('https://blackdogstoreperu.com');
  });
});
