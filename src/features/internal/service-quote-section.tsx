import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import {
  Button,
  Card,
  Divider,
  Input,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/design-system';
import {
  SERVICE_QUOTE_ITEM_TYPES,
  type ServiceQuote,
  type ServiceQuoteItemInput,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatCurrency, formatDate } from '@/utils/format';

export type ServiceQuoteSectionProps = {
  quotes: readonly ServiceQuote[];
  canManage: boolean;
  isBusy: boolean;
  error: unknown;
  onCreate: () => void;
  onAddItem: (quoteId: number, input: ServiceQuoteItemInput) => void;
  onRemoveItem: (quoteId: number, itemId: number) => void;
  onPublish: (quoteId: number) => void;
  onCancel: (quoteId: number) => void;
};

/**
 * The quote builder, and the history of what was quoted before.
 *
 * EVERY FIGURE COMES FROM THE SERVER. This component adds nothing up — not even
 * a preview. `format.ts` states the rule the app follows: decimal strings are
 * parsed at the last moment before display and never earlier, and the one place
 * this app does money arithmetic is the anonymous cart, which has no backend to
 * ask. A quote has one, and it computes `line_total`, `subtotal` and `total`
 * under a lock.
 *
 * PUBLISHING IS THE FORWARD PATH. M9 removed `waiting_approval` from the
 * server's `available_transitions`, so the order's status buttons no longer
 * offer it — this section is where an order moves forward now, and the
 * confirmation says plainly that the revision becomes uneditable.
 *
 * A NON-DRAFT REVISION HAS NO EDITOR. `isEditable` arrives computed; drawing a
 * field on a sent quote would be a lie the server corrects a second later.
 */
export function ServiceQuoteSection({
  quotes,
  canManage,
  isBusy,
  error,
  onCreate,
  onAddItem,
  onRemoveItem,
  onPublish,
  onCancel,
}: ServiceQuoteSectionProps) {
  const theme = useTheme();
  const current = quotes[0];

  const [itemType, setItemType] = useState<string>('labor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const quantityError = submitted && !(Number(quantity) > 0)
    ? 'Cantidad mayor que cero.'
    : undefined;
  const priceError = submitted && !(Number(unitPrice) >= 0)
    ? 'Precio válido, cero o más.'
    : undefined;
  const descriptionError = submitted && description.trim().length === 0
    ? 'Describe la línea.'
    : undefined;

  const addItem = () => {
    setSubmitted(true);
    if (!current) return;
    if (description.trim().length === 0) return;
    if (!(Number(quantity) > 0) || !(Number(unitPrice) >= 0)) return;

    onAddItem(current.id, {
      itemType,
      description: description.trim(),
      // Sent as STRINGS, exactly as typed. Parsing to a float here and sending
      // the result back is how a price picks up a rounding error on the way.
      quantity: quantity.trim(),
      unitPrice: unitPrice.trim(),
    });
    setDescription('');
    setQuantity('1');
    setUnitPrice('');
    setSubmitted(false);
  };

  const confirmPublish = () => {
    if (!current) return;
    Alert.alert(
      'Enviar la cotización',
      `Se enviará ${formatCurrency(current.total)} ${current.currency} al cliente`
        + (current.validUntil ? `, válida hasta el ${formatDate(current.validUntil)}` : '')
        + '. Después no podrás editar esta revisión: un cambio será una revisión nueva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: () => onPublish(current.id) },
      ],
    );
  };

  return (
    <View>
      <SectionHeader title="Cotización" />
      <Card variant="outlined">
        <View style={{ gap: theme.spacing.sm }}>
          {!current ? (
            <Text variant="subhead" color="textSecondary">
              Todavía no hay cotización para esta orden.
            </Text>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="footnote" color="textTertiary">
                  Cotización #{current.revision} · {current.createdByName || '—'}
                </Text>
                <StatusBadge
                  label={current.statusLabel}
                  tone={
                    current.status === 'approved'
                      ? 'success'
                      : current.status === 'rejected' || current.status === 'cancelled'
                        ? 'danger'
                        : current.status === 'sent'
                          ? 'warning'
                          : 'progress'
                  }
                  size="small"
                  accessibilityPrefix="Estado de la cotización"
                />
              </View>

              {current.items.map((item) => (
                <View key={item.id} style={{ gap: 2 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Text variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text variant="subhead">{formatCurrency(item.lineTotal)}</Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text variant="caption" color="textTertiary">
                      {item.itemTypeLabel} · {item.quantity} × {formatCurrency(item.unitPrice)}
                    </Text>
                    {canManage && current.isEditable ? (
                      <Button
                        label="Quitar"
                        variant="ghost"
                        size="compact"
                        haptic={false}
                        disabled={isBusy}
                        onPress={() => onRemoveItem(current.id, item.id)}
                      />
                    ) : null}
                  </View>
                </View>
              ))}

              {current.items.length > 0 ? <Divider /> : null}

              <Amount label="Subtotal" value={current.subtotal} theme={theme} />
              {Number(current.discountAmount) > 0 ? (
                <Amount
                  label="Descuento"
                  value={`-${current.discountAmount}`}
                  theme={theme}
                />
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="headline">Total</Text>
                <Text variant="title3">
                  {formatCurrency(current.total)} {current.currency}
                </Text>
              </View>

              {current.decision ? (
                <Text variant="footnote" color="textSecondary">
                  El cliente respondió el {formatDate(current.decision.decidedAt)}
                  {current.decision.reason ? `: «${current.decision.reason}»` : '.'}
                </Text>
              ) : null}

              {current.validUntil ? (
                <Text
                  variant="caption"
                  color={current.isExpired ? 'danger' : 'textTertiary'}
                >
                  {current.isExpired ? 'Venció el ' : 'Válida hasta el '}
                  {formatDate(current.validUntil)}
                </Text>
              ) : null}
            </>
          )}

          {error ? (
            <Text variant="subhead" color="danger">
              {serviceErrorMessage(error)}
            </Text>
          ) : null}

          {/* ── The editor, only on a draft ─────────────────────────────── */}
          {canManage && current?.isEditable ? (
            <>
              <Divider />
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="footnote" color="textTertiary">
                  Añadir línea
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: theme.spacing.xs }}
                >
                  {SERVICE_QUOTE_ITEM_TYPES.map((type) => (
                    <Button
                      key={type.value}
                      label={type.label}
                      size="compact"
                      variant={itemType === type.value ? 'primary' : 'ghost'}
                      onPress={() => setItemType(type.value)}
                    />
                  ))}
                </ScrollView>
              </View>
              <Input
                label="Descripción"
                value={description}
                onChangeText={setDescription}
                error={descriptionError}
              />
              <Input
                label="Cantidad"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                error={quantityError}
              />
              <Input
                label="Precio unitario"
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="decimal-pad"
                error={priceError}
                hint="El total de la línea lo calcula el servidor."
              />
              <Button
                label="Añadir línea"
                variant="secondary"
                loading={isBusy}
                onPress={addItem}
              />
            </>
          ) : null}

          {/* ── The forward path ────────────────────────────────────────── */}
          {canManage && current?.isEditable && current.items.length > 0 ? (
            <Button
              label="Enviar cotización al cliente"
              fullWidth
              loading={isBusy}
              onPress={confirmPublish}
            />
          ) : null}

          {canManage && current?.status === 'sent' ? (
            <Button
              label="Anular cotización"
              variant="destructive"
              fullWidth
              loading={isBusy}
              onPress={() => onCancel(current.id)}
            />
          ) : null}

          {canManage && (!current || !current.isEditable) && current?.status !== 'sent' ? (
            <Button
              label={current ? 'Nueva revisión' : 'Crear cotización'}
              variant="secondary"
              fullWidth
              loading={isBusy}
              onPress={onCreate}
            />
          ) : null}

          {/* Older revisions stay visible: "you agreed to this" is only
              answerable if the thing they refused is still there next to it. */}
          {quotes.length > 1 ? (
            <>
              <Divider />
              <Text variant="footnote" color="textTertiary">
                Revisiones anteriores
              </Text>
              {quotes.slice(1).map((quote) => (
                <View
                  key={quote.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <Text variant="caption" color="textTertiary">
                    #{quote.revision} · {quote.statusLabel}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {formatCurrency(quote.total)} {quote.currency}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function Amount({
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
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Text variant="subhead">{formatCurrency(value)}</Text>
    </View>
  );
}
