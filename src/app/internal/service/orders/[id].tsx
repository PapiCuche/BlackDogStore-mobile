import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import {
  ServicePaymentRequiredError,
  serviceErrorMessage,
} from '@/api/endpoints/internal-service-v1';
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
  CAP_SERVICE_DELIVERY_MANAGE,
  CAP_SERVICE_PAYMENTS_MANAGE,
  CAP_SERVICE_DIAGNOSTIC_MANAGE,
  CAP_SERVICE_QUALITY_MANAGE,
  CAP_SERVICE_REPAIR_MANAGE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
} from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import { ServiceDeliverySection } from '@/features/internal/service-delivery-section';
import { ServicePaymentSection } from '@/features/internal/service-payment-section';
import { ServiceDiagnosticSection } from '@/features/internal/service-diagnostic-section';
import { ServiceExecutionSection } from '@/features/internal/service-execution-section';
import { ServicePartsSection } from '@/features/internal/service-parts-section';
import { ServiceQualitySection } from '@/features/internal/service-quality-section';
import { ServiceQuoteSection } from '@/features/internal/service-quote-section';
import {
  useAddQuoteItem,
  useAssignTechnician,
  useCancelQuote,
  useCreateDiagnostic,
  useCreateQuote,
  usePublishQuote,
  useRemoveQuoteItem,
  useServiceAssignmentOptions,
  useServiceDiagnostics,
  useServiceOrder,
  useServiceExecution,
  useServicePartCandidates,
  useServicePartUsages,
  useServiceQuotes,
  useServiceQualityCheck,
  useServiceQualityHistory,
  useStartQualityCheck,
  useRecordQualityResult,
  usePassQualityCheck,
  useFailQualityCheck,
  useServiceDelivery,
  useRecordDelivery,
  useServicePayments,
  useRecordServicePayment,
  useReverseServicePayment,
  useStartRepair,
  useUpdateExecution,
  useCompleteRepair,
  usePauseForParts,
  useResumeRepair,
  useRecordPartUsage,
  useReversePartUsage,
  useServiceTransition,
  useUpdateDiagnostic,
} from '@/hooks/use-internal-service';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * One service order, as the people working on it need to see it.
 *
 * THE INTERNAL SERIALIZER, not the customer one. Internal notes, the physical
 * condition recorded at intake, the accessories, the full timeline including
 * private comments, who received the device and who has it now — all of it is
 * here, and none of it is on the screen a customer sees.
 *
 * THE ACTIONS COME FROM THE SERVER. `availableTransitions` is rendered
 * verbatim; there is no transition table in this app to drift out of step with
 * the machine. The server re-validates the move regardless of what was drawn,
 * so a refusal is a normal outcome rather than a bug.
 */
export default function ServiceOrderDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);

  const [comment, setComment] = useState('');

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayView = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_VIEW);
  const mayManage = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_MANAGE);

  const query = useServiceOrder(Number.isFinite(orderId) ? orderId : undefined, {
    enabled: mayView,
  });
  const assignment = useServiceAssignmentOptions(
    Number.isFinite(orderId) ? orderId : undefined,
    { enabled: mayManage },
  );
  const transition = useServiceTransition();
  const assign = useAssignTechnician();

  // BR-005B. Reading uses `service.orders.view` — the same capability that
  // opened this order — so these two load alongside it. Composing is gated on
  // `service.diagnostic.manage`, and that gate lives on the buttons inside the
  // sections rather than on the queries.
  const mayQuote = hasUxCapability(context ?? null, CAP_SERVICE_DIAGNOSTIC_MANAGE);
  const safeId = Number.isFinite(orderId) ? orderId : undefined;
  const diagnostics = useServiceDiagnostics(safeId, { enabled: mayView });
  const quotes = useServiceQuotes(safeId, { enabled: mayView });

  const createDiagnostic = useCreateDiagnostic(orderId);
  const updateDiagnostic = useUpdateDiagnostic(orderId);
  const createQuote = useCreateQuote(orderId);
  const addItem = useAddQuoteItem(orderId);
  const removeItem = useRemoveQuoteItem(orderId);
  const publishQuote = usePublishQuote(orderId);
  const cancelQuote = useCancelQuote(orderId);

  // M10. Working the bench is its OWN capability, separate from moving the
  // order and separate from quoting. A shop can hand the counter one without
  // the others, and the server re-checks every write regardless of what this
  // drew.
  const mayRepair = hasUxCapability(context ?? null, CAP_SERVICE_REPAIR_MANAGE);
  const execution = useServiceExecution(safeId, { enabled: mayView });
  const partUsages = useServicePartUsages(safeId, { enabled: mayView });
  const partCandidates = useServicePartCandidates(safeId, { enabled: mayView });

  const startRepair = useStartRepair(orderId);
  const updateExecution = useUpdateExecution(orderId);
  const completeRepair = useCompleteRepair(orderId);
  const pauseForParts = usePauseForParts(orderId);
  const resumeRepair = useResumeRepair(orderId);
  const recordPart = useRecordPartUsage(orderId);
  const reversePart = useReversePartUsage(orderId);

  // M11. Inspecting is its OWN capability, separate from working the bench: a
  // shop that wants a second pair of eyes grants one role each. The server
  // re-checks regardless of what this drew.
  const mayInspect = hasUxCapability(context ?? null, CAP_SERVICE_QUALITY_MANAGE);
  const qualityCheck = useServiceQualityCheck(safeId, { enabled: mayView });
  const qualityHistory = useServiceQualityHistory(safeId, { enabled: mayView });

  const startQuality = useStartQualityCheck(orderId);
  const recordQuality = useRecordQualityResult(orderId);
  const passQuality = usePassQualityCheck(orderId);
  const failQuality = useFailQualityCheck(orderId);

  // M12 / BR-005E. Its OWN capability, not an add-on to `service.orders.manage`
  // — a shop that wants reception to release devices should not have to hand the
  // front desk the machine that cancels orders. `hasUxCapability` draws the
  // button; the server is what authorises the write.
  const mayDeliver = hasUxCapability(context ?? null, CAP_SERVICE_DELIVERY_MANAGE);
  const delivery = useServiceDelivery(safeId, { enabled: mayView });
  const recordDelivery = useRecordDelivery(orderId);

  // M12B / BR-005F. Its OWN capability: moving an order through its lifecycle
  // and taking cash for it are different jobs. READING the balance needs only
  // `service.orders.view` — a technician who cannot see whether a customer has
  // settled cannot answer the question they will be asked at the counter.
  const mayCharge = hasUxCapability(context ?? null, CAP_SERVICE_PAYMENTS_MANAGE);
  const payments = useServicePayments(safeId, { enabled: mayView });
  const recordPayment = useRecordServicePayment(orderId);
  const reversePayment = useReverseServicePayment(orderId);

  const { data: order, isPending, isError, error } = query;
  const title = order?.number ?? 'Orden de servicio';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando orden" skeletonCount={4} />
        </Screen>
      </>
    );
  }

  if (!mayView) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="Ya no tienes acceso a este módulo"
            message="Tu cuenta no tiene permiso para ver el servicio técnico de esta empresa."
            actionLabel="Volver al área interna"
            onAction={() => router.replace('/internal')}
          />
        </Screen>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando orden" skeletonCount={4} />
        </Screen>
      </>
    );
  }

  const move = (status: string, label: string) => {
    transition.mutate(
      { id: order.id, status, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setComment('');
          Alert.alert('Estado actualizado', `${order.number} ahora está en «${label}».`);
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="mono" color="textTertiary">
              {order.number}
            </Text>
            <Text variant="title2" accessibilityRole="header">
              {order.deviceSummary}
            </Text>
            <StatusBadge
              label={order.statusLabel}
              tone="neutral"
              accessibilityPrefix="Estado de la orden"
            />
          </View>

          <Card variant="outlined">
            <View style={{ gap: theme.spacing.sm }}>
              <Row label="Cliente" value={order.customerName} theme={theme} />
              <Divider />
              <Row label="Sucursal" value={order.branchName} theme={theme} />
              <Divider />
              <Row label="Recibido" value={formatDate(order.receivedAt)} theme={theme} />
              <Divider />
              <Row label="Recibido por" value={order.receivedByName || '—'} theme={theme} />
              <Divider />
              <Row
                label="Técnico"
                value={order.technicianName || 'Sin asignar'}
                theme={theme}
              />
            </View>
          </Card>

          <View>
            <SectionHeader title="Recepción" />
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.sm }}>
                <Field label="Problema reportado" value={order.reportedIssue} theme={theme} />
                {order.physicalCondition ? (
                  <Field
                    label="Condición física"
                    value={order.physicalCondition}
                    theme={theme}
                  />
                ) : null}
                {order.receivedAccessories ? (
                  <Field
                    label="Accesorios recibidos"
                    value={order.receivedAccessories}
                    theme={theme}
                  />
                ) : null}
                {order.internalNotes ? (
                  <Field label="Notas internas" value={order.internalNotes} theme={theme} />
                ) : null}
              </View>
            </Card>
          </View>

          {/* BR-005B. These two sections are not an addition to this screen —
              they are the FORWARD PATH. M9 removed `waiting_approval` from the
              server's `availableTransitions`, so the status buttons below can
              no longer move an order onward; publishing a quote is what does
              that now, and a customer answering it is what moves it again. */}
          <ServiceDiagnosticSection
            diagnostics={diagnostics.data?.results ?? []}
            canManage={mayQuote}
            isSaving={createDiagnostic.isPending || updateDiagnostic.isPending}
            error={createDiagnostic.error ?? updateDiagnostic.error}
            onCreate={(input) => createDiagnostic.mutate(input)}
            onUpdate={(diagnosticId, input) =>
              updateDiagnostic.mutate({ diagnosticId, input })
            }
          />

          <ServiceQuoteSection
            quotes={quotes.data?.results ?? []}
            canManage={mayQuote}
            isBusy={
              createQuote.isPending || addItem.isPending || removeItem.isPending
              || publishQuote.isPending || cancelQuote.isPending
            }
            error={
              createQuote.error ?? addItem.error ?? removeItem.error
              ?? publishQuote.error ?? cancelQuote.error
            }
            onCreate={() =>
              createQuote.mutate({
                diagnosticId: diagnostics.data?.results[0]?.id ?? null,
              })
            }
            onAddItem={(quoteId, input) => addItem.mutate({ quoteId, input })}
            onRemoveItem={(quoteId, itemId) => removeItem.mutate({ quoteId, itemId })}
            onPublish={(quoteId) => publishQuote.mutate({ quoteId })}
            onCancel={(quoteId) => cancelQuote.mutate({ quoteId })}
          />

          {/* M10 / BR-005C. These two are the FORWARD PATH from `approved`.
              The status buttons below cannot reach `in_repair`, `waiting_parts`
              or `repaired` — all three are event-only on the server — so
              starting the work is what moves the order now, and finishing it is
              what moves it again. */}
          <ServiceExecutionSection
            execution={execution.data ?? null}
            status={order.status}
            canManage={mayRepair}
            isBusy={
              startRepair.isPending || updateExecution.isPending
              || completeRepair.isPending || pauseForParts.isPending
              || resumeRepair.isPending
            }
            error={
              startRepair.error ?? updateExecution.error ?? completeRepair.error
              ?? pauseForParts.error ?? resumeRepair.error
            }
            onStart={() => startRepair.mutate()}
            onSaveWork={(input) => updateExecution.mutate(input)}
            onComplete={(input) => completeRepair.mutate(input)}
            onPause={(comment) => pauseForParts.mutate({ comment })}
            onResume={() => resumeRepair.mutate()}
          />

          <ServicePartsSection
            candidates={partCandidates.data?.results ?? []}
            usages={partUsages.data?.results ?? []}
            canManage={mayRepair && !execution.data?.isCompleted}
            /* A completed repair freezes its parts on the SERVER; hiding the
               button as well only spares somebody a refusal they cannot act
               on. */
            canReverse={mayRepair && !!execution.data && !execution.data.isCompleted}
            isBusy={recordPart.isPending || reversePart.isPending}
            error={recordPart.error ?? reversePart.error}
            onUse={(input) => recordPart.mutate(input)}
            onReverse={(usageId) => reversePart.mutate({ usageId })}
          />

          {/* M11 / BR-005D. `repaired` is not the end: the device is inspected
              before it can be collected, and a failure sends it back to the
              bench with a NEW execution. Both `quality_control` and
              `ready_for_pickup` are event-only on the server, so the status
              buttons below cannot reach either. */}
          <ServiceQualitySection
            check={qualityCheck.data ?? null}
            history={qualityHistory.data?.results ?? []}
            status={order.status}
            canManage={mayInspect}
            isBusy={
              startQuality.isPending || recordQuality.isPending
              || passQuality.isPending || failQuality.isPending
            }
            error={
              startQuality.error ?? recordQuality.error
              ?? passQuality.error ?? failQuality.error
            }
            onStart={() => startQuality.mutate()}
            onAnswer={(itemId, result, itemNotes) =>
              recordQuality.mutate({ itemId, input: { result, notes: itemNotes } })
            }
            onPass={(notes) => passQuality.mutate({ notes })}
            onFail={(notes) => failQuality.mutate({ notes })}
          />

          {/* M12B / BR-005F. Money and lifecycle are orthogonal: nothing here
              writes a status, and there is no `paid` state. The one place they
              meet is the delivery gate, and only for a tenant that turned it
              on — which the summary reports so this screen can explain it. */}
          <ServicePaymentSection
            summary={payments.data?.summary ?? null}
            payments={payments.data?.results ?? []}
            canManage={mayCharge}
            isBusy={recordPayment.isPending || reversePayment.isPending}
            error={recordPayment.error ?? reversePayment.error ?? payments.error}
            onRecord={(input) =>
              recordPayment.mutate({
                amount: input.amount,
                method: input.method,
                reference: input.reference,
                idempotencyKey: input.idempotencyKey,
              })
            }
            onReverse={(paymentId) => reversePayment.mutate({ paymentId })}
          />

          {/* M12 / BR-005E. `delivered` is event-only on the server too, so the
              status buttons below cannot reach it: handing the device over is
              the only road in, and it records WHO took it. It records no
              payment — the platform cannot charge for a repair. */}
          <ServiceDeliverySection
            delivery={delivery.data ?? null}
            status={order.status}
            canManage={mayDeliver}
            isBusy={recordDelivery.isPending}
            error={recordDelivery.error}
            onDeliver={(input) =>
              recordDelivery.mutate(input, {
                onSuccess: () =>
                  Alert.alert(
                    'Entrega registrada',
                    `${order.number} quedó entregada a ${input.recipientName}.`,
                  ),
                // M12B. A refusal for an outstanding balance is NOT a failed
                // handover, and reporting it as one would send somebody looking
                // for a problem with the device. Refetch the balance — it is
                // what changed — and say what is owed.
                onError: (error) => {
                  if (error instanceof ServicePaymentRequiredError) {
                    void payments.refetch();
                    Alert.alert('Saldo pendiente', error.message);
                  }
                },
              })
            }
          />

          {/* Only with `service.orders.manage`. The server re-checks anyway, so
              a 403 here is a normal outcome — the permission may have been
              revoked between drawing the button and pressing it. */}
          {mayManage ? (
            <View>
              <SectionHeader title="Mover la orden" />
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.sm }}>
                  {order.availableTransitions.length === 0 ? (
                    <Text variant="subhead" color="textSecondary">
                      Esta orden ya no admite más cambios de estado en esta versión.
                    </Text>
                  ) : (
                    <>
                      <Input
                        label="Comentario (interno)"
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        hint="Queda en el historial junto a tu nombre. El cliente no lo ve."
                      />
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: theme.spacing.xs }}
                      >
                        {order.availableTransitions.map((option) => (
                          <Button
                            key={option.code}
                            label={option.label}
                            size="compact"
                            loading={transition.isPending}
                            onPress={() => move(option.code, option.label)}
                          />
                        ))}
                      </ScrollView>
                    </>
                  )}

                  {transition.isError ? (
                    <Text variant="subhead" color="danger">
                      {serviceErrorMessage(transition.error)}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </View>
          ) : null}

          {mayManage ? (
            <View>
              <SectionHeader title="Técnico responsable" />
              <Card variant="outlined">
                <View style={{ gap: theme.spacing.sm }}>
                  {assignment.isPending ? (
                    <Text variant="subhead" color="textSecondary">
                      Cargando candidatos…
                    </Text>
                  ) : assignment.isError ? (
                    <Text variant="subhead" color="danger">
                      {serviceErrorMessage(assignment.error)}
                    </Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: theme.spacing.xs }}
                    >
                      {/* The candidates are the SERVER's. This app cannot work
                          out who is staff of a company, and has no business
                          holding a user list to try. */}
                      {(assignment.data?.candidates ?? []).map((candidate) => (
                        <Button
                          key={candidate.id}
                          label={candidate.name}
                          size="compact"
                          variant={
                            assignment.data?.current?.technician === candidate.id
                              ? 'primary'
                              : 'ghost'
                          }
                          loading={assign.isPending}
                          onPress={() =>
                            assign.mutate({ id: order.id, technicianId: candidate.id })
                          }
                        />
                      ))}
                      {assignment.data?.current ? (
                        <Button
                          label="Liberar"
                          size="compact"
                          variant="destructive"
                          loading={assign.isPending}
                          onPress={() => assign.mutate({ id: order.id, technicianId: null })}
                        />
                      ) : null}
                    </ScrollView>
                  )}

                  {assign.isError ? (
                    <Text variant="subhead" color="danger">
                      {serviceErrorMessage(assign.error)}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Historial" />
            <Card variant="outlined">
              <View style={{ gap: theme.spacing.sm }}>
                {order.history.map((event, index) => (
                  <View key={event.id} style={{ gap: 2 }}>
                    {index > 0 ? <Divider /> : null}
                    <Text variant="subhead">
                      {event.fromStatus ? `${event.fromStatus} → ` : ''}
                      {event.toStatusLabel}
                    </Text>
                    <Text variant="caption" color="textTertiary">
                      {formatDate(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                      {event.isCustomerVisible ? '' : ' · no visible para el cliente'}
                    </Text>
                    {event.comment ? (
                      <Text variant="footnote" color="textSecondary">
                        {event.comment}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Card>
          </View>
        </View>
      </Screen>
    </>
  );
}

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
    >
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Text variant="subhead" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="footnote" color="textTertiary">
        {label}
      </Text>
      <Text variant="subhead" style={{ marginBottom: theme.spacing.xxs }}>
        {value}
      </Text>
    </View>
  );
}
