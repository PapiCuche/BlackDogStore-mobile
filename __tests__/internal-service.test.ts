import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import {
  CAP_SERVICE_DEVICES_MANAGE,
  CAP_SERVICE_ORDERS_CREATE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  SERVICE_DEVICE_TYPES,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { visibleModules } from '@/features/internal/module-registry';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M8 — the workshop on the client.
 *
 * The server enforces membership, capability and branch. These pin down that
 * the app asks the right surface, sends intentions rather than records, draws
 * only what it was offered, and cannot invent authority of its own.
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

const WIRE_ORDER = {
  id: 7,
  number: 'SRV-000007',
  status: 'received',
  status_label: 'Recibido',
  customer: 3,
  customer_name: 'Ana Cliente',
  device: 5,
  device_summary: 'Genérica X100',
  branch: 2,
  branch_name: 'Centro',
  technician_name: '',
  received_at: '2026-09-01T10:00:00-05:00',
  closed_at: null,
  updated_at: '2026-09-01T10:00:00-05:00',
  reported_issue: 'No carga.',
  physical_condition: 'Rayón en la tapa.',
  received_accessories: 'Cargador.',
  internal_notes: 'Cliente apurado.',
  received_by_name: 'Rita Recepción',
  device_detail: { id: 5, brand: 'Genérica', model: 'X100', display_name: 'Genérica X100' },
  history: [
    {
      id: 1, from_status: '', to_status: 'received', to_status_label: 'Recibido',
      origin: 'internal', comment: 'Nota privada.', is_customer_visible: true,
      actor_name: 'Rita Recepción', created_at: '2026-09-01T10:00:00-05:00',
    },
  ],
  assignments: [],
  available_transitions: [
    { code: 'diagnosing', label: 'En diagnóstico' },
    { code: 'cancelled', label: 'Cancelado' },
  ],
};

describe('the client talks to the INTERNAL service surface only', () => {
  it('hangs every route it asks for off this tenant', async () => {
    // Named for the GUARANTEE, not for a count. The previous name said «nine»
    // while the list below held seven, and the module grew to thirty-two — a
    // number in a test name is a claim nobody re-checks.
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/context/', (m) => m.fetchServiceContext(DEPS)],
      ['/api/v1/internal/blackdog/service/customers/', (m) => m.searchServiceCustomers({}, DEPS)],
      ['/api/v1/internal/blackdog/service/devices/', (m) => m.fetchServiceDevices({}, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/', (m) => m.fetchServiceOrders({}, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/', (m) => m.fetchServiceOrder(7, DEPS)],
      [
        '/api/v1/internal/blackdog/service/orders/7/transition/',
        (m) => m.postServiceTransition({ id: 7, status: 'diagnosing' }, DEPS),
      ],
      [
        '/api/v1/internal/blackdog/service/orders/7/assignment/',
        (m) => m.fetchServiceAssignmentOptions(7, DEPS),
      ],
    ];

    for (const [path, call] of cases) {
      const { module, send } = load({ result: { results: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('NEVER touches the legacy admin surface', () => {
    for (const path of [
      '/api/admin/service/orders/', '/api/admin/repairs/', '/api/admin/customers/',
    ]) {
      expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(
        BearerScopeViolationError,
      );
    }
  });

  it('declares the authenticated scope', async () => {
    const { module, send } = load({ result: {} });
    await module.fetchServiceContext(DEPS);
    expect((send.mock.calls[0]![1] as { scope: string }).scope).toBe('authenticated-v1');
  });

  it('refuses to ask anything without a tenant', async () => {
    const { module, send } = load({ slug: null });
    await expect(module.fetchServiceOrders({}, DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only the filters the server understands', async () => {
    const { module, send } = load({ result: { results: [] } });

    await module.fetchServiceOrders(
      { branchId: 2, status: 'received', search: 'ana', technicianId: 9, page: 3 }, DEPS,
    );

    expect((send.mock.calls[0]![1] as { query: unknown }).query).toEqual({
      branch_id: 2, status: 'received', search: 'ana', technician_id: 9, page: 3,
    });
  });
});

describe('the three failures stay distinct', () => {
  it('turns a 404 WITHOUT a scoped selector into ACCESS DENIED', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchServiceOrders({}, DEPS)).rejects.toBeInstanceOf(
      module.InternalAccessDeniedError,
    );
  });

  it('turns a 404 WITH one into OUT OF SCOPE', async () => {
    // The server answers 404 rather than 403 so nobody can sweep ids to map the
    // company's shops. The app must not translate that into "your membership is
    // gone", which is a different and much louder claim.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchServiceOrder(99, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
    await expect(module.fetchServiceOrders({ branchId: 99 }, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
  });

  it('turns a 403 into CAPABILITY MISSING', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });

    await expect(module.fetchServiceOrders({}, DEPS)).rejects.toBeInstanceOf(
      module.InternalCapabilityMissingError,
    );
  });

  it('turns a 400 into a REJECTION carrying the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Ese cambio de estado no está permitido.', { status: 400 }),
    });

    await expect(
      module.postServiceTransition({ id: 7, status: 'cancelled' }, DEPS),
    ).rejects.toThrow('Ese cambio de estado no está permitido.');
  });

  it('shows the domain words rather than a generic message', async () => {
    const { module } = load();
    expect(module.serviceErrorMessage(new module.ServiceOutOfScopeError())).toContain(
      'disponible',
    );
  });
});

describe('a write is an INTENTION, never a record', () => {
  it('sends only what the counter observed', async () => {
    const { module, send } = load({ result: WIRE_ORDER });

    await module.postServiceOrder(
      {
        customerId: 3, deviceId: 5, branchId: 2,
        reportedIssue: 'No carga.', physicalCondition: 'Rayón.',
        receivedAccessories: 'Cargador.', internalNotes: 'Apurado.',
      },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;

    expect(body).toEqual({
      customer_id: 3, device_id: 5, branch_id: 2,
      reported_issue: 'No carga.', physical_condition: 'Rayón.',
      received_accessories: 'Cargador.', internal_notes: 'Apurado.',
    });
    // The five the server owns. Having no field is the only way to guarantee a
    // client cannot set one.
    for (const forbidden of ['number', 'status', 'company', 'company_id', 'received_by', 'received_at']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('sends only a technician id, never a user object', async () => {
    const { module, send } = load({ result: WIRE_ORDER });

    await module.postServiceAssignment({ id: 7, technicianId: 9 }, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({ technician_id: 9 });
  });

  it('releases an order with a null id rather than a second endpoint', async () => {
    const { module, send } = load({ result: WIRE_ORDER });

    await module.postServiceAssignment({ id: 7, technicianId: null }, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({ technician_id: null });
  });

  it('has no credential field anywhere in the device payload', async () => {
    // Repair shops ask for the unlock code. A field for one would make the
    // backend's table a credential store with no policy behind it.
    const { module, send } = load({ result: { id: 1 } });

    await module.postServiceDevice(
      { customerId: 3, deviceType: 'phone', brand: 'G', model: 'X' }, DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'password', 'pin', 'unlock_code', 'pattern', 'apple_id', 'icloud_password',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('offers device types that are not one manufacturer', async () => {
    const values = SERVICE_DEVICE_TYPES.map((type) => type.value);
    expect(values).toEqual(
      expect.arrayContaining(['phone', 'tablet', 'laptop', 'console', 'other']),
    );
    expect(JSON.stringify(SERVICE_DEVICE_TYPES).toLowerCase()).not.toContain('iphone');
    expect(JSON.stringify(SERVICE_DEVICE_TYPES).toLowerCase()).not.toContain('apple');
  });
});

describe('the transitions come from the server', () => {
  it('maps them verbatim, code and label', async () => {
    const { module } = load();

    const detail = module.toServiceOrderDetail(WIRE_ORDER);

    expect(detail.availableTransitions).toEqual([
      { code: 'diagnosing', label: 'En diagnóstico' },
      { code: 'cancelled', label: 'Cancelado' },
    ]);
  });

  it('offers nothing when the server offered nothing', () => {
    const { module } = load();

    expect(
      module.toServiceOrderDetail({ ...WIRE_ORDER, available_transitions: [] })
        .availableTransitions,
    ).toEqual([]);
  });

  it('carries the internal timeline INCLUDING its comments', () => {
    // The opposite of the customer contract, and deliberately so: this is where
    // a technician reads what a colleague actually wrote.
    const { module } = load();

    const detail = module.toServiceOrderDetail(WIRE_ORDER);

    expect(detail.history[0]!.comment).toBe('Nota privada.');
    expect(detail.internalNotes).toBe('Cliente apurado.');
    expect(detail.physicalCondition).toBe('Rayón en la tapa.');
  });

  it('requires the customer-visible flag to be strictly true', () => {
    const { module } = load();

    const detail = module.toServiceOrderDetail({
      ...WIRE_ORDER,
      history: [{ ...WIRE_ORDER.history[0], is_customer_visible: 'yes' }],
    });

    expect(detail.history[0]!.isCustomerVisible).toBe(false);
  });
});

describe('capabilities decide what is DRAWN, never what is allowed', () => {
  it('shows the service module to somebody who holds service.orders.view', () => {
    const modules = visibleModules(context([CAP_SERVICE_ORDERS_VIEW]));

    expect(modules.map((m) => m.key)).toEqual(['service']);
    expect(modules[0]!.integration).toBe('ready');
    expect(modules[0]!.route).toBe('/internal/service');
  });

  it('separates reading the board from receiving a device', () => {
    const viewer = context([CAP_SERVICE_ORDERS_VIEW]);

    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_VIEW)).toBe(true);
    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_CREATE)).toBe(false);
    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_MANAGE)).toBe(false);
    expect(hasUxCapability(viewer, CAP_SERVICE_DEVICES_MANAGE)).toBe(false);
  });

  it('gives a service-only member no sales or inventory module', () => {
    const keys = visibleModules(
      context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_MANAGE]),
    ).map((m) => m.key);

    expect(keys).not.toContain('sales-orders');
    expect(keys).not.toContain('inventory');
  });

  it('does not draw the module for a coarse role', () => {
    // `role` has never been authority. An empty capability list draws nothing,
    // whatever the membership calls the person.
    expect(visibleModules(context([]))).toEqual([]);
  });
});

describe('cache — the service module has its own namespace', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('gives two branches two different slots', () => {
    expect(queryKeys.internalServiceOrders(scope, 2)).not.toEqual(
      queryKeys.internalServiceOrders(scope, 3),
    );
  });

  it('does not confuse "all my branches" with branch zero', () => {
    expect(queryKeys.internalServiceOrders(scope, null)).not.toEqual(
      queryKeys.internalServiceOrders(scope, 0),
    );
  });

  it('separates two filter sets', () => {
    expect(queryKeys.internalServiceOrders(scope, null, { status: 'received' })).not.toEqual(
      queryKeys.internalServiceOrders(scope, null, {}),
    );
  });

  it('roots the module under one prefix, so one invalidation covers it', () => {
    const root = queryKeys.internalServiceRoot(scope);

    for (const key of [
      queryKeys.internalServiceContext(scope),
      queryKeys.internalServiceOrders(scope, null),
      queryKeys.internalServiceOrder(scope, 1),
      queryKeys.internalServiceAssignment(scope, 1),
      queryKeys.internalServiceCustomers(scope, 'ana'),
      queryKeys.internalServiceDevices(scope, 3, ''),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('does not sit under the inventory or sales prefixes', () => {
    expect(queryKeys.internalServiceRoot(scope)).not.toEqual(
      queryKeys.internalInventoryRoot(scope),
    );
    expect(queryKeys.internalServiceRoot(scope)).not.toEqual(
      queryKeys.internalOrders(scope, {}),
    );
  });
});

describe('structural — the module cannot drift', () => {
  type FileSystem = {
    readFileSync(path: string, encoding: 'utf8'): string;
    readdirSync(path: string): string[];
    statSync(path: string): { isDirectory(): boolean };
  };
  type PathModule = { join(...parts: string[]): string };

  const fs = jest.requireActual('fs') as FileSystem;
  const nodePath = jest.requireActual('path') as PathModule;

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((entry: string) => {
      const full = nodePath.join(dir, entry);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  /**
   * The CODE, without the prose. These files explain at length what they must
   * never do, and a raw text search would flag the warning as the violation.
   */
  function executableCode(file: string): string {
    return fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const SERVICE_FILES = [
    'src/api/endpoints/internal-service-v1.ts',
    'src/api/endpoints/customer-repairs-v1.ts',
    'src/domain/internal/service-types.ts',
    'src/domain/repairs/types.ts',
    'src/repositories/api/v1-internal-service-repository.ts',
    'src/repositories/api/v1-customer-repair-repository.ts',
    'src/hooks/use-internal-service.ts',
    ...sourceFiles('src/app/internal/service'),
  ];

  it('names no legacy admin path anywhere in the module', () => {
    const offenders = SERVICE_FILES.filter((file) => /\/api\/admin\//.test(executableCode(file)));
    expect(offenders).toEqual([]);
  });

  it('ships no transition table of its own', () => {
    // A client with its own copy drifts the first time the machine changes, and
    // the drift shows up as a button that fails.
    const offenders = SERVICE_FILES.filter((file) =>
      /(TRANSITIONS|allowedTransitions|transitionMap)/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('never decides authority on the client', () => {
    const offenders = SERVICE_FILES.filter((file) =>
      /function\s+can[A-Z]/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('declares no credential field for a device', () => {
    const offenders = SERVICE_FILES.filter((file) =>
      /(unlock_code|unlockCode|icloud|appleId|apple_id|passcode)/i.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('reaches the token graph through the shared runtime, never a new one', () => {
    const hook = executableCode('src/hooks/use-internal-service.ts');

    expect(hook).toContain('getAuthRuntime()');
    expect(hook).not.toContain('createMemoryAccessTokenStore');
    expect(hook).not.toContain('new RefreshCoordinator');
  });

  it('imports expo-blur nowhere: glass belongs to GlassSurface', () => {
    const offenders = SERVICE_FILES.filter((file) =>
      /from 'expo-blur'/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('writes no brand hex, so the tenant tint keeps working', () => {
    const offenders = SERVICE_FILES.filter((file) =>
      /#[0-9a-fA-F]{6}\b/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });
});
