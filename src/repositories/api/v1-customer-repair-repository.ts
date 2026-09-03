import {
  fetchCustomerRepair,
  fetchCustomerPaymentSummary,
  fetchCustomerRepairQuote,
  fetchCustomerRepairs,
  postQuoteDecision,
  RepairNotAvailableError,
} from '@/api/endpoints/customer-repairs-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { CustomerPaymentSummary } from '@/domain/internal/service-types';
import type { QuoteDecision, RepairQuote } from '@/domain/repairs/quote';
import type { Repair } from '@/domain/repairs/types';
import type { RepairRepository } from '@/repositories/types';

/**
 * A customer's repairs, over `/api/v1/customer/<slug>/repairs/`.
 *
 * The M8 sibling of `V1CustomerOrderRepository`, and separate from anything
 * internal for the same reason that one is: "my repairs" and "this company's
 * repairs" are different questions, and one class that switched between them
 * would be one refactor away from answering the wrong one.
 *
 * `getRepairById` returns null for a repair that is not this person's, because
 * the interface says a missing repair is null rather than an exception — the
 * detail screen renders "no encontrada" from it. The server's 404 is
 * deliberately indistinguishable from "does not exist", and this preserves that.
 */
export class V1CustomerRepairRepository implements RepairRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listRepairs(signal?: AbortSignal): Promise<Repair[]> {
    return fetchCustomerRepairs(this.deps, signal);
  }

  async getRepairById(id: number, signal?: AbortSignal): Promise<Repair | null> {
    try {
      return await fetchCustomerRepair(id, this.deps, signal);
    } catch (error) {
      if (error instanceof RepairNotAvailableError) return null;
      throw error;
    }
  }

  async getRepairQuote(
    repairId: number,
    signal?: AbortSignal,
  ): Promise<RepairQuote | null> {
    return fetchCustomerRepairQuote(repairId, this.deps, signal);
  }

  /**
   * The balance on one of my repairs.
   *
   * Deliberately NOT called `getInvoice` or `getReceipt`. Neither exists: this
   * platform issues no fiscal document for a repair, and a name that implied
   * one would be a promise the product has not made.
   */
  async getPaymentSummary(
    repairId: number,
    signal?: AbortSignal,
  ): Promise<CustomerPaymentSummary> {
    return fetchCustomerPaymentSummary(repairId, this.deps, signal);
  }

  /**
   * Answer the quote.
   *
   * Deliberately NOT called `approveQuote`. One method for both answers keeps
   * the decision a single, symmetric act — and a name that mentioned only
   * approval would invite a second, subtly different path for rejection.
   */
  async decideQuote(
    input: { repairId: number; quoteId: number; decision: QuoteDecision; reason?: string },
    signal?: AbortSignal,
  ): Promise<RepairQuote> {
    return postQuoteDecision(input, this.deps, signal);
  }
}
