import type { Repair } from '@/domain/repairs/types';
import {
  findActiveRepair,
  isRepairOpen,
  isStageComplete,
  repairStageIndex,
  toRepairStatus,
} from '@/domain/repairs/types';
import { MockRepairRepository } from '@/repositories/mock/mock-repair-repository';

/**
 * The mock repository survives M8, exactly as `MockOrderRepository` survived
 * M4: it is what makes the app runnable straight after a clone with no server.
 * What changed is the SHAPE it produces — the real contract's, not the
 * proposal's.
 */
function makeRepair(overrides: Partial<Repair> & Pick<Repair, 'id'>): Repair {
  return {
    number: `SRV-${String(overrides.id).padStart(6, '0')}`,
    deviceSummary: 'Genérica X100',
    status: 'diagnosing',
    statusLabel: 'En diagnóstico',
    reportedIssue: 'Batería',
    receivedAt: '2026-08-01T10:00:00.000Z',
    closedAt: null,
    updatedAt: '2026-08-01T10:00:00.000Z',
    timeline: [],
    ...overrides,
  };
}

describe('MockRepairRepository', () => {
  it('returns repairs most-recently-updated first', async () => {
    const repository = new MockRepairRepository([
      makeRepair({ id: 1, updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 2, updatedAt: '2026-08-20T10:00:00.000Z' }),
      makeRepair({ id: 3, updatedAt: '2026-08-10T10:00:00.000Z' }),
    ]);

    const result = await repository.listRepairs();

    expect(result.map((repair) => repair.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate the data it was constructed with', async () => {
    const source = [
      makeRepair({ id: 1, updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 2, updatedAt: '2026-08-20T10:00:00.000Z' }),
    ];
    const repository = new MockRepairRepository(source);

    await repository.listRepairs();

    // Sorting in place would silently reorder the shared fixture array and make
    // every later assertion depend on test execution order.
    expect(source.map((repair) => repair.id)).toEqual([1, 2]);
  });

  it('finds a repair by its numeric id', async () => {
    const repository = new MockRepairRepository([makeRepair({ id: 42 })]);
    await expect(repository.getRepairById(42)).resolves.toMatchObject({ id: 42 });
  });

  it('returns null rather than throwing for an unknown id', async () => {
    const repository = new MockRepairRepository([makeRepair({ id: 42 })]);
    await expect(repository.getRepairById(99)).resolves.toBeNull();
  });

  it('returns an empty list when there is nothing to show', async () => {
    await expect(new MockRepairRepository([]).listRepairs()).resolves.toEqual([]);
  });
});

describe('the lifecycle is the one the server actually has', () => {
  it('carries only the states M8 can support', () => {
    // Was seven stages, as a proposal. Every one of them now exists BECAUSE a
    // phase built the module that gives it meaning — M12 was the last, and
    // `delivered` is the end of the ladder. `warranty` still is not here.
    expect(repairStageIndex('received')).toBe(0);
    expect(repairStageIndex('waiting_approval')).toBeGreaterThan(
      repairStageIndex('diagnosing'),
    );
  });

  it('places cancelled outside the linear sequence', () => {
    // Cancellation can happen from anywhere; it is not a step the device passes
    // through, so it must not compare as "further along".
    expect(repairStageIndex('cancelled')).toBe(-1);
  });

  it('marks only stages strictly before the current one as complete', () => {
    expect(isStageComplete('received', 'diagnosing')).toBe(true);
    expect(isStageComplete('diagnosing', 'diagnosing')).toBe(false);
    expect(isStageComplete('waiting_approval', 'diagnosing')).toBe(false);
  });

  it('treats no stage as complete once a repair is cancelled', () => {
    expect(isStageComplete('received', 'cancelled')).toBe(false);
  });

  it('never renders an unknown wire status as a later state', () => {
    // Telling somebody their device is further along than the server said is
    // the one direction of error that costs a wasted trip to the shop — and
    // M9 proved that COERCING the unknown code causes exactly that, in the
    // other direction. M10 keeps the code and denies it a position instead.
    expect(toRepairStatus('teletransportado')).toBe('teletransportado');
    expect(repairStageIndex('teletransportado')).toBe(-1);
    expect(toRepairStatus('warranty')).toBe('warranty');
    expect(repairStageIndex('warranty')).toBe(-1);
    expect(toRepairStatus('waiting_approval')).toBe('waiting_approval');
    // Only an ABSENT status falls back: nothing arrived, and a repair starts
    // somewhere.
    expect(toRepairStatus(undefined)).toBe('received');
  });
});

describe('findActiveRepair', () => {
  it('ignores repairs the shop has finished with', () => {
    const result = findActiveRepair([
      makeRepair({ id: 1, status: 'cancelled', updatedAt: '2026-08-25T10:00:00.000Z' }),
      makeRepair({ id: 2, status: 'diagnosing', updatedAt: '2026-08-01T10:00:00.000Z' }),
    ]);

    // The cancelled one is the most recent, but a finished repair must not sit
    // on the Home screen forever.
    expect(result?.id).toBe(2);
  });

  it('picks the most recently updated of several active repairs', () => {
    const result = findActiveRepair([
      makeRepair({ id: 1, status: 'diagnosing', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 2, status: 'waiting_approval', updatedAt: '2026-08-20T10:00:00.000Z' }),
    ]);

    expect(result?.id).toBe(2);
  });

  it('returns null when nothing is active', () => {
    expect(findActiveRepair([makeRepair({ id: 1, status: 'cancelled' })])).toBeNull();
    expect(findActiveRepair([])).toBeNull();
  });

  it('treats every state before the handover as open', () => {
    // M12 SPENT THE PROMISE THIS TEST MADE. `isRepairOpen` is the one place
    // that learned about delivery — not every screen — and `ready_for_pickup`
    // is deliberately still open: the device is ready and still in the shop.
    for (const status of [
      'received', 'diagnosing', 'waiting_approval', 'ready_for_pickup',
    ] as const) {
      expect(isRepairOpen(makeRepair({ id: 1, status }))).toBe(true);
    }
    for (const status of ['cancelled', 'delivered'] as const) {
      expect(isRepairOpen(makeRepair({ id: 1, status }))).toBe(false);
    }
    // And an UNKNOWN code stays open: never heard of is not evidence of
    // finished, and guessing "closed" would hide a live repair.
    expect(isRepairOpen(makeRepair({ id: 1, status: 'warranty' }))).toBe(true);
  });
});
