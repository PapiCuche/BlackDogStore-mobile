import { act, render, waitFor } from '@testing-library/react-native';

import { CartProvider, useCart } from '@/cart/cart-provider';
import { loadCart, saveCart } from '@/cart/cart-storage';
import { emptyCart } from '@/domain/cart/types';
import type { Product } from '@/domain/products/types';

/**
 * M5 — the basket across a restart, a tenant change and a session change.
 *
 * The basket is NOT secret and NOT authoritative, so it lives in AsyncStorage
 * rather than the Keychain. What it must be is tenant-scoped and durable enough
 * that being pushed out of the app by a phone call does not cost someone the
 * twenty minutes they spent choosing things.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const storage = jest.requireMock('@react-native-async-storage/async-storage') as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

function product(slug: string, price = '100.00'): Product {
  return {
    id: 1,
    name: slug,
    slug,
    description: '',
    price,
    inventory: 5,
    category: null,
    imageUrl: '',
    averageRating: null,
    reviewCount: 0,
  };
}

async function mount(tenantSlug: string | null) {
  let api!: ReturnType<typeof useCart>;
  function Probe() {
    api = useCart();
    return null;
  }
  const view = await render(
    <CartProvider tenantSlug={tenantSlug}>
      <Probe />
    </CartProvider>,
  );
  await waitFor(() => expect(api.isReady).toBe(true));
  return { get: () => api, view };
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
  storage.removeItem.mockResolvedValue(undefined);
});

describe('storage keys', () => {
  it('stores under a TENANT-scoped key', async () => {
    await saveCart({
      tenantSlug: 'blackdog',
      lines: [{ productSlug: 'x', quantity: 1, name: 'X', imageUrl: '', lastSeenPrice: '1.00' }],
    });

    expect(storage.setItem.mock.calls[0]![0]).toBe('bds.cart.blackdog');
  });

  it('does NOT use secure storage', async () => {
    // A basket holds no credential and no authoritative price. Putting it in the
    // Keychain would dilute what "secure" means in this codebase.
    const secure = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };

    await saveCart({
      tenantSlug: 'blackdog',
      lines: [{ productSlug: 'x', quantity: 1, name: 'X', imageUrl: '', lastSeenPrice: '1.00' }],
    });

    expect(secure.setItemAsync).not.toHaveBeenCalled();
  });

  it('removes the key instead of storing an empty basket', async () => {
    await saveCart(emptyCart('blackdog'));

    expect(storage.removeItem).toHaveBeenCalledWith('bds.cart.blackdog');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('restores a stored basket', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        tenantSlug: 'blackdog',
        lines: [
          { productSlug: 'iphone', quantity: 2, name: 'iPhone', imageUrl: '', lastSeenPrice: '10.00' },
        ],
      }),
    );

    const cart = await loadCart('blackdog');

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(2);
  });

  it('REFUSES a basket stored under a different tenant', async () => {
    // Even if the key somehow matched. Mixing two shops' baskets is worse than
    // an empty one.
    storage.getItem.mockResolvedValue(
      JSON.stringify({ tenantSlug: 'otra', lines: [{ productSlug: 'x', quantity: 1 }] }),
    );

    expect((await loadCart('blackdog')).lines).toHaveLength(0);
  });

  it('survives corrupted JSON rather than refusing to open the cart', async () => {
    storage.getItem.mockResolvedValue('{no es json');

    expect((await loadCart('blackdog')).lines).toHaveLength(0);
  });

  it('drops malformed lines and keeps the usable ones', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        tenantSlug: 'blackdog',
        lines: [
          { productSlug: 'ok', quantity: 1, name: 'OK', imageUrl: '', lastSeenPrice: '1.00' },
          { productSlug: '', quantity: 1 },
          { productSlug: 'sin-cantidad' },
          { productSlug: 'negativa', quantity: -3 },
        ],
      }),
    );

    const cart = await loadCart('blackdog');

    expect(cart.lines.map((l) => l.productSlug)).toEqual(['ok']);
  });

  it('survives a storage read that fails', async () => {
    storage.getItem.mockRejectedValue(new Error('disk'));

    expect((await loadCart('blackdog')).lines).toHaveLength(0);
  });
});

describe('the provider', () => {
  it('adds without any session — browsing is public', async () => {
    const { get } = await mount('blackdog');

    await act(async () => get().add(product('iphone')));

    expect(get().cart.lines).toHaveLength(1);
    expect(get().totals.itemCount).toBe(1);
  });

  it('persists what was added', async () => {
    const { get } = await mount('blackdog');

    await act(async () => get().add(product('iphone')));

    await waitFor(() => expect(storage.setItem).toHaveBeenCalled());
    expect(storage.setItem.mock.calls.at(-1)![0]).toBe('bds.cart.blackdog');
  });

  it('does NOT overwrite a stored basket before it has loaded', async () => {
    // Without the hydration guard, the empty initial state would be written over
    // a real basket the moment the provider mounted.
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        tenantSlug: 'blackdog',
        lines: [{ productSlug: 'x', quantity: 1, name: 'X', imageUrl: '', lastSeenPrice: '1.00' }],
      }),
    );

    const { get } = await mount('blackdog');

    expect(get().cart.lines).toHaveLength(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('holds NOTHING when this build has no tenant', async () => {
    // No storefront means no basket — and never the pilot's.
    const { get } = await mount(null);

    await act(async () => get().add(product('iphone')));

    expect(get().cart.lines).toHaveLength(0);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('clears only the lines that were PAID for', async () => {
    const { get } = await mount('blackdog');
    await act(async () => {
      get().add(product('iphone'));
      get().add(product('cargador'));
    });

    await act(async () => get().clearPurchased(['iphone']));

    expect(get().cart.lines.map((l) => l.productSlug)).toEqual(['cargador']);
  });

  it('keeps a separate basket per tenant', async () => {
    const first = await mount('blackdog');
    await act(async () => first.get().add(product('iphone')));
    await first.view.unmount();

    storage.getItem.mockResolvedValue(null);
    const second = await mount('otra-empresa');

    expect(second.get().cart.lines).toHaveLength(0);
    expect(second.get().cart.tenantSlug).toBe('otra-empresa');
  });
});
