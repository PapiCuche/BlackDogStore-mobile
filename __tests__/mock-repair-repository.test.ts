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
    // Was seven stages, as a proposal. `in_repair`, `quality_check`,
    // `ready_for_pickup` and `delivered` each need a module the backend did not
    // build, and a state no server code can act on is a state that lies.
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

  it('never guesses an unknown wire status into a later state', () => {
    // Telling somebody their device is further along than the server said is
    // the one direction of error that costs a wasted trip to the shop.
    expect(toRepairStatus('teletransportado')).toBe('received');
    expect(toRepairStatus(undefined)).toBe('received');
    expect(toRepairStatus('delivered')).toBe('received');
    expect(toRepairStatus('waiting_approval')).toBe('waiting_approval');
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

  it('treats every state M8 can reach except cancelled as open', () => {
    // Delivery does not exist yet. When it does, `isRepairOpen` is the one
    // place that learns about it — not every screen.
    for (const status of ['received', 'diagnosing', 'waiting_approval'] as const) {
      expect(isRepairOpen(makeRepair({ id: 1, status }))).toBe(true);
    }
    expect(isRepairOpen(makeRepair({ id: 1, status: 'cancelled' }))).toBe(false);
  });
});
