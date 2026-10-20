import { useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Text } from '@/design-system';
import type { UnitMethodInput } from '@/domain/internal/order-unit-types';
import type { PosCartLine, PosLineUnit, PosUnitLookup } from '@/domain/internal/pos-types';
import { useTheme } from '@/theme/theme-provider';

/**
 * THE DEVICES OF ONE BASKET LINE — SERIAL-PICK-01, at the till.
 *
 * NOTHING WITH A SERIAL IS SOLD WITHOUT SAYING WHICH DEVICE. The server
 * refuses a serialised line that names fewer devices than it sells — «se vende
 * por su IMEI o serie» — so this is not a nicety: without it the till can
 * build a basket that cannot be charged.
 *
 * ONE LOOK PER DEVICE, CONFIRMED BY A PERSON. The code is resolved first and
 * the model, colour and condition are shown; a serial typed one digit wrong
 * would otherwise sell somebody else's device, and the shelf has no undo.
 *
 * THE SAME DEVICE CANNOT BE NAMED TWICE — the server refuses it — so a code
 * already on the line is rejected here before it travels.
 */
export type PosLineDevicesProps = {
  line: PosCartLine;
  isLooking: boolean;
  /** Resolves a code at this till, or null when the branch cannot sell it. */
  onLookup: (code: string, method: UnitMethodInput) => Promise<PosUnitLookup | null>;
  onAdd: (unit: PosLineUnit) => void;
  onRemove: (unitId: number) => void;
};

export function PosLineDevices({
  line,
  isLooking,
  onLookup,
  onAdd,
  onRemove,
}: PosLineDevicesProps) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<UnitMethodInput>('scanner');
  const [candidate, setCandidate] = useState<PosUnitLookup | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const missing = line.quantity - line.units.length;

  async function resolve() {
    setNotice(null);
    setCandidate(null);
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const found = await onLookup(trimmed, method);
      if (found === null) {
        // A device that exists nowhere and one on another company's shelf
        // answer the same way, on purpose.
        setNotice(`Código no encontrado en esta sucursal: ${trimmed}`);
        return;
      }
      if (line.units.some((unit) => unit.unitId === found.unit.unitId)) {
        setNotice('Ese equipo ya está en esta línea.');
        return;
      }
      if (found.unit.productId !== line.product.id) {
        // The server would refuse it too; saying which article it belongs to
        // is more useful than its refusal.
        setNotice(`Ese equipo es de otro artículo: ${found.unit.productName}`);
        return;
      }
      setCandidate(found);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo leer el equipo.');
    }
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color={missing > 0 ? 'danger' : 'textSecondary'}>
        {missing > 0
          ? `Identifica ${missing} equipo(s): este artículo se vende por su IMEI o serie.`
          : 'Equipos identificados.'}
      </Text>

      {line.units.map((unit, index) => (
        <View
          key={unit.unitId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          <Text variant="caption" style={{ flex: 1 }}>
            {`Equipo ${index + 1} · ${unit.method === 'manual' ? 'a mano' : 'lector'}`}
          </Text>
          <Button
            label="Quitar"
            variant="ghost"
            size="compact"
            onPress={() => onRemove(unit.unitId)}
          />
        </View>
      ))}

      {missing > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
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
              // The candidate belongs to the code it was found for.
              if (candidate) setCandidate(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            hint={
              line.product.requiresImei
                ? 'Este artículo se identifica por IMEI.'
                : 'Lee el código del equipo que va a salir.'
            }
          />

          {candidate ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" color="textSecondary">
                {[
                  candidate.unit.serialNumber && `Serie ${candidate.unit.serialNumber}`,
                  candidate.unit.imei && `IMEI ${candidate.unit.imei}`,
                  candidate.unit.conditionLabel || candidate.unit.condition,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Button
                label="Sí, es este equipo"
                size="compact"
                onPress={() => {
                  onAdd({ unitId: candidate.unit.unitId, method });
                  setCandidate(null);
                  setCode('');
                }}
              />
            </View>
          ) : (
            <Button
              label="Buscar el equipo"
              variant="secondary"
              size="compact"
              loading={isLooking}
              disabled={code.trim().length === 0}
              onPress={() => void resolve()}
            />
          )}

          {notice ? (
            <Text variant="caption" color="danger">
              {notice}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
