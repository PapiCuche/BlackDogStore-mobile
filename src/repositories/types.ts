import type { CompanyBrand } from '@/domain/company/types';
import type { Order } from '@/domain/orders/types';
import type { Category, Product } from '@/domain/products/types';
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
  getRepairById(id: string, signal?: AbortSignal): Promise<Repair | null>;
};

export type OrderRepository = {
  listOrders(signal?: AbortSignal): Promise<Order[]>;
  getOrderById(id: number, signal?: AbortSignal): Promise<Order | null>;
};

export type CompanyRepository = {
  getBrand(signal?: AbortSignal): Promise<CompanyBrand>;
};
