import type { CompanyBrand } from '@/domain/company/types';
import type { Order } from '@/domain/orders/types';
import type { Category, Product } from '@/domain/products/types';
import type { RepairEvidence } from '@/domain/repairs/evidence';
import type { QuoteDecision, RepairQuote } from '@/domain/repairs/quote';
import type { CustomerPaymentSummary } from '@/domain/internal/service-types';
import type { Repair } from '@/domain/repairs/types';

/**
 * Repository interfaces.
 *
 * These exist for exactly one reason: Mobile is being built alongside a backend
 * that does not yet have a repairs domain and whose auth contract Mobile cannot
 * speak. Without a seam, "we have no endpoint yet" turns into hardcoded arrays
 * inside screen components, and swapping them out later means rewriting the
 * screens.
 *
 * The seam is drawn at the smallest useful place — one method per thing a
 * screen asks for. There is no unit-of-work, no generic `Repository<T>` and no
 * DI container, because none of those would carry their weight here.
 *
 * Every method takes an optional `AbortSignal` so TanStack Query can cancel an
 * in-flight request when a screen unmounts.
 */

export type CatalogRepository = {
  listProducts(params: { search?: string; categorySlug?: string }, signal?: AbortSignal): Promise<Product[]>;
  listCategories(signal?: AbortSignal): Promise<Category[]>;
  getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | null>;
};

export type RepairRepository = {
  listRepairs(signal?: AbortSignal): Promise<Repair[]>;
  // `number` since M8: Django hands out integer primary keys, and the id was a
  // string only while the data was a fixture that could pick its own.
  getRepairById(id: number, signal?: AbortSignal): Promise<Repair | null>;
  // BR-005B. `null` is a normal answer: most of a repair's life has no quote.
  getRepairQuote(repairId: number, signal?: AbortSignal): Promise<RepairQuote | null>;
  // M12B. What I agreed to, what I have paid, what is left. FIVE numbers, all
  // of them decimal STRINGS the server computed — this app never does
  // arithmetic on money, because a second answer that disagrees with the shop's
  // is the one the customer would be reading.
  getPaymentSummary(
    repairId: number, signal?: AbortSignal,
  ): Promise<CustomerPaymentSummary>;
  decideQuote(
    input: { repairId: number; quoteId: number; decision: QuoteDecision; reason?: string },
    signal?: AbortSignal,
  ): Promise<RepairQuote>;
  // M12D. The photos the shop chose to share, and the two things an image
  // loader needs to fetch one: an absolute URL and a Bearer header. The bytes
  // are NOT handed over as a signed link — the content route re-checks company,
  // ownership, visibility and voiding on every request.
  listEvidence(repairId: number, signal?: AbortSignal): Promise<RepairEvidence[]>;
  evidenceContentUrl(repairId: number, evidenceId: number): string;
  evidenceAuthorization(): Promise<string>;
};

export type OrderRepository = {
  listOrders(signal?: AbortSignal): Promise<Order[]>;
  getOrderById(id: number, signal?: AbortSignal): Promise<Order | null>;
};

export type CompanyRepository = {
  getBrand(signal?: AbortSignal): Promise<CompanyBrand>;
};
