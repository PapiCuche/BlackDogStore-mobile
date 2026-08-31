import type { StatusTone } from '@/domain/orders/status';

import type { RepairStage, RepairStatus } from './types';

type StatusMeta = { label: string; tone: StatusTone };

/**
 * Spanish labels for the proposed repair lifecycle.
 *
 * These are MOBILE's wording (BR-005), not Django's — unlike the order statuses,
 * there is no backend `TextChoices` to copy. If the backend team names the
 * stages differently, this map is the one place to change.
 */
export const repairStatusMeta: Record<RepairStatus, StatusMeta> = {
  received: { label: 'Equipo recibido', tone: 'neutral' },
  diagnosis: { label: 'Diagnóstico', tone: 'info' },
  awaiting_approval: { label: 'Esperando aprobación', tone: 'warning' },
  in_repair: { label: 'En reparación', tone: 'progress' },
  quality_check: { label: 'Control de calidad', tone: 'progress' },
  ready_for_pickup: { label: 'Listo para recoger', tone: 'success' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

export function describeRepairStatus(status: RepairStatus): StatusMeta {
  return repairStatusMeta[status];
}

export function repairStageLabel(stage: RepairStage): string {
  return repairStatusMeta[stage].label;
}
