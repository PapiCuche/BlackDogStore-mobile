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
