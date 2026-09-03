import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

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
  SearchInput,
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
  useCancelTransfer,
  useDispatchTransfer,
  useInventoryStock,
  useReceiveTransfer,
  useSetTransferItem,
  useTransfer,
} from '@/hooks/use-internal-inventory';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * One transfer: its lines, and the two moments stock actually moves. IP1B.
 *
 * THERE IS NO TRANSITION TABLE IN THIS FILE, and its absence is deliberate.
 * The app never computes what state comes next, never decides whether a move is
 * legal and never sets a status: it asks the server to DISPATCH, to RECEIVE or
 * to CANCEL, and `inventory_services` — the one place that can enforce it —
 * either does it or refuses. What the comparisons below do is choose which
 * button to draw for the state the server just reported, exactly as the Web
 * console does; a refusal still arrives from the server and is still shown.
 *
 * Editing lines is offered only on a draft. After dispatch the document
 * describes units that have physically left a shelf, and rewriting it then
 * would make the paperwork disagree with the van.
 *
 * CANCELLING IS NOT A REVERSAL. A transfer in transit cannot be undone with a
 * status change — the domain refuses it — because the units are somewhere. The
 * way back is to receive it and move it again, which leaves both movements in
 * the Kardex where an auditor can see them.
 */
export default function TransferDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const transferId = Number(params.id ?? 0) || null;

  const { data: internal } = useInternalContext();
  const mayView = hasUxCapability(internal ?? null, CAP_INVENTORY_VIEW);
  const mayMove = hasUxCapability(internal ?? null, CAP_INVENTORY_ADJUST);

  const query = useTransfer(transferId, { enabled: mayView });
  const setItem = useSetTransferItem();
  const dispatch = useDispatchTransfer();
  const receive = useReceiveTransfer();
  const cancel = useCancelTransfer();

  const [term, setTerm] = useState('');
  // Keyed by SLUG, which is how this surface names an article: the stock list
  // returns `product_slug` and no id.
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const transfer = query.data ?? null;
  const busy =
    setItem.isPending || dispatch.isPending || receive.isPending || cancel.isPending;

  // The origin's shelf, so somebody adding lines can see what is there to send.
  // Per branch, because a national figure would tell them they can send
  // something that is three cities away.
  const stock = useInventoryStock(
    { branchId: transfer?.sourceBranch, search: term.trim() || undefined },
    { enabled: mayView && mayMove && transfer?.status === 'draft' },
  );

  const title = 'Transferencia';

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

  if (query.isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando la transferencia" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  // A transfer between two shops this member cannot reach answers 404, the same
  // as one belonging to another company. That is the server refusing to confirm
  // it exists, and this screen must not soften it into "no tienes permiso".
  if (query.isError || transfer === null) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  // Presentation only: which controls suit the state the server just reported.
  // Not a definition of what may follow it.
  const isDraft = transfer.status === 'draft';
  const isInTransit = transfer.status === 'in_transit';

  function act(
    run: { mutate: (id: number, opts?: object) => void },
    question: string,
    warning: string,
  ) {
    if (transferId === null) return;
    Alert.alert(question, warning, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () =>
          run.mutate(transferId, {
            onError: (error: Error) => Alert.alert('No se pudo', error.message),
          }),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: `Transferencia #${transfer.id}` }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.lg }}>
          <Card variant="outlined">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
              }}
            >
              <Text variant="headline" style={{ flex: 1 }}>
                {transfer.sourceBranchName} → {transfer.destinationBranchName}
              </Text>
              <StatusBadge
                label={transfer.statusLabel}
                tone={transferStatusTone(transfer.status)}
              />
            </View>
            {transfer.reason ? (
              <Text variant="subhead" color="textSecondary">{transfer.reason}</Text>
            ) : null}
            {transfer.reference ? (
              <Text variant="caption" color="textTertiary">
                Referencia {transfer.reference}
              </Text>
            ) : null}
            <Divider />
            {/* The two moments the shelf actually moved, as the server stamped
                them. Absent while they have not happened. */}
            <Text variant="caption" color="textTertiary">
              Despachada: {transfer.dispatchedAt ?? '—'}
            </Text>
            <Text variant="caption" color="textTertiary">
              Recibida: {transfer.receivedAt ?? '—'}
            </Text>
            {transfer.cancelledAt ? (
              <Text variant="caption" color="textTertiary">
                Anulada: {transfer.cancelledAt}
              </Text>
            ) : null}
          </Card>

          {isInTransit ? (
            <Card variant="outlined">
              <StatusBadge label="En tránsito" tone="progress" />
              <Text variant="caption" color="textTertiary">
                Estas unidades ya salieron de {transfer.sourceBranchName} y todavía
                no están en {transfer.destinationBranchName}. No las cuenta ninguna
                de las dos sucursales hasta que se reciban.
              </Text>
            </Card>
          ) : null}

          <View>
            <SectionHeader title={`Líneas · ${transfer.totalUnits} unidad(es)`} />
            {transfer.items.length === 0 ? (
              <EmptyState
                icon={icons.empty}
                title="Sin líneas"
                message="Agrega productos antes de despachar."
              />
            ) : (
              <Card variant="outlined">
                {transfer.items.map((item) => (
                  <View key={item.id} style={{ gap: theme.spacing.xs }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <Text variant="subhead" style={{ flex: 1 }}>
                        {item.productName}
                      </Text>
                      <Text variant="headline">{item.quantity}</Text>
                    </View>
                    {/* Removing a line is setting it to zero — the same request,
                        because "how many go" and "these do not go" are one
                        question asked twice. Only while it is a draft. */}
                    {isDraft && mayMove ? (
                      <Button
                        label="Quitar"
                        variant="secondary"
                        onPress={() =>
                          setItem.mutate({
                            transferId: transfer.id,
                            productSlug: item.productSlug,
                            quantity: 0,
                          })
                        }
                        disabled={busy}
                      />
                    ) : null}
                    <Divider />
                  </View>
                ))}
              </Card>
            )}
          </View>

          {isDraft && mayMove ? (
            <View>
              <SectionHeader title="Agregar producto" />
              <SearchInput
                value={term}
                onChangeText={setTerm}
                placeholder="Buscar en el origen"
              />
              {stock.isFetching ? (
                <Text variant="footnote" color="textTertiary">Buscando…</Text>
              ) : null}
              {(stock.data?.results ?? []).slice(0, 10).map((row) => (
                <Card key={row.productSlug} variant="outlined">
                  <Text variant="subhead">{row.productName}</Text>
                  <Text variant="caption" color="textTertiary">
                    {/* The origin's count, from the server. Per branch: a
                        national figure would offer to send something that is
                        three cities away. */}
                    {row.quantity} en {transfer.sourceBranchName}
                  </Text>
                  <Input
                    label="Cantidad a enviar"
                    value={quantities[row.productSlug] ?? ''}
                    onChangeText={(value) =>
                      setQuantities((current) => ({ ...current, [row.productSlug]: value }))
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Button
                    label="Poner en la transferencia"
                    onPress={() => {
                      // Parsing a COUNT of articles, not money. Units are whole
                      // things; the server re-validates and refuses a negative.
                      const quantity = Number(quantities[row.productSlug] ?? '');
                      if (!Number.isInteger(quantity) || quantity <= 0) return;
                      setItem.mutate(
                        {
                          transferId: transfer.id,
                          productSlug: row.productSlug,
                          quantity,
                        },
                        {
                          onSuccess: () =>
                            setQuantities((current) => ({
                              ...current,
                              [row.productSlug]: '',
                            })),
                          onError: (error) =>
                            Alert.alert('No se pudo agregar', error.message),
                        },
                      );
                    }}
                    disabled={busy}
                  />
                </Card>
              ))}
            </View>
          ) : null}

          {/* The transitions. One button per ACT, never a status picker: a
              single "cambiar estado" control would let this app assert that
              something was received when nothing ever left. */}
          {mayMove && (isDraft || isInTransit) ? (
            <View>
              <SectionHeader title="Acciones" />
              <Card variant="outlined">
                {isDraft ? (
                  <>
                    <Button
                      label="Despachar"
                      fullWidth
                      onPress={() =>
                        act(
                          dispatch,
                          'Despachar',
                          `Las unidades salen de ${transfer.sourceBranchName} ahora `
                          + 'y quedan en tránsito hasta que el destino las reciba.',
                        )
                      }
                      disabled={busy || transfer.items.length === 0}
                    />
                    <Button
                      label="Anular"
                      variant="secondary"
                      fullWidth
                      onPress={() =>
                        act(
                          cancel,
                          'Anular la transferencia',
                          'El documento se cierra sin mover stock.',
                        )
                      }
                      disabled={busy}
                    />
                  </>
                ) : null}
                {isInTransit ? (
                  <Button
                    label="Recibir"
                    fullWidth
                    onPress={() =>
                      act(
                        receive,
                        'Recibir',
                        `Las unidades entran a ${transfer.destinationBranchName} ahora.`,
                      )
                    }
                    disabled={busy}
                  />
                ) : null}
                {/* Whatever the server said, verbatim: not enough stock at the
                    origin, no access to one of the two shops, a state that does
                    not allow this. */}
                {dispatch.isError || receive.isError || cancel.isError ? (
                  <Text variant="footnote" color="danger">
                    {((dispatch.error ?? receive.error ?? cancel.error) as Error).message}
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}

          {/* Honest rather than silent. Somebody who reaches only one of the two
              shops CAN see this document — that is the point of the read rule —
              and the server will refuse the move. Saying so beats a button that
              403s or, worse, a screen that hides the transfer entirely. */}
          {!mayMove ? (
            <Card variant="outlined">
              <StatusBadge label="Solo lectura" tone="info" />
              <Text variant="caption" color="textTertiary">
                Puedes ver esta transferencia, pero no operarla. Mover stock
                requiere el permiso de ajuste de inventario y acceso a las dos
                sucursales.
              </Text>
            </Card>
          ) : null}
        </View>
      </Screen>
    </>
  );
}
