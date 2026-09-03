import type { AuthRuntimePolicy } from '@/auth/auth-policy';
import {
  featureIntegration,
  isMockBacked,
  type FeatureKey,
} from '@/config/integration-status';

/**
 * `featureIntegration` must not fall behind the code again.
 *
 * IT ALREADY DID, FOR SEVERAL PHASES. The table told anybody who opened
 * Profile > Estado de integración that Autenticación was `MOCK` and Pedidos was
 * `API_PENDING` "bloqueado por BR-001", while the app was calling
 * `/api/v1/auth/` and `/api/v1/customer/<slug>/orders/`. The screen is not
 * documentation — it is the app's own answer about whether what you are looking
 * at is real — so a stale row is a lie the product tells its user.
 *
 * WHAT MAKES THIS A GUARD AND NOT A LIST. The temptation is to assert the
 * statuses one by one, which produces a file somebody edits in the same commit
 * that breaks it, and which says nothing the constants do not already say. So
 * nothing here hardcodes a status. Two invariants are checked instead:
 *
 *   1. STRUCTURAL — a row that names an endpoint module which EXISTS ON DISK
 *      cannot claim to be mock-backed, and a row that claims to be integrated
 *      must name one.
 *   2. BEHAVIOURAL — for the features that resolve a repository, what the table
 *      says must match which repository the composition root actually builds
 *      when the app is pointed at the real backend.
 *
 * Wiring a surface and forgetting this file fails (1). Marking something
 * integrated that is not fails (2).
 */

type FS = { readFileSync(p: string, e: 'utf8'): string; existsSync(p: string): boolean };
const fs = jest.requireActual('fs') as FS;

/**
 * A source file with its COMMENTS REMOVED.
 *
 * `auth-v1.ts` documents, in prose, that it never sends a bearer token to
 * `/api/admin/`. A guard that read the prose would fire on the explanation and
 * pass on the code — exactly backwards.
 */
function code(relativeToSrc: string): string {
  return fs
    .readFileSync(`src/${relativeToSrc}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return '';
      return line.replace(/(^|[^:])\/\/.*$/, '$1');
    })
    .join('\n');
}

const KEYS = Object.keys(featureIntegration) as FeatureKey[];
const INTEGRATED = new Set(['INTEGRATED', 'TESTED']);

describe('structural — a row and its endpoint module must agree', () => {
  it('covers every feature with a label and a note somebody can read', () => {
    // Not decoration: the note is the only thing on that screen explaining WHY
    // a feature is where it is, and an empty one leaves a bare badge.
    for (const key of KEYS) {
      const row = featureIntegration[key];
      expect(row.label.trim().length).toBeGreaterThan(0);
      expect(row.note.trim().length).toBeGreaterThan(20);
    }
  });

  it('never claims to be mock-backed while naming a module that exists', () => {
    // THE DRIFT THIS FILE EXISTS FOR. `auth-v1.ts` was on disk and being called
    // for phases while this table said MOCK.
    for (const key of KEYS) {
      const row = featureIntegration[key];
      if (row.source === null) continue;
      const path = `src/${row.source}`;
      expect(fs.existsSync(path)).toBe(true);
      expect(isMockBacked(key)).toBe(false);
    }
  });

  it('names a real v1 endpoint module for everything it calls integrated', () => {
    for (const key of KEYS) {
      const row = featureIntegration[key];
      if (!INTEGRATED.has(row.status)) continue;
      expect(row.source).not.toBeNull();
      // Integrated means it talks to the versioned surface. Nothing else counts.
      expect(code(row.source!)).toMatch(/\/api\/v1\//);
    }
  });

  it('names no module at all for anything still pending', () => {
    for (const key of KEYS) {
      const row = featureIntegration[key];
      if (INTEGRATED.has(row.status)) continue;
      expect(row.source).toBeNull();
    }
  });

  it('never points a feature at the legacy admin surface', () => {
    for (const key of KEYS) {
      const row = featureIntegration[key];
      if (row.source === null) continue;
      expect(code(row.source)).not.toMatch(/\/api\/admin\//);
    }
  });
});

describe('behavioural — the table matches what the composition root builds', () => {
  const BACKEND: AuthRuntimePolicy = {
    mode: 'backend',
    decision: 'backend-contract-ready',
    reason: 'test',
  };

  /**
   * The repositories the app would build against a real backend, with mocks
   * off — the shape of a release build pointed at a server.
   */
  function loadRepositories() {
    let repositories!: typeof import('@/repositories').repositories;
    jest.isolateModules(() => {
      jest.doMock('@/auth/auth-policy', () => ({
        ...jest.requireActual('@/auth/auth-policy'),
        authRuntimePolicy: BACKEND,
      }));
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        useMockData: false,
        isPilotTenant: true,
        companySlug: 'blackdog',
        isApiConfigured: true,
        // The catalogue has its OWN policy, decided in `env` rather than from
        // the auth mode — spreading the real module would recompute it from
        // the development environment and hand back the mock repository.
        catalogPolicy: {
          source: 'api-v1',
          decision: 'api-v1-tenant-scoped',
          reason: 'test',
        },
        isRealCatalogActive: true,
      }));
      ({ repositories } = require('@/repositories'));
    });
    return repositories;
  }

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/auth/auth-policy');
    jest.dontMock('@/config/env');
  });

  /** The features whose data source the composition root actually decides. */
  const REPOSITORY_BACKED: readonly [FeatureKey, 'catalog' | 'orders' | 'repairs' | 'company'][] = [
    ['catalog', 'catalog'],
    ['orders', 'orders'],
    ['repairs', 'repairs'],
    ['companyBrand', 'company'],
  ];

  it('builds a real repository for every feature it calls integrated', () => {
    const repositories = loadRepositories();
    for (const [key, slot] of REPOSITORY_BACKED) {
      if (!INTEGRATED.has(featureIntegration[key].status)) continue;
      const built = repositories[slot];
      expect(built).not.toBeNull();
      // A `Mock*` class here would mean the table promises live data and the
      // app serves fixtures — the failure the "datos de ejemplo" marker exists
      // to prevent, arriving with the marker switched off.
      expect(built?.constructor.name).not.toMatch(/^Mock/);
    }
  });

  it('builds no real repository for anything it calls pending', () => {
    const repositories = loadRepositories();
    for (const [key, slot] of REPOSITORY_BACKED) {
      if (INTEGRATED.has(featureIntegration[key].status)) continue;
      const built = repositories[slot];
      if (built === null) continue;
      expect(built.constructor.name).toMatch(/^Mock/);
    }
  });
});

describe('the internal audience is on the list at all', () => {
  it('accounts for every endpoint module the app ships', () => {
    // The other half of the drift: this table listed five features while the
    // app shipped eleven, so the internal console simply did not appear. An
    // endpoint module with no row is a surface nobody is tracking.
    const modules = (jest.requireActual('fs') as { readdirSync(p: string): string[] })
      .readdirSync('src/api/endpoints')
      .filter((f) => f.endsWith('.ts'));
    const claimed = new Set(
      KEYS.map((k) => featureIntegration[k].source)
        .filter((s): s is string => s !== null)
        .map((s) => s.replace('api/endpoints/', '')),
    );
    const orphaned = modules.filter((m) => !claimed.has(m));
    expect(orphaned).toEqual([]);
  });
});
