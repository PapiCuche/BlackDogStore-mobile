import type { Order } from '@/domain/orders/types';
import type { Category, Product } from '@/domain/products/types';
import type { Repair } from '@/domain/repairs/types';

/**
 * Bundled sample data.
 *
 * These are FIXTURES, not seed data — they never reach the backend and the UI
 * marks every screen that reads them. They live here, outside the component
 * tree, so that deleting this file is all it takes to prove no screen depends
 * on hardcoded content.
 *
 * Timestamps are expressed relative to module load so the Home screen's "hace
 * 25 min" stays plausible however long after the build the app is opened.
 */
const now = Date.now();
const minutes = (n: number) => new Date(now - n * 60_000).toISOString();
const days = (n: number) => new Date(now - n * 86_400_000).toISOString();

/**
 * Categories are named consts rather than positions in an array: a product
 * referring to `mockCategories[0]` would silently change meaning the moment
 * someone reorders the list.
 */
const iphone: Category = { id: 1, name: 'iPhone', slug: 'iphone' };
const mac: Category = { id: 2, name: 'Mac', slug: 'mac' };
const ipad: Category = { id: 3, name: 'iPad', slug: 'ipad' };
const audio: Category = { id: 4, name: 'Audio', slug: 'audio' };
const accesorios: Category = { id: 5, name: 'Accesorios', slug: 'accesorios' };

export const mockCategories: readonly Category[] = [iphone, mac, ipad, audio, accesorios];

const iphone15Pro: Product = {
  id: 101,
  name: 'iPhone 15 Pro 256 GB',
  slug: 'iphone-15-pro-256',
  description:
    'Titanio natural. Equipo registrado en la lista blanca del Perú. Incluye cable USB-C y garantía de tienda por 6 meses.',
  price: '4899.00',
  inventory: 4,
  category: iphone,
  imageUrl: '',
  averageRating: 4.8,
  reviewCount: 12,
};

const macbookAirM3: Product = {
  id: 102,
  name: 'MacBook Air 13" M3 8/256',
  slug: 'macbook-air-13-m3',
  description:
    'Sellado. Chip M3, 8 GB de memoria unificada y 256 GB SSD. Ideal para estudio y trabajo diario.',
  price: '5299.00',
  inventory: 2,
  category: mac,
  imageUrl: '',
  averageRating: 4.9,
  reviewCount: 7,
};

const ipad10: Product = {
  id: 103,
  name: 'iPad 10ª generación 64 GB',
  slug: 'ipad-10-64',
  description: 'Wi-Fi, color plata. Seminuevo verificado con batería sobre 90 %.',
  price: '1749.00',
  inventory: 0,
  category: ipad,
  imageUrl: '',
  averageRating: null,
  reviewCount: 0,
};

const airPodsPro2: Product = {
  id: 104,
  name: 'AirPods Pro 2 USB-C',
  slug: 'airpods-pro-2-usbc',
  description: 'Cancelación activa de ruido, audio adaptativo y estuche con USB-C.',
  price: '899.00',
  inventory: 11,
  category: audio,
  imageUrl: '',
  averageRating: 4.7,
  reviewCount: 23,
};

const charger20W: Product = {
  id: 105,
  name: 'Cargador USB-C 20 W',
  slug: 'cargador-usbc-20w',
  description: 'Carga rápida compatible con iPhone y iPad. Garantía de 12 meses.',
  price: '129.00',
  inventory: 34,
  category: accesorios,
  imageUrl: '',
  averageRating: 4.4,
  reviewCount: 41,
};

const appleWatchS9: Product = {
  id: 106,
  name: 'Apple Watch Series 9 45 mm',
  slug: 'apple-watch-s9-45',
  description: 'Caja de aluminio medianoche con correa deportiva. Seminuevo verificado.',
  price: '1899.00',
  inventory: 1,
  category: accesorios,
  imageUrl: '',
  averageRating: 4.6,
  reviewCount: 5,
};

export const mockProducts: readonly Product[] = [
  iphone15Pro,
  macbookAirM3,
  ipad10,
  airPodsPro2,
  charger20W,
  appleWatchS9,
];

export const mockRepairs: readonly Repair[] = [
  {
    id: 'r-1042',
    code: 'REP-1042',
    deviceName: 'MacBook Pro 14"',
    deviceKind: 'Mac',
    status: 'in_repair',
    reportedIssue: 'No enciende tras derrame de líquido.',
    createdAt: days(4),
    updatedAt: minutes(25),
    quotedTotal: '780.00',
    timeline: [
      { stage: 'received', occurredAt: days(4), note: 'Equipo recibido en tienda.' },
      { stage: 'diagnosis', occurredAt: days(3), note: 'Daño por líquido en placa lógica.' },
      { stage: 'awaiting_approval', occurredAt: days(3), note: 'Presupuesto enviado por WhatsApp.' },
      { stage: 'in_repair', occurredAt: minutes(25), note: 'Limpieza ultrasónica y cambio de conector.' },
      { stage: 'quality_check', occurredAt: null, note: null },
      { stage: 'ready_for_pickup', occurredAt: null, note: null },
      { stage: 'delivered', occurredAt: null, note: null },
    ],
  },
  {
    id: 'r-1039',
    code: 'REP-1039',
    deviceName: 'iPhone 13',
    deviceKind: 'iPhone',
    status: 'ready_for_pickup',
    reportedIssue: 'Cambio de batería por bajo rendimiento.',
    createdAt: days(9),
    updatedAt: days(1),
    quotedTotal: '245.00',
    timeline: [
      { stage: 'received', occurredAt: days(9), note: null },
      { stage: 'diagnosis', occurredAt: days(8), note: 'Salud de batería en 71 %.' },
      { stage: 'awaiting_approval', occurredAt: days(8), note: null },
      { stage: 'in_repair', occurredAt: days(3), note: 'Batería reemplazada.' },
      { stage: 'quality_check', occurredAt: days(2), note: 'Ciclo de carga completo verificado.' },
      { stage: 'ready_for_pickup', occurredAt: days(1), note: 'Listo para recoger en tienda.' },
      { stage: 'delivered', occurredAt: null, note: null },
    ],
  },
  {
    id: 'r-1021',
    code: 'REP-1021',
    deviceName: 'iPad Air 4',
    deviceKind: 'iPad',
    status: 'delivered',
    reportedIssue: 'Pantalla rota.',
    createdAt: days(28),
    updatedAt: days(19),
    quotedTotal: '520.00',
    timeline: [
      { stage: 'received', occurredAt: days(28), note: null },
      { stage: 'diagnosis', occurredAt: days(27), note: null },
      { stage: 'awaiting_approval', occurredAt: days(27), note: null },
      { stage: 'in_repair', occurredAt: days(24), note: null },
      { stage: 'quality_check', occurredAt: days(21), note: null },
      { stage: 'ready_for_pickup', occurredAt: days(20), note: null },
      { stage: 'delivered', occurredAt: days(19), note: 'Entregado con comprobante y garantía.' },
    ],
  },
];

export const mockOrders: readonly Order[] = [
  {
    id: 1042,
    total: '1028.00',
    discountAmount: '0.00',
    couponCode: '',
    paymentStatus: 'paid',
    paymentStatusLabel: 'Pagado',
    fulfillmentStatus: 'preparing',
    fulfillmentStatusLabel: 'En preparación',
    deliveryMethod: 'delivery_arequipa',
    deliveryMethodLabel: 'Delivery Arequipa',
    paidAt: days(1),
    createdAt: days(1),
    items: [
      {
        id: 1,
        productName: airPodsPro2.name,
        productSlug: airPodsPro2.slug,
        imageUrl: airPodsPro2.imageUrl,
        quantity: 1,
        price: '899.00',
      },
      {
        id: 2,
        productName: charger20W.name,
        productSlug: charger20W.slug,
        imageUrl: charger20W.imageUrl,
        quantity: 1,
        price: '129.00',
      },
    ],
  },
  {
    id: 1037,
    total: '5299.00',
    discountAmount: '0.00',
    couponCode: '',
    paymentStatus: 'paid',
    paymentStatusLabel: 'Pagado',
    fulfillmentStatus: 'delivered',
    fulfillmentStatusLabel: 'Entregado',
    deliveryMethod: 'pickup_store',
    deliveryMethodLabel: 'Recojo en tienda',
    paidAt: days(16),
    createdAt: days(17),
    items: [
      {
        id: 3,
        productName: macbookAirM3.name,
        productSlug: macbookAirM3.slug,
        imageUrl: macbookAirM3.imageUrl,
        quantity: 1,
        price: '5299.00',
      },
    ],
  },
  {
    id: 1030,
    total: '129.00',
    discountAmount: '12.90',
    couponCode: 'BIENVENIDO10',
    paymentStatus: 'pending_payment',
    paymentStatusLabel: 'Pendiente de pago',
    fulfillmentStatus: 'pending',
    fulfillmentStatusLabel: 'Pendiente',
    deliveryMethod: '',
    deliveryMethodLabel: '',
    paidAt: null,
    createdAt: days(31),
    items: [
      {
        id: 4,
        productName: charger20W.name,
        productSlug: charger20W.slug,
        imageUrl: charger20W.imageUrl,
        quantity: 1,
        price: '129.00',
      },
    ],
  },
];
