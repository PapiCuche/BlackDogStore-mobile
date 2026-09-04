import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  icons,
  Input,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  CAP_INVENTORY_ADJUST,
  CAP_INVENTORY_VIEW,
} from '@/domain/internal/inventory-types';
import { hasUxCapability } from '@/domain/internal/types';
import { transferStatusTone } from '@/features/internal/transfer-status';
import {
  useCreateTransfer,
  useInventorySummary,
  useTransfers,
} from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * Transfers between shops. IP1B.
 *
 * A TRANSFER IS A DOCUMENT WITH A LIFE, not a status field somebody sets. It is
 * opened as a draft, lines are put on it, it is dispatched — units come off the
 * origin shelf at that moment — and later received, when they go on the
 * destination's. Between those two the stock belongs to neither shop, and that
 * gap is the reason the document exists: a shop that has sent something is short
 * of it before the other one is long of it, and pretending the move is
 * instantaneous makes one of the two counts wrong for as long as the van is on
 * the road.
 *
 * THE APP DECIDES NONE OF IT. Every transition is a request to
 * `inventory_services`, the same functions the Web console calls, and an
 * illegal one is refused there. This screen shows what came back.
 *
 * WHICH TRANSFERS APPEAR IS THE SERVER'S ANSWER: anything touching a shop this
 * member reaches, either end. Somebody who runs the destination must see what
 * is coming even from a shop they never enter.
 */
export default function TransfersScreen() {
  const theme = useTheme();
  const { data: internal } = useInternalContext();
  const mayView = hasUxCapability(internal ?? null, CAP_INVENTORY_VIEW);
  const mayMove = hasUxCapability(internal ?? null, CAP_INVENTORY_ADJUST);

  const transfers = useTransfers({}, { enabled: mayView });
  // The branch list comes from the inventory summary, the SAME source the rest
  // of the module reads it from, rather than a second list this screen keeps.
  const summary = useInventorySummary(null, { enabled: mayView });
  const create = useCreateTransfer();

  const [opening, setOpening] = useState(false);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');

  const title = 'Transferencias';

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Sin acceso al inventario"
            message="Tu cuenta no tiene permiso para ver el stock de esta empresa."
          />
        </Screen>
      </>
    );
  }

  // The shops the SERVER says this member reaches. Never a cached list: access
  // can be withdrawn between two visits, and offering a branch that now 404s
  // looks like a broken app rather than a changed permission.
  const branches = summary.data?.availableBranches ?? [];

  function openDraft() {
    const from = Number(source);
    const to = Number(destination);
    if (!from || !to) return;
    create.mutate(
      { sourceBranch: from, destinationBranch: to, reason: reason.trim() },
      {
        onSuccess: (transfer) => {
          setOpening(false);
          setSource('');
          setDestination('');
          setReason('');
          router.push(`/internal/inventory/transfers/${transfer.id}`);
        },
      },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.lg }}>
          {/* Opening a draft is a WRITE — it is the first step of moving stock
              even though it moves none yet, and the server gates it on
              `inventory.adjust`. Drawing the button for anybody else would
              offer a control that 403s. */}
          {mayMove ? (
            <View>
              {opening ? (
                <Card variant="outlined">
                  <SectionHeader title="Nueva transferencia" />
                  <Text variant="caption" color="textTertiary">
                    Se abre un borrador. No mueve stock hasta que se despache.
                  </Text>
                  {branches.length > 0 ? (
                    <>
                      <Text variant="footnote" color="textSecondary">Origen</Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: theme.spacing.xs,
                        }}
                      >
                        {branches.map((b) => (
                          <Button
                            key={`s${b.id}`}
                            label={b.name}
                            variant={source === String(b.id) ? 'primary' : 'secondary'}
                            onPress={() => setSource(String(b.id))}
                            disabled={create.isPending}
                          />
                        ))}
                      </View>
                      <Text variant="footnote" color="textSecondary">Destino</Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: theme.spacing.xs,
                        }}
                      >
                        {branches.map((b) => (
                          <Button
                            key={`d${b.id}`}
                            label={b.name}
                            variant={destination === String(b.id) ? 'primary' : 'secondary'}
                            onPress={() => setDestination(String(b.id))}
                            disabled={create.isPending}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                  <Input
                    label="Motivo"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Reposición, préstamo entre tiendas…"
                  />
                  <Divider />
                  <Button
                    label="Abrir borrador"
                    onPress={openDraft}
                    disabled={!source || !destination || create.isPending}
                  />
                  <Button
                    label="Cancelar"
                    variant="secondary"
                    onPress={() => setOpening(false)}
                    disabled={create.isPending}
                  />
                  {create.isError ? (
                    <Text variant="footnote" color="danger">
                      {/* The server's words. It refuses a shop this member
                          cannot reach, and the same origin twice. */}
                      {(create.error as Error).message}
                    </Text>
                  ) : null}
                </Card>
              ) : (
                <Button
                  label="Nueva transferencia"
                  fullWidth
                  onPress={() => setOpening(true)}
                />
              )}
            </View>
          ) : null}

          {transfers.isPending ? (
            <LoadingState label="Cargando transferencias" skeletonCount={3} />
          ) : transfers.isError ? (
            <ErrorState
              error={transfers.error}
              onRetry={() => void transfers.refetch()}
            />
          ) : (transfers.data?.results.length ?? 0) === 0 ? (
            <EmptyState
              icon={icons.empty}
              title="Sin transferencias"
              message="No hay movimientos entre sucursales que te correspondan."
            />
          ) : (
            <View>
              <SectionHeader title={`${transfers.data!.count} documento(s)`} />
              {transfers.data!.results.map((t) => (
                <Card
                  key={t.id}
                  variant="outlined"
                  onPress={() => router.push(`/internal/inventory/transfers/${t.id}`)}
                  accessibilityLabel={`Transferencia ${t.id}, de ${t.sourceBranchName} a ${t.destinationBranchName}, ${t.statusLabel}, ${t.totalUnits} unidades`}
                  accessibilityHint="Abre el documento de transferencia"
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="subhead">
                        {t.sourceBranchName} → {t.destinationBranchName}
                      </Text>
                      <Text variant="caption" color="textTertiary">
                        #{t.id} · {t.totalUnits} unidad(es)
                        {t.reason ? ` · ${t.reason}` : ''}
                      </Text>
                    </View>
                    {/* The server's own word for the state, painted. */}
                    <StatusBadge
                      label={t.statusLabel}
                      tone={transferStatusTone(t.status)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      </Screen>
    </>
  );
}
