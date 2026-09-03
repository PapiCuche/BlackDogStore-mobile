const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

function load(result: unknown = {}) {
  const send = jest.fn(
    async (_path: string, _options: unknown, _deps: unknown) => result,
  );
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (p: string, o: unknown, d: unknown) => send(p, o, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    // `require`, not `import`: the module has to load AFTER `doMock` runs, and
    // an import is hoisted above it. The rest of the suite carries the warning
    // for the same reason; this file states it instead of adding to the count.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('@/api/endpoints/internal-service-v1');
  });
  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

/**
 * Service coverage: 34 routes exist, Mobile calls 32, and the two it does not
 * call are not gaps.
 *
 * THE DISTINCTION THIS FILE PROTECTS. «Not called» and «missing» look the same
 * in a count and are opposites in practice. `GET orders/<id>/` returns
 * `device_detail` and `history` inside the order, so calling
 * `GET devices/<id>/` or `GET orders/<id>/history/` afterwards would be two
 * extra round-trips for data already in hand. They remain valid contracts for
 * any client that wants a device or a timeline on its own; this one does not.
 *
 * WHAT IS NOT TESTED HERE, deliberately: the number 34. Asserting it would mean
 * copying the backend router into Mobile, and a hand-maintained duplicate of
 * somebody else's URL table is a fact that rots silently — which is the exact
 * failure this checkpoint was called to clean up. What is asserted instead is
 * the REASON the two routes are unnecessary, which is a property of the payload
 * and fails the moment it stops being true.
 */

const WIRE_ORDER_DETAIL = {
  id: 7,
  number: 'SRV-000007',
  status: 'received',
  status_label: 'Recibido',
  customer_name: 'Rosa Quispe',
  device_summary: 'Samsung A54',
  branch_name: 'Sucursal principal',
  created_at: '2026-09-03T10:00:00Z',
  reported_issue: 'No enciende.',
  physical_condition: 'Rayón.',
  received_accessories: 'Cargador.',
  internal_notes: '',
  received_by_name: 'dev_technician',
  // The two payloads that make the specialised reads unnecessary.
  device_detail: {
    id: 5, device_type: 'phone', brand: 'Samsung', model: 'A54',
    serial_number: 'SN-1', imei: '',
  },
  history: [
    {
      // Field names taken from `V1ServiceHistorySerializer`, not guessed:
      // the flag is `is_customer_visible` and the free text is `comment`.
      id: 1, from_status: '', to_status: 'received', to_status_label: 'Recibido',
      origin: 'staff', comment: 'Equipo recibido.', is_customer_visible: true,
      created_at: '2026-09-03T10:00:00Z', actor_name: 'dev_technician',
    },
  ],
  assignments: [],
  available_transitions: [{ code: 'diagnosing', label: 'En diagnóstico' }],
};

describe('the canonical order detail carries what the specialised reads offer', () => {
  it('fetches an order from the detail route', async () => {
    const { module, send } = load(WIRE_ORDER_DETAIL);
    await module.fetchServiceOrder(7, DEPS);

    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0]?.[0])
      .toBe('/api/v1/internal/blackdog/service/orders/7/');
  });

  it('reads the device out of that one response', async () => {
    // `GET service/devices/<id>/` exists and is a fine contract. It is not
    // needed here, and this is why.
    const { module } = load(WIRE_ORDER_DETAIL);
    const order = await module.fetchServiceOrder(7, DEPS);

    expect(order.deviceDetail).not.toBeNull();
    expect(order.deviceDetail).toMatchObject({
      id: 5, brand: 'Samsung', model: 'A54', serialNumber: 'SN-1',
    });
  });

  it('reads the timeline out of that same one response', async () => {
    // Likewise `GET service/orders/<id>/history/`.
    const { module } = load(WIRE_ORDER_DETAIL);
    const order = await module.fetchServiceOrder(7, DEPS);

    expect(order.history).toHaveLength(1);
    expect(order.history[0]).toMatchObject({
      toStatus: 'received',
      toStatusLabel: 'Recibido',
      comment: 'Equipo recibido.',
      actorName: 'dev_technician',
      isCustomerVisible: true,
    });
  });

  it('needs exactly ONE request to draw the device and the timeline', async () => {
    // The whole claim, in one assertion: a screen showing both makes a single
    // call. If somebody later "fixes coverage" by adding the two specialised
    // reads, this fails — which is the correct outcome, because three
    // round-trips for one screen is a regression wearing a completeness badge.
    const { module, send } = load(WIRE_ORDER_DETAIL);
    const order = await module.fetchServiceOrder(7, DEPS);

    expect(send).toHaveBeenCalledTimes(1);
    expect(order.deviceDetail).not.toBeNull();
    expect(order.history.length).toBeGreaterThan(0);
  });

  it('survives a server that omits them, without inventing a second call', async () => {
    // A detail without the optional blocks degrades to empty — it does not
    // trigger a fallback fetch. Absent data is not an excuse to widen coverage.
    const { module, send } = load({
      ...WIRE_ORDER_DETAIL, device_detail: null, history: undefined,
    });
    const order = await module.fetchServiceOrder(7, DEPS);

    expect(send).toHaveBeenCalledTimes(1);
    expect(order.deviceDetail).toBeNull();
    expect(order.history).toEqual([]);
  });

  it('takes the transitions from the same payload rather than a local table', async () => {
    const { module } = load(WIRE_ORDER_DETAIL);
    const order = await module.fetchServiceOrder(7, DEPS);

    expect(order.availableTransitions).toEqual([
      { code: 'diagnosing', label: 'En diagnóstico' },
    ]);
  });
});

describe('the module asks for nothing outside its own surface', () => {
  it('builds every path under this tenant’s service prefix', async () => {
    // Stated as a property rather than a list, so it keeps holding as the
    // module grows. A route added tomorrow is covered by this the day it lands.
    const calls: [string, (m: Loaded) => Promise<unknown>][] = [
      ['context', (m) => m.fetchServiceContext(DEPS)],
      ['customers', (m) => m.searchServiceCustomers({}, DEPS)],
      ['devices', (m) => m.fetchServiceDevices({}, DEPS)],
      ['orders', (m) => m.fetchServiceOrders({}, DEPS)],
      ['order', (m) => m.fetchServiceOrder(7, DEPS)],
      ['diagnostics', (m) => m.fetchServiceDiagnostics(7, DEPS)],
      ['quotes', (m) => m.fetchServiceQuotes(7, DEPS)],
      ['parts', (m) => m.fetchServicePartUsages(7, DEPS)],
      ['payment summary', (m) => m.fetchServicePaymentSummary(7, DEPS)],
    ];

    for (const [label, call] of calls) {
      const { module, send } = load({ results: [] });
      await call(module);
      const path = String(send.mock.calls[0]?.[0]);
      expect([label, path.startsWith('/api/v1/internal/blackdog/service/')])
        .toEqual([label, true]);
      expect(path).not.toContain('/api/admin/');
    }
  });
});
