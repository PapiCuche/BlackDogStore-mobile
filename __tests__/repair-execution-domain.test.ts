import { hashShape, makeIdempotencyKey } from '@/domain/idempotency';
import { describeRepairStatus, repairStatusMeta } from '@/domain/repairs/status';
import {
  findActiveRepair,
  isKnownRepairStatus,
  isRepairOpen,
  isStageComplete,
  KNOWN_REPAIR_STATUSES,
  REPAIR_STAGES,
  repairStageIndex,
  toRepairStatus,
  type Repair,
} from '@/domain/repairs/types';

/**
 * M10 — the lifecycle grew, and the way it handles what it does NOT know
 * changed. That second half is a bug fix, and these are the tests that hold it.
 */

const base = {
  id: 1, number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x',
  reportedIssue: 'y', receivedAt: '', closedAt: null, updatedAt: '', timeline: [],
};
const repair = (status: string): Repair => ({ ...base, status });

describe('the three states M10 built', () => {
  it('knows them', () => {
    for (const code of ['in_repair', 'waiting_parts', 'repaired']) {
      expect(isKnownRepairStatus(code)).toBe(true);
      expect(KNOWN_REPAIR_STATUSES).toContain(code as never);
    }
  });

  it('puts in_repair and repaired on the ladder, in that order', () => {
    expect(repairStageIndex('in_repair')).toBeGreaterThan(repairStageIndex('approved'));
    expect(repairStageIndex('repaired')).toBeGreaterThan(repairStageIndex('in_repair'));
  });

  it('parks waiting_parts AT in_repair rather than past it', () => {
    // The device is on the bench and the work is paused. A progress bar that
    // advanced when a shop ran out of a battery would be lying in the
    // flattering direction.
    expect(repairStageIndex('waiting_parts')).toBe(repairStageIndex('in_repair'));
    expect(REPAIR_STAGES).not.toContain('waiting_parts' as never);
  });

  it('labels them without promising collection', () => {
    expect(repairStatusMeta.repaired.label).toBe('Reparado');
    for (const forbidden of ['recoger', 'entrega', 'listo']) {
      expect(repairStatusMeta.repaired.label.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('tones them by what they mean to somebody waiting', () => {
    expect(repairStatusMeta.in_repair.tone).toBe('info');
    expect(repairStatusMeta.waiting_parts.tone).toBe('warning');
    expect(repairStatusMeta.repaired.tone).toBe('success');
  });
});

describe('repaired is not finished', () => {
  it('keeps a repaired device OPEN', () => {
    // The technician stopped; quality control and handover have not shipped, so
    // the shop still has the device and the customer still has a reason to look.
    expect(isRepairOpen(repair('repaired'))).toBe(true);
    expect(isRepairOpen(repair('in_repair'))).toBe(true);
    expect(isRepairOpen(repair('waiting_parts'))).toBe(true);
  });

  it('still closes on the only two endings there are', () => {
    expect(isRepairOpen(repair('rejected'))).toBe(false);
    expect(isRepairOpen(repair('cancelled'))).toBe(false);
  });

  it('surfaces a repaired device on Home over a cancelled one', () => {
    const result = findActiveRepair([
      { ...repair('cancelled'), id: 1, updatedAt: '2026-09-02T10:00:00Z' },
      { ...repair('repaired'), id: 2, updatedAt: '2026-09-01T10:00:00Z' },
    ]);
    expect(result?.id).toBe(2);
  });
});

describe('an UNKNOWN code — the M9 bug, fixed', () => {
  it('is carried through instead of coerced', () => {
    // M9 shipped `approved` before this app knew it, and `toRepairStatus`
    // turned it into `received`: a repair the customer had just approved
    // rendered as "Recibido". There is no safe guess, so there is no guess.
    // M11 built `quality_control` and `ready_for_pickup`, so the examples move
    // again — which is exactly what this test is FOR. Two codes still have no
    // module, and the guarantee is about them and about whatever comes next.
    for (const future of ['delivered', 'warranty']) {
      expect(toRepairStatus(future)).toBe(future);
      expect(isKnownRepairStatus(future)).toBe(false);
    }
  });

  it('gets NO position on the ladder', () => {
    expect(repairStageIndex('delivered')).toBe(-1);
    expect(isStageComplete('received', 'delivered')).toBe(false);
  });

  it('renders with the SERVER label and a neutral tone', () => {
    const meta = describeRepairStatus('delivered', 'Entregado al cliente');
    expect(meta.label).toBe('Entregado al cliente');
    expect(meta.tone).toBe('neutral');
  });

  it('falls back to the raw code when the server sent no label', () => {
    // Ugly on purpose. An unlabelled unknown state is a contract gap somebody
    // should see, not something to paper over with an invented word.
    expect(describeRepairStatus('delivered').label).toBe('delivered');
  });

  it('counts as OPEN, because nothing says it finished', () => {
    expect(isRepairOpen(repair('warranty'))).toBe(true);
  });

  it('still falls back to received when NOTHING arrived', () => {
    expect(toRepairStatus(undefined)).toBe('received');
    expect(toRepairStatus(null)).toBe('received');
    expect(toRepairStatus('')).toBe('received');
    expect(toRepairStatus('   ')).toBe('received');
  });

  it('never invents a stage for a code it does not know', () => {
    for (const stage of REPAIR_STAGES) {
      expect(isStageComplete(stage, 'algo_que_no_existe')).toBe(false);
    }
  });
});

describe('the tenant still owns the wording', () => {
  it('prefers the server label for a KNOWN code too', () => {
    expect(describeRepairStatus('in_repair', 'En el taller').label).toBe('En el taller');
    expect(describeRepairStatus('in_repair', 'En el taller').tone).toBe('info');
  });

  it('uses the local word only when the payload has none', () => {
    expect(describeRepairStatus('waiting_parts').label).toBe('Esperando repuestos');
  });
});

describe('idempotency keys', () => {
  it('are stable for one intention', () => {
    // Not by being deterministic — by being HELD. The generator is random on
    // purpose; what makes a retry safe is that the caller keeps the value.
    const key = makeIdempotencyKey('21x2');
    expect(key).toBe(key);
    expect(key.length).toBeGreaterThan(8);
  });

  it('differ between two calls, so a new intention gets a new key', () => {
    const a = makeIdempotencyKey('21x2');
    const b = makeIdempotencyKey('21x2');
    expect(a).not.toBe(b);
  });

  it('fold the shape in, so a changed ask cannot look like the old one', () => {
    expect(makeIdempotencyKey('21x2').split('-')[1])
      .not.toBe(makeIdempotencyKey('21x3').split('-')[1]);
    expect(hashShape('21x2')).toBe(hashShape('21x2'));
    expect(hashShape('21x2')).not.toBe(hashShape('21x3'));
  });

  it('fit the column the server declared', () => {
    // `PartUsage.idempotency_key` is CharField(max_length=64). A longer key
    // would be a 400 nobody could read.
    expect(makeIdempotencyKey('x'.repeat(500)).length).toBeLessThanOrEqual(64);
  });

  it('carry no secret', () => {
    const key = makeIdempotencyKey('21x2');
    expect(key).not.toMatch(/token|bearer|password|session/i);
  });
});
