import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import {
  findActiveRepair,
  isRepairOpen,
  toRepairStatus,
} from '@/domain/repairs/types';
import { describeRepairStatus } from '@/domain/repairs/status';
import { CUSTOMER_AUDIENCE, INTERNAL_AUDIENCE, queryKeys } from '@/providers/query-client';
import { isPrivateQueryKey, makeQueryScope } from '@/providers/query-scope';

/**
 * M8 — a customer's own repairs, over the real contract.
 *
 * The server owns ownership and visibility; these pin down that the app asks
 * the right surface, maps what came back, and cannot render what never arrived.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/customer-repairs-v1');

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_path: string, _opts: unknown, _deps: unknown) => {
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
    // Built INSIDE the isolated registry: an ApiError from the outer one is a
    // different class object and `instanceof` would quietly fail.
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/customer-repairs-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

const WIRE_REPAIR = {
  id: 42,
  number: 'SRV-000042',
  status: 'diagnosing',
  status_label: 'En diagnóstico',
  device_summary: 'Genérica X100',
  received_at: '2026-09-01T10:00:00-05:00',
  closed_at: null,
  updated_at: '2026-09-01T12:00:00-05:00',
  reported_issue: 'No carga.',
  timeline: [
    { id: 1, status: 'received', status_label: 'Recibido', occurred_at: '2026-09-01T10:00:00-05:00' },
    { id: 2, status: 'diagnosing', status_label: 'En diagnóstico', occurred_at: '2026-09-01T12:00:00-05:00' },
  ],
};

describe('the client asks the CUSTOMER surface and nothing else', () => {
  it('lists from /api/v1/customer/<slug>/repairs/', async () => {
    const { module, send } = load({ result: [] });

    await module.fetchCustomerRepairs(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/repairs/');
  });

  it('reads one repair by its numeric id', async () => {
    const { module, send } = load({ result: WIRE_REPAIR });

    await module.fetchCustomerRepair(42, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/repairs/42/');
  });

  it('never reaches the INTERNAL surface', async () => {
    // "This company's repairs" and "my repairs" are different questions. The
    // customer client only ever asks the second.
    const { module, send } = load({ result: [] });

    await module.fetchCustomerRepairs(DEPS);

    expect(send.mock.calls[0]![0]).not.toContain('/internal/');
  });

  it('NEVER touches the legacy admin surface', () => {
    for (const path of ['/api/admin/repairs/', '/api/admin/service/orders/']) {
      expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(
        BearerScopeViolationError,
      );
    }
  });

  it('declares the authenticated scope', async () => {
    const { module, send } = load({ result: [] });

    await module.fetchCustomerRepairs(DEPS);

    expect((send.mock.calls[0]![1] as { scope: string }).scope).toBe('authenticated-v1');
  });

  it('encodes the tenant slug', async () => {
    const { module, send } = load({ slug: 'a/b', result: [] });

    await module.fetchCustomerRepairs(DEPS);

    expect(send.mock.calls[0]![0]).toContain('/customer/a%2Fb/');
  });

  it('refuses to ask anything without a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchCustomerRepairs(DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('ownership failures are one outcome, not two', () => {
  it('turns a 404 into "not available"', async () => {
    // The server answers 404 for a repair that exists but is not yours,
    // deliberately indistinguishable from one that does not exist. An app that
    // distinguished them would rebuild the oracle the server refused to give.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchCustomerRepair(1, DEPS)).rejects.toBeInstanceOf(
      module.RepairNotAvailableError,
    );
  });

  it('turns a 403 into the same outcome', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });

    await expect(module.fetchCustomerRepairs(DEPS)).rejects.toBeInstanceOf(
      module.RepairNotAvailableError,
    );
  });

  it('leaves a network failure alone, so the retry pipeline sees it', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('offline', 'sin red', { status: null }),
    });

    await expect(module.fetchCustomerRepairs(DEPS)).rejects.not.toBeInstanceOf(
      module.RepairNotAvailableError,
    );
  });
});

describe('mapping — every field verified against a real response', () => {
  it('maps a repair', () => {
    const { module } = load();

    expect(module.toRepair(WIRE_REPAIR)).toMatchObject({
      id: 42,
      number: 'SRV-000042',
      status: 'diagnosing',
      statusLabel: 'En diagnóstico',
      deviceSummary: 'Genérica X100',
      reportedIssue: 'No carga.',
      closedAt: null,
    });
  });

  it('maps the timeline the server chose to send', () => {
    const { module } = load();

    const repair = module.toRepair(WIRE_REPAIR);

    expect(repair.timeline.map((entry) => entry.status)).toEqual([
      'received', 'diagnosing',
    ]);
    expect(repair.timeline[0]!.statusLabel).toBe('Recibido');
  });

  it('treats a list row with no timeline as empty, not as broken', () => {
    // The list endpoint sends no timeline at all; an empty array is the honest
    // reading of "not asked for".
    const { module } = load();

    expect(module.toRepair({ id: 1, number: 'SRV-1' }).timeline).toEqual([]);
  });

  it('has no field for anything internal', () => {
    // The server does not send them. This asserts the CLIENT could not surface
    // one if a future payload did.
    const { module } = load();

    const mapped = module.toRepair({
      ...WIRE_REPAIR,
      internal_notes: 'placa con corrosión',
      physical_condition: 'rayones',
      received_accessories: 'cargador',
      assignments: [{ id: 1, technician_name: 'Ana' }],
      branch_name: 'Centro',
    });

    expect(JSON.stringify(mapped)).not.toContain('corrosión');
    expect(JSON.stringify(mapped)).not.toContain('Ana');
    expect(Object.keys(mapped)).not.toContain('internalNotes');
    expect(Object.keys(mapped)).not.toContain('assignments');
    expect(Object.keys(mapped)).not.toContain('branchName');
  });

  it('carries no event comment, because the contract has none', () => {
    const { module } = load();

    const mapped = module.toRepair({
      ...WIRE_REPAIR,
      timeline: [
        {
          id: 1, status: 'received', status_label: 'Recibido',
          occurred_at: '2026-09-01T10:00:00-05:00',
          comment: 'no decírselo todavía',
        },
      ],
    });

    expect(JSON.stringify(mapped)).not.toContain('no decírselo');
  });

  it('never guesses an unknown status into a later one', () => {
    const { module } = load();

    expect(module.toRepair({ id: 1, status: 'delivered' }).status).toBe('received');
  });
});

describe('the tenant owns the wording', () => {
  it('prefers the label the server sent', () => {
    expect(describeRepairStatus('received', 'En mostrador').label).toBe('En mostrador');
  });

  it('falls back to a local word only when the payload has none', () => {
    expect(describeRepairStatus('received').label).toBe('Recibido');
  });

  it('keeps the tone local, because a tenant does not configure it', () => {
    expect(describeRepairStatus('cancelled', 'Anulado').tone).toBe('danger');
  });
});

describe('domain rules', () => {
  it('narrows a wire status without inventing one', () => {
    expect(toRepairStatus('waiting_approval')).toBe('waiting_approval');
    expect(toRepairStatus('quality_check')).toBe('received');
  });

  it('treats cancelled as finished and everything else as open', () => {
    const base = {
      id: 1, number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x',
      reportedIssue: 'y', receivedAt: '', closedAt: null, updatedAt: '', timeline: [],
    };
    expect(isRepairOpen({ ...base, status: 'waiting_approval' })).toBe(true);
    expect(isRepairOpen({ ...base, status: 'cancelled' })).toBe(false);
    expect(findActiveRepair([{ ...base, status: 'cancelled' }])).toBeNull();
  });
});

describe('cache — customer repairs never share a slot with internal service', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('keeps repairs in the CUSTOMER audience', () => {
    for (const key of [queryKeys.repairs(scope), queryKeys.repair(scope, 1)]) {
      expect(key).toContain(CUSTOMER_AUDIENCE);
      expect(key).not.toContain(INTERNAL_AUDIENCE);
    }
  });

  it('keeps internal service in the INTERNAL audience', () => {
    for (const key of [
      queryKeys.internalServiceContext(scope),
      queryKeys.internalServiceOrders(scope, null),
      queryKeys.internalServiceOrder(scope, 1),
      queryKeys.internalServiceRoot(scope),
    ]) {
      expect(key).toContain(INTERNAL_AUDIENCE);
      expect(key).not.toContain(CUSTOMER_AUDIENCE);
    }
  });

  it('gives the same repair two different slots per audience', () => {
    // The dangerous collision: an internal order carrying internal notes
    // landing where a customer screen reads its own repair.
    expect(queryKeys.repair(scope, 7)).not.toEqual(
      queryKeys.internalServiceOrder(scope, 7),
    );
  });

  it('marks both as PRIVATE, so signing out evicts them', () => {
    expect(isPrivateQueryKey(queryKeys.repair(scope, 1))).toBe(true);
    expect(isPrivateQueryKey(queryKeys.internalServiceOrder(scope, 1))).toBe(true);
  });

  it('gives two tenants different slots', () => {
    const other = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    expect(queryKeys.repairs(scope)).not.toEqual(queryKeys.repairs(other));
  });

  it('gives two users different slots', () => {
    const other = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });
    expect(queryKeys.repair(scope, 1)).not.toEqual(queryKeys.repair(other, 1));
  });
});
