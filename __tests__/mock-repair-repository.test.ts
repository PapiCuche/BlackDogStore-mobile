import type { Repair } from '@/domain/repairs/types';
import { findActiveRepair, isStageComplete, repairStageIndex } from '@/domain/repairs/types';
import { MockRepairRepository } from '@/repositories/mock/mock-repair-repository';

function makeRepair(overrides: Partial<Repair> & Pick<Repair, 'id'>): Repair {
  return {
    code: `REP-${overrides.id}`,
    deviceName: 'iPhone 13',
    deviceKind: 'iPhone',
    status: 'in_repair',
    reportedIssue: 'Batería',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    quotedTotal: null,
    timeline: [],
    ...overrides,
  };
}

describe('MockRepairRepository', () => {
  it('returns repairs most-recently-updated first', async () => {
    const repository = new MockRepairRepository([
      makeRepair({ id: 'old', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 'new', updatedAt: '2026-08-20T10:00:00.000Z' }),
      makeRepair({ id: 'mid', updatedAt: '2026-08-10T10:00:00.000Z' }),
    ]);

    const result = await repository.listRepairs();

    expect(result.map((repair) => repair.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not mutate the data it was constructed with', async () => {
    const source = [
      makeRepair({ id: 'a', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 'b', updatedAt: '2026-08-20T10:00:00.000Z' }),
    ];
    const repository = new MockRepairRepository(source);

    await repository.listRepairs();

    // Sorting in place would silently reorder the shared fixture array and make
    // every later assertion depend on test execution order.
    expect(source.map((repair) => repair.id)).toEqual(['a', 'b']);
  });

  it('finds a repair by id', async () => {
    const repository = new MockRepairRepository([makeRepair({ id: 'r-1' })]);
    await expect(repository.getRepairById('r-1')).resolves.toMatchObject({ id: 'r-1' });
  });

  it('returns null rather than throwing for an unknown id', async () => {
    const repository = new MockRepairRepository([makeRepair({ id: 'r-1' })]);
    await expect(repository.getRepairById('nope')).resolves.toBeNull();
  });

  it('returns an empty list when there is nothing to show', async () => {
    await expect(new MockRepairRepository([]).listRepairs()).resolves.toEqual([]);
  });
});

describe('repair lifecycle rules', () => {
  it('orders the stages the workshop actually follows', () => {
    expect(repairStageIndex('received')).toBe(0);
    expect(repairStageIndex('in_repair')).toBeGreaterThan(repairStageIndex('diagnosis'));
    expect(repairStageIndex('delivered')).toBeGreaterThan(repairStageIndex('ready_for_pickup'));
  });

  it('places cancelled outside the linear sequence', () => {
    // Cancellation can happen from any stage; it is not a step the device
    // passes through, so it must not compare as "further along".
    expect(repairStageIndex('cancelled')).toBe(-1);
  });

  it('marks only stages strictly before the current one as complete', () => {
    expect(isStageComplete('diagnosis', 'in_repair')).toBe(true);
    expect(isStageComplete('in_repair', 'in_repair')).toBe(false);
    expect(isStageComplete('quality_check', 'in_repair')).toBe(false);
  });

  it('treats no stage as complete once a repair is cancelled', () => {
    expect(isStageComplete('diagnosis', 'cancelled')).toBe(false);
  });
});

describe('findActiveRepair', () => {
  it('ignores delivered and cancelled repairs', () => {
    const result = findActiveRepair([
      makeRepair({ id: 'done', status: 'delivered', updatedAt: '2026-08-25T10:00:00.000Z' }),
      makeRepair({ id: 'gone', status: 'cancelled', updatedAt: '2026-08-24T10:00:00.000Z' }),
      makeRepair({ id: 'live', status: 'in_repair', updatedAt: '2026-08-01T10:00:00.000Z' }),
    ]);

    // The delivered one is the most recent, but a finished repair must not sit
    // on the Home screen forever.
    expect(result?.id).toBe('live');
  });

  it('picks the most recently updated of several active repairs', () => {
    const result = findActiveRepair([
      makeRepair({ id: 'stale', status: 'diagnosis', updatedAt: '2026-08-01T10:00:00.000Z' }),
      makeRepair({ id: 'fresh', status: 'awaiting_approval', updatedAt: '2026-08-20T10:00:00.000Z' }),
    ]);

    expect(result?.id).toBe('fresh');
  });

  it('returns null when nothing is active', () => {
    expect(findActiveRepair([makeRepair({ id: 'done', status: 'delivered' })])).toBeNull();
    expect(findActiveRepair([])).toBeNull();
  });
});
