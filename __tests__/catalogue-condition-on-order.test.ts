/**
 * DC2 (new or used, sold by unit) and DC3 («bajo pedido») on the storefront.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `1448a5d`
 * (`store/serializers.py` > `V1ProductSerializer`,
 * `store/supply_services.py` > `on_order_payload`,
 * `store/v1_views.py` > `V1StorefrontProductViewSet`):
 *
 *   condition_line  'new' | 'used'
 *   product_model   the model's slug, or null
 *   sells_by_unit   the web sells it device by device
 *   on_order        {lead_time_days, price, over_stock?} or null
 *
 * WHAT THE BUYER MAY KNOW, AND NOTHING MORE. `on_order_payload` sends the lead
 * time and the price it would cost; never the cost, the supplier, or how many
 * it confirmed.
 */
import { describeAvailability } from '@/domain/products/availability';
import type { Product } from '@/domain/products/types';
import { describeConditionLine, describeOnOrder } from '@/domain/products/types';

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/catalog-v1');

const ROW = {
  id: 3,
  name: 'Cargador 20W',
  slug: 'cargador',
  description: '',
  price: '99.00',
  inventory: 0,
  category: { id: 1, name: 'Accesorios', slug: 'accesorios' },
  image_url: '',
  average_rating: null,
  review_count: 0,
  condition_line: 'new',
  product_model: null,
  sells_by_unit: false,
  on_order: { lead_time_days: 5, price: '109.90' },
};

function load(result: unknown = ROW) {
  const send = jest.fn(async (..._args: unknown[]) => result);
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/client', () => ({
      ...jest.requireActual('@/api/client'),
      request: (path: string, opts: unknown) => send(path, opts),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    module = require('@/api/endpoints/catalog-v1');
  });
  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/client');
  jest.dontMock('@/config/env');
});

function productWith(extra: Partial<Product>): Product {
  return {
    id: 3,
    name: 'Cargador 20W',
    slug: 'cargador',
    description: '',
    price: '99.00',
    inventory: 0,
    category: null,
    imageUrl: '',
    averageRating: null,
    reviewCount: 0,
    conditionLine: 'new',
    productModel: null,
    sellsByUnit: false,
    onOrder: null,
    ...extra,
  };
}

describe('what the catalogue now reads', () => {
  it('maps the condition, the model slug, the by-unit flag and the offer', async () => {
    const { module } = load();

    const product = await module.fetchV1ProductBySlug('cargador');

    expect(product).toMatchObject({
      conditionLine: 'new',
      productModel: null,
      sellsByUnit: false,
      onOrder: { leadTimeDays: 5, price: '109.90', overStock: false },
    });
  });

  it('reads a condition it does not know as neither new nor used', async () => {
    // Inventing «nuevo» for an unknown value would describe a used device as
    // new, which is the one mistake that matters here.
    const { module } = load({ ...ROW, condition_line: 'refurbished' });

    expect((await module.fetchV1ProductBySlug('cargador'))!.conditionLine).toBe('');
  });

  it('carries over_stock only when the server sent it', async () => {
    const { module } = load({
      ...ROW,
      on_order: { lead_time_days: 2, price: '150.00', over_stock: true },
    });

    expect((await module.fetchV1ProductBySlug('cargador'))!.onOrder).toEqual({
      leadTimeDays: 2,
      price: '150.00',
      overStock: true,
    });
  });

  it('reads a half-written offer as NO offer', async () => {
    // «entrega en 0 días» at «S/ 0» is a promise nobody made.
    for (const broken of [
      { lead_time_days: 5 },
      { price: '109.90' },
      { lead_time_days: 'pronto', price: '109.90' },
      {},
    ]) {
      const { module } = load({ ...ROW, on_order: broken });
      expect((await module.fetchV1ProductBySlug('cargador'))!.onOrder).toBeNull();
    }
  });

  it('reads a product with no offer as it always did', async () => {
    const { module } = load({ ...ROW, on_order: null });

    expect((await module.fetchV1ProductBySlug('cargador'))!.onOrder).toBeNull();
  });

  it('never surfaces a cost or a supplier, whatever the server sends', async () => {
    // `on_order_payload` does not send them. If one ever appeared, it must not
    // reach a screen through this mapper.
    const { module } = load({
      ...ROW,
      on_order: { lead_time_days: 5, price: '109.90', cost: '70.00', supplier: 'Mayorista X' },
    });

    const product = await module.fetchV1ProductBySlug('cargador');

    expect(JSON.stringify(product)).not.toContain('70.00');
    expect(JSON.stringify(product)).not.toContain('Mayorista');
  });
});

describe('what an availability line says', () => {
  it('says the lead time instead of «agotado» when the shop can bring it', () => {
    const line = describeAvailability(
      productWith({ inventory: 0, onOrder: { leadTimeDays: 5, price: '109.90', overStock: false } }),
    );

    expect(line.label).toBe('Bajo pedido — entrega en 5 días');
  });

  it('still says «agotado» when nothing can be ordered', () => {
    expect(describeAvailability(productWith({ inventory: 0 })).label).toBe('Agotado');
  });

  it('leaves a product with stock alone, offer or no offer', () => {
    // With stock the web sells at the shelf price and the offer stays out of
    // the way.
    const line = describeAvailability(
      productWith({ inventory: 4, onOrder: { leadTimeDays: 5, price: '109.90', overStock: false } }),
    );

    expect(line.label).not.toContain('Bajo pedido');
  });

  it('writes one day in the singular', () => {
    expect(describeOnOrder({ leadTimeDays: 1, price: '1.00', overStock: false })).toBe(
      'Bajo pedido — entrega en 1 día',
    );
  });
});

describe('the words for a condition', () => {
  it('uses the shop vocabulary and says nothing for neither', () => {
    expect(describeConditionLine('new')).toBe('Nuevo');
    expect(describeConditionLine('used')).toBe('Usado');
    expect(describeConditionLine('')).toBeNull();
  });
});
