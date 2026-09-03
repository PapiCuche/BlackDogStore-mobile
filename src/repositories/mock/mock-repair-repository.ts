import type { CustomerPaymentSummary } from '@/domain/internal/service-types';
import type { QuoteDecision, RepairQuote } from '@/domain/repairs/quote';
import type { Repair } from '@/domain/repairs/types';
import type { RepairRepository } from '@/repositories/types';

import { mockRepairQuotes, mockRepairs } from './fixtures';
import { simulateLatency } from './latency';

/**
 * Repairs backed by bundled fixtures.
 *
 * NO LONGER THE ONLY IMPLEMENTATION. M8 shipped
 * `/api/v1/customer/<slug>/repairs/` and `V1CustomerRepairRepository` speaks to
 * it; this one survives for development without a server, exactly as
 * `MockOrderRepository` did after M4.
 *
 * Constructor-injected with its data so tests can drive it with a known set
 * instead of asserting against whatever the fixtures happen to contain.
 */
export class MockRepairRepository implements RepairRepository {
  private readonly repairs: readonly Repair[];
  private readonly quotes: Map<number, RepairQuote>;

  constructor(
    repairs: readonly Repair[] = mockRepairs,
    quotes: readonly [number, RepairQuote][] = mockRepairQuotes,
  ) {
    this.repairs = repairs;
    this.quotes = new Map(quotes);
  }

  async listRepairs(signal?: AbortSignal): Promise<Repair[]> {
    await simulateLatency(signal);
    // Most recently updated first — a customer opening this screen is checking
    // on the device that just moved, not the one from last month.
    return [...this.repairs].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }

  async getRepairById(id: number, signal?: AbortSignal): Promise<Repair | null> {
    await simulateLatency(signal);
    return this.repairs.find((repair) => repair.id === id) ?? null;
  }

  /**
   * The quote on a fixture repair, or null.
   *
   * Held beside the repairs rather than inside them, mirroring the real
   * contract: the server sends a quote from its own endpoint and never as a
   * field on the repair.
   */
  async getRepairQuote(
    repairId: number,
    signal?: AbortSignal,
  ): Promise<RepairQuote | null> {
    await simulateLatency(signal);
    return this.quotes.get(repairId) ?? null;
  }

  /**
   * M12B. The mock reports NO AGREED PRICE, not a zero balance.
   *
   * A fixture that invented "S/ 0.00 pendiente" would tell somebody running the
   * app without a server that their repair is paid for. Null is the honest
   * shape and it is a real server answer, so the screen that renders it is the
   * same one production uses.
   */
  async getPaymentSummary(
    repairId: number,
    signal?: AbortSignal,
  ): Promise<CustomerPaymentSummary> {
    await simulateLatency(signal);
    const quote = this.quotes.get(repairId) ?? null;
    return {
      currency: quote?.currency ?? 'PEN',
      quotedTotal: quote ? quote.total : null,
      paid: '0.00',
      outstanding: quote ? quote.total : null,
      status: quote ? 'unpaid' : 'no_quote',
    };
  }

  /**
   * Answer a fixture quote.
   *
   * IDEMPOTENT FOR THE SAME ANSWER and conflicting for the opposite one, the
   * same as the server — a mock that let a decision be changed would teach the
   * screens a behaviour production refuses.
   */
  async decideQuote(
    input: { repairId: number; quoteId: number; decision: QuoteDecision; reason?: string },
    signal?: AbortSignal,
  ): Promise<RepairQuote> {
    await simulateLatency(signal);
    const quote = this.quotes.get(input.repairId);
    if (!quote || quote.id !== input.quoteId) {
      throw new Error('No encontramos esa cotización.');
    }
    if (quote.decision && quote.decision.decision !== input.decision) {
      throw new Error('Esta cotización ya tiene una respuesta registrada.');
    }
    if (quote.decision) return quote;

    const decided: RepairQuote = {
      ...quote,
      status: input.decision === 'approve' ? 'approved' : 'rejected',
      canBeDecided: false,
      decision: { decision: input.decision, decidedAt: new Date().toISOString() },
    };
    this.quotes.set(input.repairId, decided);
    return decided;
  }
}
