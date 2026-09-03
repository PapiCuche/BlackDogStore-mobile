import {
  CAP_SERVICE_CUSTOMERS_VIEW,
  CAP_SERVICE_DEVICES_MANAGE,
  CAP_SERVICE_DEVICES_VIEW,
  CAP_SERVICE_ORDERS_CREATE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { visibleModules } from '@/features/internal/module-registry';

/**
 * Receiving a device is its own permission, and Mobile must draw it from that
 * permission alone.
 *
 * THE CONTRACT, read in `BlackDogStore-web` @ `2dca0a3`:
 *
 *   V1ServiceContextView          service.orders.view
 *   V1ServiceCustomerSearchView   service.customers.view
 *   V1ServiceDeviceListView  GET  service.devices.view
 *                            POST service.devices.manage
 *   V1ServiceOrderListView   GET  service.orders.view
 *                            POST service.orders.create      ← intake
 *   V1ServiceOrderTransition      service.orders.manage
 *
 * The standard `Servicio Técnico` preset happens to hold most of these at once,
 * which is exactly why they have to be tested apart: a preset that bundles them
 * hides the day a company builds a narrower role and the app starts drawing
 * controls the server refuses.
 */

/**
 * A context, with a role label that goes nowhere.
 *
 * `_roleLabel` is UNUSED, and that is the strongest available statement of the
 * rule: `InternalContext` has no `role` field to put it in. The label cannot
 * reach a decision because there is nowhere for it to live — a company may call
 * this person «técnico», «recepción» or «mostrador» and the type simply has no
 * slot for the answer. The parameter stays so the tests below read the way the
 * question is actually asked.
 */
function context(capabilities: string[], _roleLabel = 'technician'): InternalContext {
  return {
    company: { slug: 'blackdog', name: 'Black Dog Store' },
    member: true,
    capabilities,
    isPlatformMaster: false,
  };
}

/** What the standard technician preset actually resolves to. */
const TECHNICIAN = [
  'company.view',
  'service.manage',
  CAP_SERVICE_CUSTOMERS_VIEW,
  CAP_SERVICE_DEVICES_VIEW,
  CAP_SERVICE_DEVICES_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  CAP_SERVICE_ORDERS_CREATE,
  CAP_SERVICE_ORDERS_MANAGE,
  'service.diagnostic.manage',
  'service.repair.manage',
  'service.quality.manage',
  'service.delivery.manage',
];

describe('a technician can open a repair', () => {
  it('reaches the service module and the intake action', () => {
    const ctx = context(TECHNICIAN);

    // The module is drawn from the capability the CONTEXT endpoint demands.
    expect(visibleModules(ctx).some((m) => m.key === 'service')).toBe(true);
    // And intake from the one the POST demands.
    expect(hasUxCapability(ctx, CAP_SERVICE_ORDERS_CREATE)).toBe(true);
  });

  it('does not need service.orders.manage to receive a device', () => {
    // Opening an order and moving one through its lifecycle are two
    // permissions. Requiring the second to offer the first would lock out a
    // company that lets a receptionist take devices in.
    const receptionist = context([
      CAP_SERVICE_ORDERS_VIEW,
      CAP_SERVICE_ORDERS_CREATE,
      CAP_SERVICE_CUSTOMERS_VIEW,
      CAP_SERVICE_DEVICES_VIEW,
    ]);
    expect(hasUxCapability(receptionist, CAP_SERVICE_ORDERS_CREATE)).toBe(true);
    expect(hasUxCapability(receptionist, CAP_SERVICE_ORDERS_MANAGE)).toBe(false);
    expect(visibleModules(receptionist).some((m) => m.key === 'service')).toBe(true);
  });
});

describe('the four service permissions stay four', () => {
  it('view does not grant create', () => {
    const viewer = context([CAP_SERVICE_ORDERS_VIEW]);
    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_VIEW)).toBe(true);
    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_CREATE)).toBe(false);
  });

  it('create does not grant lifecycle', () => {
    const intakeOnly = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_CREATE]);
    expect(hasUxCapability(intakeOnly, CAP_SERVICE_ORDERS_MANAGE)).toBe(false);
  });

  it('create does not grant registering a device', () => {
    // A person may be allowed to take in a device that is already on file and
    // not to add a new one. The screen must ask the second question separately.
    const intakeOnly = context([
      CAP_SERVICE_ORDERS_VIEW,
      CAP_SERVICE_ORDERS_CREATE,
      CAP_SERVICE_DEVICES_VIEW,
    ]);
    expect(hasUxCapability(intakeOnly, CAP_SERVICE_DEVICES_VIEW)).toBe(true);
    expect(hasUxCapability(intakeOnly, CAP_SERVICE_DEVICES_MANAGE)).toBe(false);
  });

  it('create does not grant finding customers', () => {
    // `V1ServiceCustomerSearchView` asks for `service.customers.view`. Holding
    // `orders.create` says nothing about it.
    const intakeOnly = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_CREATE]);
    expect(hasUxCapability(intakeOnly, CAP_SERVICE_CUSTOMERS_VIEW)).toBe(false);
  });

  it('seeing customers does not grant administering them', () => {
    // The technician preset carries `.view` and NOT `.manage` — only the
    // service-supervisor preset adds the second.
    const technician = context(TECHNICIAN);
    expect(hasUxCapability(technician, CAP_SERVICE_CUSTOMERS_VIEW)).toBe(true);
    expect(hasUxCapability(technician, 'service.customers.manage')).toBe(false);
  });
});

describe('authority never comes from a role name', () => {
  it('gives two identical capability sets the identical answer', () => {
    // Same permissions, labels a company might have chosen differently. If any
    // of these diverged, something would be reading a name.
    const caps = [
      CAP_SERVICE_ORDERS_VIEW,
      CAP_SERVICE_ORDERS_CREATE,
      CAP_SERVICE_CUSTOMERS_VIEW,
      CAP_SERVICE_DEVICES_VIEW,
    ];
    const asTechnician = context(caps, 'technician');
    const asSales = context(caps, 'sales');
    const asWhatever = context(caps, 'recepcion-mostrador');

    for (const capability of [
      CAP_SERVICE_ORDERS_CREATE,
      CAP_SERVICE_ORDERS_MANAGE,
      CAP_SERVICE_DEVICES_MANAGE,
      CAP_SERVICE_CUSTOMERS_VIEW,
    ]) {
      const answer = hasUxCapability(asTechnician, capability);
      expect(hasUxCapability(asSales, capability)).toBe(answer);
      expect(hasUxCapability(asWhatever, capability)).toBe(answer);
    }

    expect(visibleModules(asSales).map((m) => m.key))
      .toEqual(visibleModules(asTechnician).map((m) => m.key));
  });

  it('lets a SALES member take a device in when the company granted it', () => {
    // The real proof that nothing reads a role: somebody whose commercial
    // permissions look nothing like a technician's, holding the intake
    // capability, gets the intake action.
    const salesWithIntake = context([
      'company.view',
      'sales.orders.view',
      'sales.pos.use',
      CAP_SERVICE_ORDERS_VIEW,
      CAP_SERVICE_ORDERS_CREATE,
      CAP_SERVICE_CUSTOMERS_VIEW,
      CAP_SERVICE_DEVICES_VIEW,
    ], 'sales');

    expect(hasUxCapability(salesWithIntake, CAP_SERVICE_ORDERS_CREATE)).toBe(true);
    expect(visibleModules(salesWithIntake).some((m) => m.key === 'service')).toBe(true);
  });
});

describe('structural — the screens gate on the right capability', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;

  function code(path: string): string {
    return fs
      .readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const INTAKE = 'src/app/internal/service/orders/new.tsx';
  const LIST = 'src/app/internal/service/orders/index.tsx';
  const CONSOLE = 'src/app/internal/service/index.tsx';

  it('gates intake on create, on every screen that offers it', () => {
    // THE BINDING, not the mention. An earlier draft asserted the file
    // contained `CAP_SERVICE_ORDERS_CREATE` and the word `mayCreate` — and
    // swapping the capability inside `hasUxCapability` left both strings in
    // place, so the guard passed while intake demanded `orders.manage`. A
    // permission check is the one place where "the name appears somewhere" is
    // not evidence of anything.
    const binding = /mayCreate = hasUxCapability\(\s*context \?\? null,\s*CAP_SERVICE_ORDERS_CREATE,?\s*\)/;
    for (const path of [CONSOLE, LIST, INTAKE]) {
      expect(code(path)).toMatch(binding);
    }
    expect(code(INTAKE)).toMatch(/if \(!mayCreate\)/);
  });

  it('actually renders the intake action under that flag', () => {
    // The other half of the same lesson: `const mayCreate = false` would keep
    // every string above and silently remove the button.
    for (const path of [CONSOLE, LIST]) {
      const source = code(path);
      const at = source.indexOf('Recibir un equipo');
      expect(at).toBeGreaterThan(-1);
      // The nearest enclosing condition is the capability flag.
      expect(source.slice(Math.max(0, at - 400), at)).toMatch(/mayCreate \?/);
    }
  });

  it('gates registering a device on devices.manage, not on create', () => {
    const source = code(INTAKE);
    expect(source).toMatch(/mayRegisterDevice = hasUxCapability\([^)]*CAP_SERVICE_DEVICES_MANAGE\)/);
    expect(source).not.toMatch(/mayRegisterDevice\s*=\s*mayCreate/);
  });

  it('gates finding customers on customers.view, not on create', () => {
    const source = code(INTAKE);
    expect(source).toMatch(/mayFindCustomers = hasUxCapability\([^)]*CAP_SERVICE_CUSTOMERS_VIEW\)/);
  });

  it('offers no way to create or edit a customer', () => {
    // `service.customers.manage` has NO v1 write route — customer search is
    // GET-only. A form here would be a screen with nothing to call.
    const sources = [INTAKE, LIST, CONSOLE].map(code).join('\n');
    expect(sources).not.toMatch(/customers\.manage/);
    expect(sources).not.toMatch(/postServiceCustomer|createCustomer/i);
  });

  it('uses no role name as authority anywhere in the service screens', () => {
    const sources = [INTAKE, LIST, CONSOLE].map(code).join('\n');
    for (const forbidden of [
      /\brole\s*===/, /\brole\s*==/, /'technician'/, /"technician"/,
      /'servicio-tecnico'/, /isTechnician/, /isAdmin/, /isSales/,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('offers only the branches the server returned', () => {
    const source = code(INTAKE);
    expect(source).toMatch(/service\.data\?\.availableBranches/);
    // No free-text branch id, and no reaching for another route's branch list.
    expect(source).not.toMatch(/branchInput|setBranchText/);
    expect(source).not.toMatch(/inventory\/branches|company\/branches/);
  });
});
