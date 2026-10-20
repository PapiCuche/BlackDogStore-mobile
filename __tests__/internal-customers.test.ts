/**
 * «Clientes» — who is standing at the counter.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `50e7afe`
 * (`store/v1_service_views.py` > `V1ServiceCustomerSearchView`):
 *
 *   GET internal/<slug>/service/customers/?search=&page=   `service.customers.view`
 *
 * THE NARROWEST THING THAT WORKS, and the server says so in its own docstring:
 * the CRM lives on the web console and is not reachable with a Bearer token,
 * so this answers a name, a document and a phone — enough to tell two people
 * apart — and nothing else. Creating or editing a file is BR-016.
 *
 * NOT A LIST OF EVERY CLIENT: without a search term it returns the most recent
 * few, because «download every client of this company» is not a request a
 * counter makes.
 */
import { INTERNAL_MODULES, visibleModules } from '@/features/internal/module-registry';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

const PAGE = {
  count: 2,
  page: 1,
  page_size: 20,
  results: [
    { id: 7, display_name: 'Ana Torres', document_number: '12345678', phone: '987654321' },
    { id: 8, display_name: 'Bodega Central', document_number: '20123456789', phone: '' },
  ],
};

function load(result: unknown = PAGE) {
  const send = jest.fn(async (..._args: unknown[]) => result);
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    module = require('@/api/endpoints/internal-service-v1');
  });
  return { module, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('finding a customer', () => {
  it('asks the service surface of this company', async () => {
    const { module, send, deps } = load();

    await module.searchServiceCustomers({ search: 'ana' }, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/service/customers/');
    expect((send.mock.calls[0]![1] as { query: Record<string, unknown> }).query).toEqual({
      search: 'ana',
    });
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('asks with no term at all, which the server answers with the most recent', async () => {
    const { module, send, deps } = load();

    await module.searchServiceCustomers({}, deps);

    expect((send.mock.calls[0]![1] as { query: Record<string, unknown> }).query).toEqual({});
  });

  it('maps the three fields the server sends, and no more', async () => {
    const { module, deps } = load();

    const page = await module.searchServiceCustomers({ search: 'ana' }, deps);

    expect(page.results[0]).toEqual({
      id: 7,
      displayName: 'Ana Torres',
      documentNumber: '12345678',
      phone: '987654321',
    });
    // No address, no history, no balance: the route does not send them and no
    // screen may invent them.
    expect(Object.keys(page.results[0]!)).toEqual([
      'id',
      'displayName',
      'documentNumber',
      'phone',
    ]);
  });
});

describe('the module people reach it through', () => {
  it('is offered to whoever may view customers', () => {
    const visible = visibleModules({
      capabilities: ['service.customers.view'],
    } as never);

    expect(visible.map((m) => m.key)).toContain('customers');
  });

  it('is not offered to somebody without that capability', () => {
    // Showing a module greyed out tells people what the company's structure
    // looks like, and they did not ask.
    const visible = visibleModules({ capabilities: ['sales.pos.use'] } as never);

    expect(visible.map((m) => m.key)).not.toContain('customers');
  });

  it('leads somewhere, which is what «ready» has to mean', () => {
    // A module marked ready with no route is a card that does nothing — the
    // exact shape of the gap this screen was written to close.
    const customers = INTERNAL_MODULES.find((m) => m.key === 'customers')!;

    expect(customers.integration).toBe('ready');
    expect(customers.route).toBe('/internal/customers');
  });

  it('leaves no other module claiming ready without a route', () => {
    for (const module of INTERNAL_MODULES) {
      if (module.integration === 'ready') expect(module.route).toBeTruthy();
    }
  });
});
