import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PosRejectedError } from '@/api/endpoints/internal-pos-v1';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from '@/api/endpoints/internal-v1';
import type { PosProduct } from '@/domain/internal/pos-types';
import {
  describeScan,
  scanCode,
  scanFailureMessage,
  scanNoticeColor,
} from '@/features/internal/pos-scan';
import { usePosLookup } from '@/hooks/use-internal-pos';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * Scanning at the counter — the half of barcode reading that was missing.
 *
 * `GET /api/v1/internal/<slug>/sales/pos/products/lookup/` has been merged, and
 * wrapped by `lookupPosProduct` and `V1InternalPosRepository.lookupProduct`,
 * since IP1A. The integration status called barcode reading INTEGRATED/TESTED.
 * No hook wrapped the repository method and no screen could reach it, so a
 * keyboard-wedge scanner typed its code into the search box and Enter did
 * nothing at all.
 *
 * The contract, verified against `BlackDogStore-web` origin/master:
 *   capability   `sales.pos.use`, re-resolved per request (403)
 *   tenant       slug + membership; 404 before anything else
 *   branch       `pos_services.resolve_pos_branch`, the Web till's resolver (400)
 *   code         `normalize_barcode` — strip only; 400 when empty
 *   unknown      404, identical for another company's code (anti-enumeration)
 *   payload      `pos_payloads.product_payload` — the SAME function the legacy
 *                Web till aliases as `_product_payload`
 *   Web          `handleScan` in `frontend/app/admin/sales/pos/page.tsx`
 */

jest.mock('@/providers/use-query-scope', () => {
  const { makeQueryScope: make } = jest.requireActual('@/providers/query-scope');
  const scope = make({ tenantSlug: 'blackdog', userId: 42 });
  return { useQueryScope: () => scope };
});

const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

const mockLookup = jest.fn();

jest.mock('@/repositories/api/v1-internal-pos-repository', () => ({
  V1InternalPosRepository: class {
    lookupProduct(...args: unknown[]) {
      return mockLookup(...args);
    }
  },
}));

jest.mock('@/auth/auth-runtime', () => ({
  getAuthRuntime: () => ({ coordinator: {} }),
}));

type Wrapper = (props: { children: ReactNode }) => ReactNode;

const clients: QueryClient[] = [];
const mounted: (() => void)[] = [];

function harness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  const wrapper: Wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

async function lookupHook(wrapper: Wrapper) {
  const view = await renderHook(() => usePosLookup(), { wrapper });
  mounted.push(view.unmount);
  return view.result.current;
}

afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  for (const client of clients.splice(0)) client.clear();
});

beforeEach(() => {
  mockLookup.mockReset();
});

const CABLE: PosProduct = {
  id: 4,
  name: 'Cable USB-C',
  price: '1250.00',
  available: 3,
  barcode: '0750123456789',
};

describe('what a scan means — the Web till, word for word', () => {
  it('names the code it could not find', () => {
    expect(describeScan('0750999', null)).toEqual({
      kind: 'not_found',
      message: 'Código no encontrado: 0750999',
    });
  });

  it.each([0, -2])('refuses an article with %s on this shelf rather than adding it', (available) => {
    const outcome = describeScan('0750123456789', { ...CABLE, available });
    expect(outcome.kind).toBe('no_stock');
    expect(outcome.message).toBe('Cable USB-C sin stock en esta sucursal.');
  });

  it('adds an article with stock, printing the price exactly as the server wrote it', () => {
    const outcome = describeScan('0750123456789', CABLE);
    expect(outcome.kind).toBe('add');
    // The server's string, not a formatted or re-parsed number.
    expect(outcome.message).toBe('Cable USB-C · 1250.00');
    expect(outcome.kind === 'add' && outcome.product).toBe(CABLE);
  });

  it('trims the code and leaves everything else exactly as scanned', () => {
    // A wedge scanner sends CR/LF instead of Enter. The leading zero and the
    // mixed case are part of the article's identity.
    expect(scanCode('  0123ABcd\r\n')).toBe('0123ABcd');
    expect(scanCode('0750123456789')).toBe('0750123456789');
  });

  it('does not colour an intention as a success', () => {
    expect(scanNoticeColor('add')).toBe('textSecondary');
    expect(scanNoticeColor('no_stock')).toBe('statusWarning');
    expect(scanNoticeColor('not_found')).toBe('danger');
    expect(scanNoticeColor('error')).toBe('danger');
  });
});

describe('a scan that could not be answered says why', () => {
  it('keeps a lost capability as its own sentence', () => {
    // The generic fallback would have said "algo salió mal".
    expect(scanFailureMessage(new InternalCapabilityMissingError())).toBe(
      'No tienes permiso para esta acción.',
    );
  });

  it('keeps a closed company as its own sentence', () => {
    const error = new InternalAccessDeniedError();
    expect(scanFailureMessage(error)).toBe(error.message);
  });

  it('repeats the server when it refuses the shop', () => {
    expect(
      scanFailureMessage(new PosRejectedError('No puedes vender desde esta sucursal.')),
    ).toBe('No puedes vender desde esta sucursal.');
  });
});

describe('usePosLookup', () => {
  it('asks for this code in this shop, and nothing else', async () => {
    mockLookup.mockResolvedValue(CABLE);
    const { wrapper } = harness();
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0750123456789')).resolves.toBe(CABLE);

    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockLookup.mock.calls[0]![0]).toEqual({ code: '0750123456789', branch: 2 });
  });

  it('keys the read by tenant, user, shop and code', async () => {
    mockLookup.mockResolvedValue(CABLE);
    const { client, wrapper } = harness();
    const fetchQuery = jest.spyOn(client, 'fetchQuery');
    const lookup = await lookupHook(wrapper);

    await lookup(2, '0750123456789');

    const key = fetchQuery.mock.calls[0]![0].queryKey;
    expect(key).toEqual(queryKeys.internalPosLookup(SCOPE, 2, '0750123456789'));
    // Under the POS root, so a sale or a lost capability evicts it too.
    const root = queryKeys.internalPosRoot(SCOPE);
    expect(key.slice(0, root.length)).toEqual(root);
    expect(JSON.stringify(key)).toContain('blackdog');
    expect(JSON.stringify(key)).toContain('42');
  });

  it('NEVER retries a read the server has already answered', async () => {
    mockLookup.mockRejectedValue(new PosRejectedError('No puedes vender desde esta sucursal.'));
    const { wrapper } = harness();
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0750123456789')).rejects.toBeInstanceOf(PosRejectedError);
    expect(mockLookup).toHaveBeenCalledTimes(1);
  });

  it('asks the server again on every scan of the same label', async () => {
    // `available` is the shelf NOW. A cached answer is how the last unit sells twice.
    mockLookup.mockResolvedValueOnce(CABLE).mockResolvedValueOnce({ ...CABLE, available: 0 });
    const { wrapper } = harness();
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0750123456789')).resolves.toEqual(CABLE);
    await expect(lookup(2, '0750123456789')).resolves.toEqual({ ...CABLE, available: 0 });
    expect(mockLookup).toHaveBeenCalledTimes(2);
  });

  it('passes an unknown code through as null, not as an error', async () => {
    mockLookup.mockResolvedValue(null);
    const { wrapper } = harness();
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0000')).resolves.toBeNull();
  });

  it('evicts the till when the capability is gone, and keeps the error typed', async () => {
    mockLookup.mockRejectedValue(new InternalCapabilityMissingError());
    const { client, wrapper } = harness();
    const remove = jest.spyOn(client, 'removeQueries');
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0750123456789')).rejects.toBeInstanceOf(
      InternalCapabilityMissingError,
    );

    const evicted = remove.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(evicted).toContain(JSON.stringify(queryKeys.internalPosRoot(SCOPE)));
    expect(evicted).toContain(JSON.stringify(queryKeys.internalContext(SCOPE)));
  });

  it('evicts nothing for an ordinary refusal', async () => {
    mockLookup.mockRejectedValue(new PosRejectedError('No puedes vender desde esta sucursal.'));
    const { client, wrapper } = harness();
    const remove = jest.spyOn(client, 'removeQueries');
    const lookup = await lookupHook(wrapper);

    await expect(lookup(2, '0750123456789')).rejects.toBeInstanceOf(PosRejectedError);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('structural — the scan is reachable, gated and cannot assert a price', () => {
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
  const SCREEN = 'src/app/internal/pos/index.tsx';
  const SCAN = 'src/features/internal/pos-scan.ts';
  const HOOKS = 'src/hooks/use-internal-pos.ts';

  function scanBody(source: string): string {
    const at = source.indexOf('async function scan(');
    expect(at).toBeGreaterThan(-1);
    return source.slice(at, source.indexOf('function confirm(', at));
  }

  it('submits a scan from the search field', () => {
    // The whole finding: a wedge scanner presses Enter, and Enter did nothing.
    expect(code(SCREEN)).toMatch(/onSubmitEditing=\{\(\) => void scan\(\)\}/);
  });

  it('calls the hook unconditionally and offers the scan only inside the capability gate', () => {
    const source = code(SCREEN);
    const gate = source.indexOf('if (!mayUse)');
    expect(gate).toBeGreaterThan(-1);
    expect(source.indexOf('usePosLookup()')).toBeGreaterThan(-1);
    expect(source.indexOf('usePosLookup()')).toBeLessThan(gate);
    expect(source.indexOf('onSubmitEditing=')).toBeGreaterThan(gate);
  });

  it('never scans without a shop, or while a price or a charge is in flight', () => {
    const body = scanBody(code(SCREEN));
    expect(body).toMatch(/branch === null/);
    expect(body).toMatch(/preview\.isPending \|\| sale\.isPending/);
  });

  it('clears the field before the server answers, so a second Enter adds nothing', () => {
    const body = scanBody(code(SCREEN));
    const cleared = body.indexOf("setTerm('')");
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(body.indexOf('await lookup('));
  });

  it('adds through add(), so the price on screen is blanked and must be asked for again', () => {
    const source = code(SCREEN);
    expect(scanBody(source)).toMatch(/add\(outcome\.product\)/);
    const add = source.slice(source.indexOf('function add('), source.indexOf('function setQuantity('));
    expect(add).toMatch(/repriceNeeded\(\)/);
  });

  it('does no arithmetic and reshapes no code on the way', () => {
    const sources = [code(SCAN), scanBody(code(SCREEN))].join('\n');
    for (const forbidden of [
      /toUpperCase/, /toLowerCase/, /parseInt/, /parseFloat/, /Number\(/,
      /\bprice[\w.?![\]]*\s*[-+*/]\s*[\w(]/i, /toFixed/, /\.reduce\(/,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('reads from the real API only — no mock fallback, no legacy surface, no role', () => {
    const hooks = code(HOOKS);
    expect(hooks).toMatch(/new V1InternalPosRepository\(/);
    expect(hooks).not.toMatch(/Mock\w*Repository/);
    const sources = [hooks, code(SCAN), code(SCREEN)].join('\n');
    expect(sources).not.toMatch(/\/api\/admin\//);
    expect(sources).not.toMatch(/\brole\s*===?/);
  });

  it('signs nobody out on a refused scan', () => {
    const sources = [code(HOOKS), code(SCAN)].join('\n');
    expect(sources).not.toMatch(/signOut|clearSession|logout/i);
  });
});
