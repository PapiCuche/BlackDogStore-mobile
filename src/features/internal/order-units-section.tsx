import { useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type {
  OrderUnitRecord,
  UnitCandidate,
  UnitMethodInput,
} from '@/domain/internal/order-unit-types';
import { describeUnitMethod } from '@/domain/internal/order-unit-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * WHICH DEVICE LEFT WITH THIS ORDER — SERIAL-PICK-01.
 *
 * A serialised product is not handed over as a count: somebody reads the
 * serial or the IMEI of the device actually going out. The order cannot be
 * marked delivered while one is missing, and this is where the person says
 * which one it is.
 *
 * THE LOOK COMES BEFORE THE COMMIT. A code is first asked about — model,
 * colour, condition — and only then committed. A serial typed one digit wrong
 * would otherwise hand over somebody else's device, and the server cannot undo
 * a sale on the shelf.
 *
 * THE COUNT IS THE SERVER'S. `unitsPending` already accounts for devices that
 * went back to the shelf and for lines still on order from a supplier; this
 * screen prints it and never recomputes it.
 *
 * `canChange` and each record's `canRemove` are the server's answers too —
 * false once the order left the shop or is coming back — and the server
 * refuses the act again regardless of what was drawn.
 */
export type OrderUnitsSectionProps = {
  units: readonly OrderUnitRecord[];
  pending: number;
  canChange: boolean;
  candidate: UnitCandidate | null;
  isLooking: boolean;
  isSaving: boolean;
  lookupError: unknown;
  saveError: unknown;
  onLookup: (input: { code: string; method: UnitMethodInput }) => void;
  onIdentify: (input: { code: string; method: UnitMethodInput }) => void;
  onForget: (orderUnitId: number) => void;
  onClearCandidate: () => void;
};

export function OrderUnitsSection({
  units,
  pending,
  canChange,
  candidate,
  isLooking,
  isSaving,
  lookupError,
  saveError,
  onLookup,
  onIdentify,
  onForget,
  onClearCandidate,
}: OrderUnitsSectionProps) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<UnitMethodInput>('scanner');

  // Nothing to say: this order owes no device and none was ever named.
  if (pending === 0 && units.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
      >
        <Text variant="headline" style={{ flex: 1 }}>
          Equipos del pedido
        </Text>
        {pending > 0 ? (
          <StatusBadge
            label={pending === 1 ? 'Falta 1 equipo' : `Faltan ${pending} equipos`}
            tone="warning"
            size="small"
            accessibilityPrefix="Equipos pendientes"
          />
        ) : (
          <StatusBadge
            label="Completo"
            tone="success"
            size="small"
            accessibilityPrefix="Equipos pendientes"
          />
        )}
      </View>

      {units.map((unit, index) => (
        <View key={unit.id} style={{ gap: theme.spacing.xs }}>
          {index > 0 ? <Divider /> : null}
          <Text variant="subhead">
            {unit.serialNumber ? `Serie ${unit.serialNumber}` : 'Sin número de serie'}
          </Text>
          {unit.imei ? (
            <Text variant="caption" color="textSecondary">
              {unit.imei2 ? `IMEI ${unit.imei} · ${unit.imei2}` : `IMEI ${unit.imei}`}
            </Text>
          ) : null}
          <Text variant="caption" color="textTertiary">
            {describeUnitMethod(unit.method, unit.methodLabel)}
            {unit.identifiedBy ? ` · ${unit.identifiedBy}` : ''}
            {unit.identifiedAt ? ` · ${formatDate(unit.identifiedAt)}` : ''}
          </Text>
          {/* Offered only while the server says this record can be taken back. */}
          {canChange && unit.canRemove ? (
            <Button
              label="Quitar este equipo"
              variant="ghost"
              size="compact"
              loading={isSaving}
              onPress={() => onForget(unit.id)}
            />
          ) : null}
        </View>
      ))}

      {canChange && pending > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Divider />
          <Text variant="subhead">Identificar un equipo</Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <Button
              label="Lector"
              size="compact"
              variant={method === 'scanner' ? 'primary' : 'secondary'}
              onPress={() => setMethod('scanner')}
            />
            <Button
              label="A mano"
              size="compact"
              variant={method === 'manual' ? 'primary' : 'secondary'}
              onPress={() => setMethod('manual')}
            />
          </View>

          <Input
            label="Serie o IMEI"
            value={code}
            onChangeText={(next) => {
              setCode(next);
              // The candidate belongs to the code that was asked about. Keeping
              // it while the text changes would let somebody commit a device
              // they are no longer looking at.
              if (candidate) onClearCandidate();
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            hint={
              method === 'manual'
                ? 'Escrito a mano, el servidor puede exigir el IMEI completo.'
                : 'Lee el código del equipo que va a salir.'
            }
          />

          {candidate ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="subhead">{candidate.productName}</Text>
              <Text variant="caption" color="textSecondary">
                {candidate.serialNumber ? `Serie ${candidate.serialNumber}` : 'Sin serie'}
                {candidate.imei ? ` · IMEI ${candidate.imei}` : ''}
              </Text>
              <Text variant="caption" color="textTertiary">
                {candidate.conditionLabel || candidate.condition}
              </Text>
              {/* Confirmed against the device in hand, never from the code alone. */}
              <Button
                label="Sí, es este equipo"
                loading={isSaving}
                onPress={() => {
                  onIdentify({ code: code.trim(), method });
                  setCode('');
                }}
              />
              <Button label="No es este" variant="ghost" onPress={onClearCandidate} />
            </View>
          ) : (
            <Button
              label="Buscar el equipo"
              variant="secondary"
              disabled={code.trim().length === 0}
              loading={isLooking}
              onPress={() => onLookup({ code: code.trim(), method })}
            />
          )}

          {lookupError ? (
            <Text variant="caption" color="danger">
              {unitErrorMessage(lookupError)}
            </Text>
          ) : null}
          {saveError ? (
            <Text variant="caption" color="danger">
              {unitErrorMessage(saveError)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!canChange && pending > 0 ? (
        <Text variant="caption" color="textSecondary">
          Este pedido ya no admite cambios de equipos.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The server's own sentence about the device.
 *
 * «Ese código no corresponde a ningún equipo», «Ese equipo ya salió con otro
 * pedido» — the shop's words for the shop's rules. A generic message would
 * leave somebody holding a phone with no idea which rule stopped them.
 */
export function unitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo identificar el equipo.';
}
