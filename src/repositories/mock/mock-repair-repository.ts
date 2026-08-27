import type { Repair } from '@/domain/repairs/types';
import type { RepairRepository } from '@/repositories/types';

import { mockRepairs } from './fixtures';
import { simulateLatency } from './latency';

/**
 * Repairs backed by bundled fixtures.
 *
 * This is the ONLY repair implementation that exists, and it will stay that way
 * until BR-005 is accepted — Django has no repair model at all. The class is
 * constructor-injected with its data so tests can drive it with a known set
 * instead of asserting against whatever the fixtures happen to contain.
 */
export class MockRepairRepository implements RepairRepository {
  private readonly repairs: readonly Repair[];

  constructor(repairs: readonly Repair[] = mockRepairs) {
    this.repairs = repairs;
  }

  async listRepairs(signal?: AbortSignal): Promise<Repair[]> {
    await simulateLatency(signal);
    // Most recently updated first — a customer opening this screen is checking
    // on the device that just moved, not the one from last month.
    return [...this.repairs].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }

  async getRepairById(id: string, signal?: AbortSignal): Promise<Repair | null> {
    await simulateLatency(signal);
    return this.repairs.find((repair) => repair.id === id) ?? null;
  }
}
