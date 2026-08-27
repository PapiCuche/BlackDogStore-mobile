import {
  PILOT_COMPANY_SLUG,
  collectConfigurationIssues,
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
      legacyCatalogRequested: false,
    });
    expect(issues).toEqual([]);
  });

  it('flags a release with no tenant and no API url', () => {
    const issues = collectConfigurationIssues({
      environment: 'production',
      tenant: { status: 'missing' },
      apiConfigured: false,
      mockPolicy: okPolicy,
      legacyCatalogRequested: false,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['missing-tenant', 'missing-api-url']);
  });

  it('flags a release that somehow ended up on mocks', () => {
    const issues = collectConfigurationIssues({
      environment: 'staging',
      tenant: { status: 'resolved', slug: 'acme', source: 'environment' },
      apiConfigured: true,
      mockPolicy: { enabled: true, reason: 'staging-explicit-opt-in' },
      legacyCatalogRequested: false,
    });
    expect(issues.map((issue) => issue.code)).toEqual(['mocks-in-release']);
  });

  it('reports nothing for a correctly configured release', () => {
    const issues = collectConfigurationIssues({
      environment: 'production',
      tenant: { status: 'resolved', slug: 'acme', source: 'environment' },
      apiConfigured: true,
      mockPolicy: okPolicy,
      legacyCatalogRequested: false,
    });
    expect(issues).toEqual([]);
  });
});
