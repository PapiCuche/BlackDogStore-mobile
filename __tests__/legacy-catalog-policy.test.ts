import {
  LegacyCatalogForbiddenError,
  assertLegacyCatalogAllowed,
} from '@/api/legacy-catalog-guard';
import {
  collectConfigurationIssues,
  resolveLegacyCatalogPolicy,
  type AppEnvironment,
  type LegacyCatalogPolicy,
} from '@/config/env';

/**
 * M0.2 — the legacy catalogue safety gate.
 *
 * The risk being closed: `/api/products/` on `origin/master` `2624d478` returns
 * `Product.objects…filter(is_active=True)` with no company scope, so a
 * multi-tenant client pointed at it receives EVERY company's products. Before
 * this gate, `EXPO_PUBLIC_USE_MOCK_DATA=false` was enough to point a release
 * build at exactly that.
 *
 * Every test below is one way that could happen again.
 */

const RELEASES: AppEnvironment[] = ['staging', 'production'];

describe('resolveLegacyCatalogPolicy — release builds', () => {
  it.each(RELEASES)('NEVER allows the legacy catalogue in %s, flag unset', (environment) => {
    const policy = resolveLegacyCatalogPolicy({
      environment,
      mocksEnabled: false,
      legacyFlag: undefined,
    });
    expect(policy.source).toBe('none');
    expect(policy.decision).toBe('legacy-forbidden-release');
  });

  it.each(RELEASES)('NEVER allows the legacy catalogue in %s, even with flag=true', (environment) => {
    // The flag is not a switch a release can flip. This is the single most
    // important assertion in the file.
    const policy = resolveLegacyCatalogPolicy({
      environment,
      mocksEnabled: false,
      legacyFlag: 'true',
    });
    expect(policy.source).toBe('none');
    expect(policy.decision).toBe('legacy-forbidden-release');
  });

  it.each(['TRUE', ' true ', '1', 'yes', 'false'])(
    'refuses production for flag value %p',
    (legacyFlag) => {
      const policy = resolveLegacyCatalogPolicy({
        environment: 'production',
        mocksEnabled: false,
        legacyFlag,
      });
      expect(policy.source).toBe('none');
    },
  );
});

describe('resolveLegacyCatalogPolicy — development', () => {
  it('does NOT enable the legacy catalogue by default', () => {
    // Turning mocks off must not silently reach for the unsafe endpoint.
    const policy = resolveLegacyCatalogPolicy({
      environment: 'development',
      mocksEnabled: false,
      legacyFlag: undefined,
    });
    expect(policy.source).toBe('none');
    expect(policy.decision).toBe('legacy-disabled');
  });

  it('enables it only with mocks off AND an explicit flag', () => {
    const policy = resolveLegacyCatalogPolicy({
      environment: 'development',
      mocksEnabled: false,
      legacyFlag: 'true',
    });
    expect(policy.source).toBe('legacy-api');
    expect(policy.decision).toBe('legacy-development-explicit');
  });

  it('accepts a flag with stray casing or whitespace', () => {
    const policy = resolveLegacyCatalogPolicy({
      environment: 'development',
      mocksEnabled: false,
      legacyFlag: '  TRUE ',
    });
    expect(policy.source).toBe('legacy-api');
  });

  it('ignores a flag value that is not exactly true', () => {
    for (const legacyFlag of ['1', 'yes', 'on', '']) {
      expect(
        resolveLegacyCatalogPolicy({ environment: 'development', mocksEnabled: false, legacyFlag })
          .source,
      ).toBe('none');
    }
  });
});

describe('resolveLegacyCatalogPolicy — mocks win', () => {
  it('serves mocks when they are on, whatever the legacy flag says', () => {
    const policy = resolveLegacyCatalogPolicy({
      environment: 'development',
      mocksEnabled: true,
      legacyFlag: 'true',
    });
    expect(policy.source).toBe('mock');
    expect(policy.decision).toBe('mock-active');
  });

  it('keeps the mock catalogue working in plain development', () => {
    const policy = resolveLegacyCatalogPolicy({
      environment: 'development',
      mocksEnabled: true,
      legacyFlag: undefined,
    });
    expect(policy.source).toBe('mock');
  });
});

describe('assertLegacyCatalogAllowed — defence in depth', () => {
  const allowed: LegacyCatalogPolicy = {
    source: 'legacy-api',
    decision: 'legacy-development-explicit',
    reason: 'dev opt-in',
  };
  const forbidden: LegacyCatalogPolicy = {
    source: 'none',
    decision: 'legacy-forbidden-release',
    reason: 'release',
  };
  const mocking: LegacyCatalogPolicy = {
    source: 'mock',
    decision: 'mock-active',
    reason: 'mocks',
  };

  it('permits the call when the policy allows it', () => {
    expect(() => assertLegacyCatalogAllowed(allowed)).not.toThrow();
  });

  it('blocks a direct call in a release build', () => {
    // The scenario: somebody writes `new LegacyApiCatalogRepository()` in a
    // screen, bypassing the composition root entirely.
    expect(() => assertLegacyCatalogAllowed(forbidden)).toThrow(LegacyCatalogForbiddenError);
  });

  it('blocks the call when the build is on mocks', () => {
    expect(() => assertLegacyCatalogAllowed(mocking)).toThrow(LegacyCatalogForbiddenError);
  });

  it('reports which decision blocked it', () => {
    try {
      assertLegacyCatalogAllowed(forbidden);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as LegacyCatalogForbiddenError).decision).toBe('legacy-forbidden-release');
    }
  });
});

describe('collectConfigurationIssues — refused legacy request', () => {
  const base = {
    tenant: { status: 'resolved', slug: 'acme', source: 'environment' } as const,
    apiConfigured: true,
    mockPolicy: { enabled: false, reason: 'release-default-off' } as const,
  };

  it.each(RELEASES)('flags a %s build that asked for the legacy catalogue', (environment) => {
    // It was already refused. Reporting it matters because otherwise someone
    // ships believing the catalogue is on, and it is not.
    const issues = collectConfigurationIssues({
      ...base,
      environment,
      legacyCatalogRequested: true,
    });
    expect(issues.map((issue) => issue.code)).toContain('legacy-catalog-forbidden');
  });

  it('does not flag a release that never asked', () => {
    const issues = collectConfigurationIssues({
      ...base,
      environment: 'production',
      legacyCatalogRequested: false,
    });
    expect(issues).toEqual([]);
  });

  it('does not flag development, where the opt-in is legitimate', () => {
    const issues = collectConfigurationIssues({
      ...base,
      environment: 'development',
      legacyCatalogRequested: true,
    });
    expect(issues).toEqual([]);
  });
});
