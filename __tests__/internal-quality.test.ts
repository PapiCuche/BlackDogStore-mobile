import {
  CAP_SERVICE_ORDERS_VIEW,
  CAP_SERVICE_QUALITY_MANAGE,
  CAP_SERVICE_REPAIR_MANAGE,
  QUALITY_RESULTS,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import {
  describeRepairStatus,
  repairStatusMeta,
} from '@/domain/repairs/status';
import {
  isRepairOpen,
  isKnownRepairStatus,
  REPAIR_STAGES,
  repairStageIndex,
} from '@/domain/repairs/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M11 — the inspection.
 *
 * The server owns the checklist, the verdict and the rework. These pin down
 * that the app draws a snapshot it did not author, sends answers rather than
 * conclusions, and cannot reach either new state on its own.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_p: string, _o: unknown, _d: unknown) => {
    if (thrown) throw thrown;
    return options.result ?? {};
  });

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (p: string, o: unknown, d: unknown) => send(p, o, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/internal-service-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

function context(capabilities: string[]): InternalContext {
  return {
    company: { slug: 'blackdog', name: 'Black Dog Store' },
    member: true,
    capabilities,
    isPlatformMaster: false,
  };
}

const WIRE_ITEM = {
  id: 900, code: 'power', label: 'Enciende y arranca correctamente',
  is_required: true, result: '', notes: '', sort_order: 10,
};

const WIRE_CHECK = {
  id: 400, status: 'in_progress', status_label: 'En curso', is_open: true,
  template_name: 'Control general', notes: 'Revisar el conector.',
  checked_by_name: 'Tomás Técnico', completed_by_name: '',
  execution_id: 300, started_at: '2026-09-02T12:00:00Z', completed_at: null,
  items: [WIRE_ITEM],
};

describe('the two states M11 built', () => {
  it('are known, and sit at the end of the ladder in order', () => {
    for (const code of ['quality_control', 'ready_for_pickup']) {
      expect(isKnownRepairStatus(code)).toBe(true);
    }
    expect(repairStageIndex('quality_control'))
      .toBeGreaterThan(repairStageIndex('repaired'));
    expect(repairStageIndex('ready_for_pickup'))
      .toBeGreaterThan(repairStageIndex('quality_control'));
  });

  it('keeps a device that passed OPEN, because nobody has collected it', () => {
    const base = {
      id: 1, number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x',
      reportedIssue: 'y', receivedAt: '', closedAt: null, updatedAt: '', timeline: [],
    };
    expect(isRepairOpen({ ...base, status: 'quality_control' })).toBe(true);
    expect(isRepairOpen({ ...base, status: 'ready_for_pickup' })).toBe(true);
  });

  it('labels ready_for_pickup without claiming anybody was told', () => {
    // This platform has no notification channel. A label saying "avisado"
    // would have customers turning up for nothing.
    const label = repairStatusMeta.ready_for_pickup.label.toLowerCase();
    for (const forbidden of ['avisad', 'notificad', 'llamad', 'pagad', 'entregad']) {
      expect(label).not.toContain(forbidden);
    }
    expect(repairStatusMeta.ready_for_pickup.label).toBe('Listo para recoger');
  });

  it('still prefers the tenant word over both', () => {
    expect(describeRepairStatus('quality_control', 'En pruebas').label).toBe('En pruebas');
    expect(describeRepairStatus('ready_for_pickup', 'Puede pasar').label).toBe('Puede pasar');
  });

  it('leaves delivered and warranty unknown, because they have no module', () => {
    for (const future of ['delivered', 'warranty']) {
      expect(isKnownRepairStatus(future)).toBe(false);
      expect(repairStageIndex(future)).toBe(-1);
      expect(REPAIR_STAGES).not.toContain(future as never);
    }
  });
});

describe('the client talks to the quality surface', () => {
  it('hangs every route off the order', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/orders/7/quality/',
        (m) => m.fetchServiceQualityCheck(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quality/history/',
        (m) => m.fetchServiceQualityHistory(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quality/',
        (m) => m.postServiceQualityStart(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quality/items/900/',
        (m) => m.patchServiceQualityItem(7, 900, { result: 'pass' }, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quality/pass/',
        (m) => m.postServiceQualityPass(7, '', DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quality/fail/',
        (m) => m.postServiceQualityFail(7, '', DEPS)],
    ];
    for (const [path, call] of cases) {
      const { module, send } = load({ result: { results: [], items: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('never names the admin surface', async () => {
    const { module, send } = load({ result: { items: [] } });
    await module.postServiceQualityStart(7, DEPS);
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('treats a 404 as out of scope, not lost membership', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });
    await expect(module.fetchServiceQualityCheck(7, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
  });

  it('turns a refused pass into the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Faltan 2 punto(s) obligatorio(s) por responder.', {
          status: 400,
        }),
    });
    await expect(module.postServiceQualityPass(7, '', DEPS))
      .rejects.toThrow('obligatorio');
  });
});

describe('a write is an INTENTION, never a verdict', () => {
  it('opens an inspection with an empty body', async () => {
    const { module, send } = load({ result: WIRE_CHECK });
    await module.postServiceQualityStart(7, DEPS);
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('answers ONE point with a result and optionally why', async () => {
    const { module, send } = load({ result: WIRE_CHECK });
    await module.patchServiceQualityItem(
      7, 900, { result: 'fail', notes: 'No enfoca.' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      result: 'fail', notes: 'No enfoca.',
    });
  });

  it('omits an empty note rather than sending a blank', async () => {
    const { module, send } = load({ result: WIRE_CHECK });
    await module.patchServiceQualityItem(7, 900, { result: 'pass' }, DEPS);
    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body))
      .toEqual(['result']);
  });

  it('has NO field that asserts the outcome', async () => {
    // A checklist whose result could be sent by whoever filled it in is a
    // checklist that proves nothing. Pass and fail send a note, or nothing.
    for (const call of [
      (m: Loaded) => m.postServiceQualityPass(7, 'Todo bien.', DEPS),
      (m: Loaded) => m.postServiceQualityFail(7, 'Vuelve al banco.', DEPS),
    ]) {
      const { module, send } = load({ result: WIRE_CHECK });
      await call(module);
      const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
      expect(Object.keys(body)).toEqual(['notes']);
      for (const forbidden of [
        'status', 'result', 'passed', 'failed', 'completed_at', 'completed_by',
        'checked_by', 'execution', 'company', 'items',
      ]) {
        expect(Object.keys(body)).not.toContain(forbidden);
      }
    }
  });

  it('sends no body at all when there is no note', async () => {
    const { module, send } = load({ result: WIRE_CHECK });
    await module.postServiceQualityPass(7, '   ', DEPS);
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('offers exactly the three results the server accepts', () => {
    expect(QUALITY_RESULTS.map((r) => r.value))
      .toEqual(['pass', 'fail', 'not_applicable']);
  });
});

describe('mapping — verified against a real response', () => {
  it('maps the check and its snapshot', async () => {
    const { module } = load({ result: { quality_check: WIRE_CHECK } });
    const check = await module.fetchServiceQualityCheck(7, DEPS);

    expect(check).toMatchObject({
      id: 400, status: 'in_progress', isOpen: true,
      templateName: 'Control general', executionId: 300, completedAt: null,
    });
    expect(check!.items[0]).toEqual({
      id: 900, code: 'power', label: 'Enciende y arranca correctamente',
      isRequired: true, result: '', notes: '', sortOrder: 10,
    });
  });

  it('treats a null check as a normal answer', async () => {
    const { module } = load({ result: { quality_check: null } });
    await expect(module.fetchServiceQualityCheck(7, DEPS)).resolves.toBeNull();
  });

  it('requires the two computed flags to be strictly true', async () => {
    const { module } = load({
      result: {
        quality_check: {
          ...WIRE_CHECK, is_open: 'yes',
          items: [{ ...WIRE_ITEM, is_required: 1 }],
        },
      },
    });
    const check = await module.fetchServiceQualityCheck(7, DEPS);
    expect(check!.isOpen).toBe(false);
    expect(check!.items[0]!.isRequired).toBe(false);
  });

  it('never receives a template id, so it cannot re-render an old check', async () => {
    // The snapshot IS the record. A client holding the template id would be one
    // refactor away from drawing yesterday's inspection through today's list.
    const { module } = load({
      result: { quality_check: { ...WIRE_CHECK, template: 12, template_id: 12 } },
    });
    const check = await module.fetchServiceQualityCheck(7, DEPS);
    expect(Object.keys(check!)).not.toContain('template');
    expect(Object.keys(check!)).not.toContain('templateId');
    expect(check!.templateName).toBe('Control general');
  });

  it('reads the history as {count, results}', async () => {
    const { module } = load({ result: { count: 2, results: [WIRE_CHECK] } });
    const page = await module.fetchServiceQualityHistory(7, DEPS);
    expect(Object.keys(page)).toEqual(['count', 'results']);
    expect(page.count).toBe(2);
  });
});

describe('capabilities keep the bench and the inspection apart', () => {
  it('does not imply quality from repair', () => {
    // A shop that wants a second pair of eyes grants one role each.
    const technician = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_REPAIR_MANAGE]);
    expect(hasUxCapability(technician, CAP_SERVICE_REPAIR_MANAGE)).toBe(true);
    expect(hasUxCapability(technician, CAP_SERVICE_QUALITY_MANAGE)).toBe(false);
  });

  it('does not imply repair from quality', () => {
    const inspector = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_QUALITY_MANAGE]);
    expect(hasUxCapability(inspector, CAP_SERVICE_QUALITY_MANAGE)).toBe(true);
    expect(hasUxCapability(inspector, CAP_SERVICE_REPAIR_MANAGE)).toBe(false);
  });

  it('uses the SAME capability string the backend enforces', () => {
    // Web and Mobile share one catalogue. A mobile-only permission name would
    // be a second RBAC nobody agreed to.
    expect(CAP_SERVICE_QUALITY_MANAGE).toBe('service.quality.manage');
  });
});

describe('cache — the inspection hangs off its order', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests under the service root', () => {
    const root = queryKeys.internalServiceRoot(scope);
    for (const key of [
      queryKeys.internalServiceQuality(scope, 7),
      queryKeys.internalServiceQualityHistory(scope, 7),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('keeps the check apart from its history and from other orders', () => {
    expect(queryKeys.internalServiceQuality(scope, 7))
      .not.toEqual(queryKeys.internalServiceQualityHistory(scope, 7));
    expect(queryKeys.internalServiceQuality(scope, 7))
      .not.toEqual(queryKeys.internalServiceQuality(scope, 8));
  });

  it('does not collide with the execution or parts keys', () => {
    for (const other of [
      queryKeys.internalServiceExecution(scope, 7),
      queryKeys.internalServiceParts(scope, 7),
    ]) {
      expect(queryKeys.internalServiceQuality(scope, 7)).not.toEqual(other);
    }
  });
});

describe('structural — the inspection cannot drift', () => {
  type FS = {
    readFileSync(p: string, e: 'utf8'): string;
    readdirSync(p: string): string[];
    statSync(p: string): { isDirectory(): boolean };
  };
  const fs = jest.requireActual('fs') as FS;
  const nodePath = jest.requireActual('path') as { join(...p: string[]): string };

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((entry: string) => {
      const full = nodePath.join(dir, entry);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const code = (f: string) => stripComments(fs.readFileSync(f, 'utf8'));

  const M11_FILES = [
    'src/features/internal/service-quality-section.tsx',
    ...sourceFiles('src/app/internal/service'),
  ];

  it('hardcodes no checklist', () => {
    // The list is a SNAPSHOT the server copied. One written here would ignore
    // what each shop configured and disagree with what was actually tested.
    const offenders = M11_FILES.filter((f) => {
      const c = code(f);
      return /(CHECKLIST|checklistItems|DEFAULT_ITEMS|'power'|'charging'|'repaired_function')/
        .test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('never computes the verdict as authority', () => {
    // A preview is fine; `items.every(...)` feeding a request is not.
    const c = code('src/features/internal/service-quality-section.tsx');
    expect(c).not.toMatch(/items\.every\s*\(/);
    expect(c).not.toMatch(/overallPassed|canPass\s*=|isPassed\s*=/);
  });

  it('never authorizes on a role name', () => {
    // The owner's rule, as a guard. Web and Mobile share one catalogue and the
    // role is a preset and a label, never authority.
    const offenders = M11_FILES.filter((f) =>
      /(role\s*===|role\s*==\s*'|isTechnician|isAdmin\b|isMaster|is_platform_master)/
        .test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('gates on the capability instead', () => {
    const screen = code('src/app/internal/service/orders/[id].tsx');
    expect(screen).toContain('CAP_SERVICE_QUALITY_MANAGE');
    expect(screen).toContain('hasUxCapability');
  });

  it('writes no transition table and asserts no lifecycle target', () => {
    // `setStatus(...)` on the orders LIST is a local filter — which status to
    // show — and has nothing to do with moving an order. What is forbidden is a
    // client-side machine, or a request body naming a target state: both new
    // states are event-only on the server and a button that asserted one would
    // simply fail.
    const offenders = M11_FILES.filter((f) => {
      const c = code(f);
      return /(TRANSITIONS|allowedTransitions|transitionMap)/.test(c)
        || /status:\s*'(quality_control|ready_for_pickup|repaired)'/.test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('retries nothing and queues nothing offline', () => {
    const offenders = M11_FILES.filter((f) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('imports expo-blur nowhere and writes no brand hex', () => {
    const offenders = M11_FILES.filter((f) => {
      const raw = fs.readFileSync(f, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(code(f));
    });
    expect(offenders).toEqual([]);
  });

  it('keeps the customer surface out of every M11 file', () => {
    const offenders = M11_FILES.filter((f) => /\/api\/v1\/customer\//.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
