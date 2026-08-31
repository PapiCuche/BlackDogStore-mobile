import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { companySlug } from '@/config/env';
import {
  addLine,
  cartTotals,
  emptyCart,
  lineFromProduct,
  removeLines,
  setQuantity as setLineQuantity,
  removeLine,
  type Cart,
  type CartTotals,
} from '@/domain/cart/types';
import type { Product } from '@/domain/products/types';

import { loadCart, saveCart } from './cart-storage';

/**
 * The basket, as ONE source of truth.
 *
 * A `useState` per screen would mean the Shop badge, the cart screen and the
 * checkout each holding their own idea of what is in it, and they would
 * disagree the first time one of them missed a re-render.
 *
 * NO REDUX, NO ZUSTAND. A context over a small reducer-shaped state is enough
 * for one basket, and the project's rule is that a dependency has to earn its
 * place. This one would not.
 *
 * TENANT-SCOPED. The basket belongs to a storefront, never to the app. Two
 * companies' baskets are two baskets; there is no global one and no falling
 * back to the pilot's.
 */

export type CartContextValue = {
  cart: Cart;
  totals: CartTotals;
  /** False until the stored basket has been read. Screens wait rather than flash empty. */
  isReady: boolean;
  /** Null when this build has no tenant — nothing can be added to a shop that is not named. */
  tenantSlug: string | null;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productSlug: string, quantity: number) => void;
  remove: (productSlug: string) => void;
  /** Drop exactly the lines that were paid for. Never called before confirmation. */
  clearPurchased: (productSlugs: readonly string[]) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Used when this build has no tenant. Nothing is ever stored under it. */
const NO_TENANT = 'unconfigured';

export function CartProvider({
  children,
  tenantSlug = companySlug,
}: {
  children: ReactNode;
  /** Injectable for tests; production reads the build's configured tenant. */
  tenantSlug?: string | null;
}) {
  const scope = tenantSlug ?? NO_TENANT;
  const [cart, setCart] = useState<Cart>(() => emptyCart(scope));
  const [loaded, setLoaded] = useState<string | null>(null);

  // Guards the first write: without it, the empty initial state would be saved
  // over a stored basket before the load resolved.
  const hydrated = useRef(false);

  // DERIVED, not stored. A build with no tenant has nothing to load, so it is
  // ready immediately — and deriving that avoids a synchronous setState inside
  // an effect, which React rightly complains about.
  const isReady = tenantSlug === null || loaded === tenantSlug;

  useEffect(() => {
    // Nothing to read: no storefront means no basket, and never the pilot's.
    if (tenantSlug === null) {
      hydrated.current = true;
      return;
    }

    let cancelled = false;
    hydrated.current = false;

    void loadCart(tenantSlug).then((stored) => {
      if (cancelled) return;
      setCart(stored);
      hydrated.current = true;
      setLoaded(tenantSlug);
    });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!hydrated.current || tenantSlug === null) return;
    void saveCart(cart);
  }, [cart, tenantSlug]);

  const add = useCallback(
    (product: Product, quantity = 1) => {
      if (tenantSlug === null) return;
      setCart((current) => addLine(current, lineFromProduct(product, quantity)));
    },
    [tenantSlug],
  );

  const setQuantity = useCallback((productSlug: string, quantity: number) => {
    setCart((current) => setLineQuantity(current, productSlug, quantity));
  }, []);

  const remove = useCallback((productSlug: string) => {
    setCart((current) => removeLine(current, productSlug));
  }, []);

  const clearPurchased = useCallback((productSlugs: readonly string[]) => {
    setCart((current) => removeLines(current, productSlugs));
  }, []);

  const clear = useCallback(() => {
    setCart((current) => emptyCart(current.tenantSlug));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      totals: cartTotals(cart),
      isReady,
      tenantSlug,
      add,
      setQuantity,
      remove,
      clearPurchased,
      clear,
    }),
    [cart, isReady, tenantSlug, add, setQuantity, remove, clearPurchased, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (value === null) {
    throw new Error('useCart debe usarse dentro de <CartProvider>.');
  }
  return value;
}
