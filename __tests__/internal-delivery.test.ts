import {
  CAP_SERVICE_DELIVERY_MANAGE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  CAP_SERVICE_QUALITY_MANAGE,
  CAP_SERVICE_REPAIR_MANAGE,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { describeRepairStatus, repairStatusMeta } from '@/domain/repairs/status';
import {
  isKnownRepairStatus,
  isRepairOpen,
  REPAIR_STAGES,
  repairStageIndex,
} from '@/domain/repairs/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M12 — the handover.
 *
 * The server owns the clock, the deliverer and the append-only record. These
 * pin down that the app sends an intention, mints a key that survives its own
 * retry, cannot reach `delivered` any other way, and never claims a payment the
 * platform cannot take.
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

const WIRE_DELIVERY = {
  id: 500,
  recipient_name: 'Ana Cliente',
  notes: 'Se llevó la caja.',
  delivered_by_name: 'Tomás Técnico',
  delivered_at: '2026-09-02T15:00:00Z',
  created_at: '2026-09-02T15:00:00Z',
};

function repair(status: string) {
  return {
    id: 1, number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x',
    reportedIssue: 'y', receivedAt: '', closedAt: null, updatedAt: '',
    timeline: [], status,
  };
}

describe('the state M12 built', () => {
  it('is known, and sits at the END of the ladder', () => {
    expect(isKnownRepairStatus('delivered')).toBe(true);
    expect(repairStageIndex('delivered'))
      .toBeGreaterThan(repairStageIndex('ready_for_pickup'));
    expect(REPAIR_STAGES[REPAIR_STAGES.length - 1]).toBe('delivered');
  });

  it('closes the repair, and ready_for_pickup deliberately does not', () => {
    // THE PROMISE M9 MADE AND M12 SPENT: one place learns about an ending.
    // `ready_for_pickup` stays open because the device is ready and still in
    // the shop — treating it as finished would drop the one card a customer
    // most wants to see.
    expect(isRepairOpen(repair('delivered'))).toBe(false);
    expect(isRepairOpen(repair('ready_for_pickup'))).toBe(true);
    expect(isRepairOpen(repair('quality_control'))).toBe(true);
  });

  it('keeps an UNKNOWN code open rather than guessing it finished', () => {
    // Guessing "closed" hides a live repair. That is the expensive direction.
    expect(isRepairOpen(repair('warranty'))).toBe(true);
    expect(isRepairOpen(repair('teletransportado'))).toBe(true);
  });

  it('labels it without claiming anybody paid', () => {
    // This platform cannot charge for a repair. "Entregado y pagado" would be
    // the one word that starts an argument at the counter.
    const label = repairStatusMeta.delivered.label.toLowerCase();
    for (const forbidden of ['pagad', 'cobrad', 'facturad', 'saldo', 'cancelad']) {
      expect(label).not.toContain(forbidden);
    }
    expect(repairStatusMeta.delivered.label).toBe('Entregado');
  });

  it('still prefers the tenant word', () => {
    expect(describeRepairStatus('delivered', 'Retirado').label).toBe('Retirado');
  });

  it('leaves warranty unknown, because it has no module', () => {
    // And when it arrives it will be a RE-ENTRY citing this order, never a
    // status bolted onto a closed one.
    expect(isKnownRepairStatus('warranty')).toBe(false);
    expect(repairStageIndex('warranty')).toBe(-1);
    expect(REPAIR_STAGES).not.toContain('warranty' as never);
  });
});

describe('the client talks to the delivery surface', () => {
  it('hangs both routes off the order', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/orders/7/delivery/',
        (m) => m.fetchServiceDelivery(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/delivery/',
        (m) => m.postServiceDelivery(
          7, { recipientName: 'Ana', idempotencyKey: 'k1' }, DEPS,
        )],
    ];
    for (const [path, call] of cases) {
      const { module, send } = load({ result: WIRE_DELIVERY });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('exports no update and no delete, because the server has none', async () => {
    // The row refuses both in its own `save`. An "edit" affordance would promise
    // something the platform deliberately does not do.
    const { module } = load();
    for (const absent of [
      'patchServiceDelivery', 'putServiceDelivery', 'deleteServiceDelivery',
      'updateServiceDelivery',
    ]) {
      expect((module as Record<string, unknown>)[absent]).toBeUndefined();
    }
  });

  it('never names the admin surface', async () => {
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: 'Ana', idempotencyKey: 'k1' }, DEPS,
    );
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('treats a 404 as out of scope, not lost membership', async () => {
    // A branch or tenant the caller cannot reach answers 404 so nobody can
    // sweep ids. "Your membership is gone" would be the wrong alarm.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });
    await expect(module.fetchServiceDelivery(7, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
  });

  it('turns a 403 into a missing capability', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });
    await expect(
      module.postServiceDelivery(7, { recipientName: 'A', idempotencyKey: 'k' }, DEPS),
    ).rejects.toThrow();
  });

  it('turns a 409 idempotency_conflict into its own error', async () => {
    // The key was spent on a DIFFERENT recipient. That is not "the handover
    // failed", and a screen has to tell the two apart without parsing Spanish.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Esa clave ya se usó para una entrega diferente.', {
          status: 409, code: 'idempotency_conflict',
        }),
    });
    await expect(
      module.postServiceDelivery(7, { recipientName: 'Otro', idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServiceIdempotencyConflictError);
  });

  it('turns a refused handover into the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation',
          'Solo se puede entregar un equipo que aprobó el control de calidad.',
          { status: 400 }),
    });
    await expect(
      module.postServiceDelivery(7, { recipientName: 'Ana', idempotencyKey: 'k' }, DEPS),
    ).rejects.toThrow('control de calidad');
  });
});

describe('a write is an INTENTION, never a record', () => {
  it('sends the recipient and the key, and nothing else by default', async () => {
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: 'Ana Cliente', idempotencyKey: 'k1' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      recipient_name: 'Ana Cliente', idempotency_key: 'k1',
    });
  });

  it('trims the recipient rather than storing the counter typing', async () => {
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: '  Ana Cliente  ', idempotencyKey: 'k1' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body
      .recipient_name).toBe('Ana Cliente');
  });

  it('omits a blank note rather than sending an empty string', async () => {
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: 'Ana', notes: '   ', idempotencyKey: 'k1' }, DEPS,
    );
    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body))
      .toEqual(['recipient_name', 'idempotency_key']);
  });

  it('has NO field that sets the clock, the deliverer or a payment', async () => {
    // Both are the server's. And there is no payment field at all, because the
    // platform cannot charge for a repair — `PaymentTransaction` is bound to an
    // e-commerce order by a non-null FK.
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: 'Ana', notes: 'Con su caja.', idempotencyKey: 'k1' }, DEPS,
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort())
      .toEqual(['idempotency_key', 'notes', 'recipient_name']);
    for (const forbidden of [
      'delivered_at', 'delivered_by', 'created_at', 'status', 'company',
      'repair_order', 'paid', 'amount', 'total', 'payment', 'balance',
      'signature', 'photo', 'evidence', 'document_number',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('always sends a key, because only the client can mint one', async () => {
    // A device handed over twice is a record saying two different people took
    // it. The key is what makes a double-tap safe.
    const { module, send } = load({ result: WIRE_DELIVERY });
    await module.postServiceDelivery(
      7, { recipientName: 'Ana', idempotencyKey: 'k1' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body)
      .toHaveProperty('idempotency_key', 'k1');
  });

  it('uses POST for the write and GET for the read', async () => {
    const { module: m1, send: s1 } = load({ result: WIRE_DELIVERY });
    await m1.fetchServiceDelivery(7, DEPS);
    expect((s1.mock.calls[0]![1] as { method: string }).method).toBe('GET');

    const { module: m2, send: s2 } = load({ result: WIRE_DELIVERY });
    await m2.postServiceDelivery(7, { recipientName: 'A', idempotencyKey: 'k' }, DEPS);
    expect((s2.mock.calls[0]![1] as { method: string }).method).toBe('POST');
  });
});

describe('mapping — verified against a real response', () => {
  it('maps the handover', async () => {
    const { module } = load({ result: { delivery: WIRE_DELIVERY } });
    await expect(module.fetchServiceDelivery(7, DEPS)).resolves.toEqual({
      id: 500,
      recipientName: 'Ana Cliente',
      notes: 'Se llevó la caja.',
      deliveredByName: 'Tomás Técnico',
      deliveredAt: '2026-09-02T15:00:00Z',
      createdAt: '2026-09-02T15:00:00Z',
    });
  });

  it('treats a null delivery as a normal answer', async () => {
    // Most orders have not been collected. Treating that as missing would put
    // an error card on a healthy screen.
    const { module } = load({ result: { delivery: null } });
    await expect(module.fetchServiceDelivery(7, DEPS)).resolves.toBeNull();
  });

  it('carries no key and no fingerprint, because the server sends none', async () => {
    const { module } = load({
      result: {
        delivery: {
          ...WIRE_DELIVERY, idempotency_key: 'k1', request_fingerprint: 'abc',
        },
      },
    });
    const delivery = await module.fetchServiceDelivery(7, DEPS);
    expect(Object.keys(delivery!).sort()).toEqual([
      'createdAt', 'deliveredAt', 'deliveredByName', 'id', 'notes', 'recipientName',
    ]);
  });
});

describe('capabilities keep the counter and the lifecycle apart', () => {
  it('does not imply delivery from the wide lifecycle capability', () => {
    // THE POINT OF A SEPARATE CAPABILITY. `service.orders.manage` moves an order
    // and can CANCEL it; a shop that wants reception to release devices should
    // not have to hand the front desk that.
    const lifecycle = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_MANAGE]);
    expect(hasUxCapability(lifecycle, CAP_SERVICE_ORDERS_MANAGE)).toBe(true);
    expect(hasUxCapability(lifecycle, CAP_SERVICE_DELIVERY_MANAGE)).toBe(false);
  });

  it('lets a counter release without repairing, inspecting or cancelling', () => {
    const counter = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_DELIVERY_MANAGE]);
    expect(hasUxCapability(counter, CAP_SERVICE_DELIVERY_MANAGE)).toBe(true);
    for (const denied of [
      CAP_SERVICE_ORDERS_MANAGE, CAP_SERVICE_REPAIR_MANAGE, CAP_SERVICE_QUALITY_MANAGE,
    ]) {
      expect(hasUxCapability(counter, denied)).toBe(false);
    }
  });

  it('lets a technician repair and inspect without releasing', () => {
    const bench = context([
      CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_REPAIR_MANAGE, CAP_SERVICE_QUALITY_MANAGE,
    ]);
    expect(hasUxCapability(bench, CAP_SERVICE_QUALITY_MANAGE)).toBe(true);
    expect(hasUxCapability(bench, CAP_SERVICE_DELIVERY_MANAGE)).toBe(false);
  });

  it('uses the SAME capability string the backend enforces', () => {
    // Web and Mobile share one catalogue. A mobile-only permission name would
    // be a second RBAC nobody agreed to.
    expect(CAP_SERVICE_DELIVERY_MANAGE).toBe('service.delivery.manage');
  });
});

describe('cache — the handover hangs off its order', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests under the service root', () => {
    const root = queryKeys.internalServiceDelivery(scope, 7);
    expect(root.slice(0, queryKeys.internalServiceRoot(scope).length))
      .toEqual(queryKeys.internalServiceRoot(scope));
  });

  it('keeps one order apart from another', () => {
    expect(queryKeys.internalServiceDelivery(scope, 7))
      .not.toEqual(queryKeys.internalServiceDelivery(scope, 8));
  });

  it('does not collide with quality, execution or parts', () => {
    for (const other of [
      queryKeys.internalServiceQuality(scope, 7),
      queryKeys.internalServiceExecution(scope, 7),
      queryKeys.internalServiceParts(scope, 7),
    ]) {
      expect(queryKeys.internalServiceDelivery(scope, 7)).not.toEqual(other);
    }
  });

  it('separates tenants and users, like every other internal key', () => {
    const other = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    const otherUser = makeQueryScope({ tenantSlug: 'blackdog', userId: 43 });
    expect(queryKeys.internalServiceDelivery(scope, 7))
      .not.toEqual(queryKeys.internalServiceDelivery(other, 7));
    expect(queryKeys.internalServiceDelivery(scope, 7))
      .not.toEqual(queryKeys.internalServiceDelivery(otherUser, 7));
  });
});

describe('structural — the handover cannot drift', () => {
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

  /**
   * Code with its STRING LITERALS removed as well as its comments.
   *
   * Without this, the honest disclaimer — "no registra cobro" — trips a guard
   * written to catch a payment FIELD. Scanning the sentence that says the
   * platform cannot charge, and calling it a claim that it did, is the same
   * false positive `waiting_parts` and `quality_control` produced before it.
   */
  const codeOnly = (f: string) =>
    code(f)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');

  const M12_FILES = [
    'src/features/internal/service-delivery-section.tsx',
    ...sourceFiles('src/app/internal/service'),
  ];

  it('has no payment field, identifier or gateway in the HANDOVER itself', () => {
    // The rule this pins, verbatim from the phase: a status is not a receipt.
    //
    // NARROWED IN M12B, and the narrowing is the interesting part. This used to
    // scan every file under `src/app/internal/service`, which was right while
    // service payments did not exist and became wrong the moment they did: the
    // order screen now legitimately mounts a till and reacts to a
    // `payment_required` refusal, and flagging that would have been the same
    // shape of false positive as `waiting_parts` matching /part/.
    //
    // What the rule ALWAYS meant is what it says now: the handover records no
    // money. The delivery section is where that could go wrong, so that is
    // where it is checked — and the two assertions below pin that the screen's
    // delivery call site sends no payment field either, which is the other half
    // of the same claim.
    //
    // Strings are stripped first: the visible copy DOES mention `cobro`, to say
    // the platform cannot take one, and that sentence is the opposite of the
    // offence.
    expect(
      /(\bpaid\b|payment|izipay|stripe|PaymentTransaction|\bamount\b|\bbalance\b)/i
        .test(codeOnly('src/features/internal/service-delivery-section.tsx')),
    ).toBe(false);
  });

  it('sends no payment field when it records a handover', () => {
    const screen = codeOnly('src/app/internal/service/orders/[id].tsx');
    const call = screen.slice(
      screen.indexOf('recordDelivery.mutate'),
      screen.indexOf('ServiceDeliverySection') > screen.indexOf('recordDelivery.mutate')
        ? screen.indexOf('ServiceDeliverySection')
        : screen.length,
    );
    for (const forbidden of ['amount', 'paid', 'currency', 'method']) {
      expect(call).not.toContain(forbidden);
    }
  });

  it('reacts to a payment refusal instead of reporting a failed handover', () => {
    // M12B. A 409 `payment_required` is not the handover failing — it is the
    // shop's own policy. Reporting it generically would send somebody looking
    // for a problem with the device.
    const screen = code('src/app/internal/service/orders/[id].tsx');
    expect(screen).toContain('ServicePaymentRequiredError');
    expect(screen).toContain('Saldo pendiente');
  });

  it('says out loud that it takes no payment, and never claims one', () => {
    // A counter that assumes a handover settled the bill is the failure this
    // copy exists to prevent. COMMENTS ARE STRIPPED: the file explains at the
    // top why a "cobrado" toggle would be a lie, and reading that explanation
    // as the lie itself would be the second false positive in one test.
    const visible = code('src/features/internal/service-delivery-section.tsx');
    expect(visible).toContain('No registra cobro');
    for (const claim of ['pagado', 'cobrado', 'facturado', 'saldado']) {
      expect(visible.toLowerCase()).not.toContain(claim);
    }
  });

  it('offers no evidence field', () => {
    // DEC-016: the storage provider is undecided, and an evidence field that
    // stores nothing is worse than an honest gap.
    const offenders = M12_FILES.filter((f) =>
      /(signature|firma|ImagePicker|expo-camera|expo-image-picker|takePhoto)/i
        .test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('offers no way to edit or delete a handover', () => {
    const c = code('src/features/internal/service-delivery-section.tsx');
    for (const forbidden of [
      'onEdit', 'onDelete', 'updateDelivery', 'deleteDelivery', 'editDelivery',
    ]) {
      expect(c).not.toContain(forbidden);
    }
  });

  it('never authorizes on a role name', () => {
    const offenders = M12_FILES.filter((f) =>
      /(role\s*===|role\s*==\s*'|isTechnician|isAdmin\b|isMaster|is_platform_master)/
        .test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('gates on the capability instead', () => {
    const screen = code('src/app/internal/service/orders/[id].tsx');
    expect(screen).toContain('CAP_SERVICE_DELIVERY_MANAGE');
    expect(screen).toContain('hasUxCapability');
  });

  it('writes no transition table and asserts no lifecycle target', () => {
    // `delivered` is event-only on the server: a button that asserted it would
    // simply fail, and a local machine would be a second lifecycle nobody owns.
    const offenders = M12_FILES.filter((f) => {
      const c = code(f);
      return /(TRANSITIONS|allowedTransitions|transitionMap)/.test(c)
        || /status:\s*'delivered'/.test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('mints the key OUTSIDE render state', () => {
    // A key that changed on re-render would be no key at all, and the whole
    // protection against a double-tap rests on it staying put.
    const c = code('src/features/internal/service-delivery-section.tsx');
    expect(c).toContain('useRef');
    expect(c).not.toMatch(/useState[^\n]*makeIdempotencyKey/);
  });

  it('retries nothing and queues nothing offline', () => {
    const offenders = M12_FILES.filter((f) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('never retries the delivery mutation', () => {
    const hooks = code('src/hooks/use-internal-service.ts');
    expect(hooks).toContain('useRecordDelivery');
    expect(hooks).not.toMatch(/retry:\s+(?!false\b)\S/);
  });

  it('imports expo-blur nowhere and writes no brand hex', () => {
    const offenders = M12_FILES.filter((f) => {
      const raw = fs.readFileSync(f, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(code(f));
    });
    expect(offenders).toEqual([]);
  });

  it('keeps the customer surface out of every M12 file', () => {
    // A customer sees the STAGE through the ordinary status. There is no
    // customer route for a handover and this app asks for none.
    const offenders = M12_FILES.filter((f) => /\/api\/v1\/customer\//.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
