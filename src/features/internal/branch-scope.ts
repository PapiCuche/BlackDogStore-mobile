import type { InternalBranch } from '@/domain/internal/inventory-types';

/**
 * The selected branch, carried in the URL.
 *
 * NOT in a React context and not in a store. The inventory screens navigate
 * between each other and each one asks the server for branch-scoped data; if
 * the selection lived in memory, a deep link into the Kardex would land on
 * "todas mis sucursales" while the header still said one shop's name.
 *
 * ⚠️  A branch id in a URL is a SELECTOR, never an authority. The server
 * validates it against `MembershipBranchAccess` on every request and answers
 * 404 for one that is not the caller's — which is why nothing here needs to
 * check anything, and why nothing here may pretend to.
 */
export function parseBranchParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** The name to show for a selection, from the server's own list. */
export function branchLabel(
  branchId: number | null,
  branches: readonly InternalBranch[],
): string {
  if (branchId === null) return 'Todas mis sucursales';
  return branches.find((branch) => branch.id === branchId)?.name ?? 'Sucursal';
}
