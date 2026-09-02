import { useState } from 'react';
import { Alert, View } from 'react-native';

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
  QUALITY_RESULTS,
  type QualityResult,
  type ServiceQualityCheck,
  type ServiceQualityItem,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServiceQualitySectionProps = {
  check: ServiceQualityCheck | null;
  history: readonly ServiceQualityCheck[];
  status: string;
  canManage: boolean;
  isBusy: boolean;
  error: unknown;
  onStart: () => void;
  onAnswer: (itemId: number, result: QualityResult, notes: string) => void;
  onPass: (notes: string) => void;
  onFail: (notes: string) => void;
};

/**
 * The inspection: the checklist the server sent, and the two ways it can end.
 *
 * THE CHECKLIST IS NOT IN THIS FILE. It arrives as a snapshot the server copied
 * when the inspection opened, and this component renders whatever came back. A
 * list hardcoded here would be a list that ignores what each shop configured
 * and quietly disagrees with what was actually tested.
 *
 * THE VERDICT IS NOT COMPUTED HERE EITHER. The summary below is a PREVIEW — it
 * helps somebody see where they are — and the buttons it enables are only ever
 * a suggestion. The server reads the answers and refuses a pass with an
 * unanswered required point or any failure, whatever this drew.
 */
export function ServiceQualitySection({
  check,
  history,
  status,
  canManage,
  isBusy,
  error,
  onStart,
  onAnswer,
  onPass,
  onFail,
}: ServiceQualitySectionProps) {
  const theme = useTheme();
  const [notes, setNotes] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});

  const open = check !== null && check.isOpen;

  // A PREVIEW, not authority. Named so nobody mistakes it for the decision.
  const unanswered = open
    ? check.items.filter((i) => i.isRequired && !i.result).length
    : 0;
  const failures = open ? check.items.filter((i) => i.result === 'fail').length : 0;

  function confirmPass() {
    Alert.alert(
      'Aprobar control de calidad',
      'El servidor verificará las respuestas. Si aprueba, el equipo pasará a '
      + 'listo para recoger — eso no avisa al cliente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aprobar', onPress: () => onPass(notes) },
      ],
    );
  }

  function confirmFail() {
    Alert.alert(
      'Enviar de vuelta a reparación',
      'Se abrirá un trabajo nuevo. El anterior y sus repuestos quedan como '
      + 'están, y no se devuelve nada al stock.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Devolver', onPress: () => onFail(notes) },
      ],
    );
  }

  function renderItem(item: ServiceQualityItem) {
    return (
      <View key={item.id} style={{ gap: theme.spacing.xs }}>
        <Text variant="subhead" numberOfLines={3}>
          {item.label}
          {item.isRequired ? '' : ' (opcional)'}
        </Text>
        {canManage ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {QUALITY_RESULTS.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                variant={item.result === option.value ? 'primary' : 'secondary'}
                onPress={() =>
                  onAnswer(item.id, option.value, itemNotes[item.id] ?? '')
                }
                disabled={isBusy}
              />
            ))}
          </View>
        ) : (
          <Text variant="footnote" color="textTertiary">
            {item.result
              ? QUALITY_RESULTS.find((r) => r.value === item.result)?.label ?? item.result
              : 'Sin responder'}
          </Text>
        )}
        {canManage && item.result === 'fail' ? (
          <Input
            label="Qué falló"
            value={itemNotes[item.id] ?? item.notes}
            onChangeText={(value) =>
              setItemNotes((current) => ({ ...current, [item.id]: value }))
            }
            placeholder="Solo lo ve el taller"
          />
        ) : null}
        {!canManage && item.notes ? (
          <Text variant="caption" color="textTertiary">{item.notes}</Text>
        ) : null}
        <Divider />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title="Control de calidad" />

      {error ? (
        <Card variant="outlined">
          <Text variant="subhead" color="danger">
            {String((error as Error)?.message ?? error)}
          </Text>
        </Card>
      ) : null}

      {check === null ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">
            Este equipo todavía no ha pasado por control de calidad.
          </Text>
          {canManage && status === 'repaired' ? (
            <>
              <Divider />
              <Button
                label="Iniciar control de calidad"
                onPress={() =>
                  Alert.alert(
                    'Iniciar control de calidad',
                    'Se copiará la lista de control de tu empresa tal como está '
                    + 'ahora. Editarla después no cambiará este control.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Iniciar', onPress: onStart },
                    ],
                  )
                }
                disabled={isBusy}
              />
            </>
          ) : null}
        </Card>
      ) : (
        <Card variant="outlined">
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>
              {check.templateName || 'Control de calidad'}
            </Text>
            <StatusBadge
              label={check.statusLabel}
              tone={
                check.status === 'passed'
                  ? 'success'
                  : check.status === 'failed'
                    ? 'danger'
                    : 'info'
              }
            />
          </View>
          <Text variant="footnote" color="textTertiary">
            {`Iniciado ${formatDate(check.startedAt)}`}
            {check.checkedByName ? ` · ${check.checkedByName}` : ''}
          </Text>

          <Divider />
          {check.items.map(renderItem)}

          {open && canManage ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="footnote" color="textTertiary">
                {unanswered > 0
                  ? `Faltan ${unanswered} punto(s) obligatorio(s).`
                  : failures > 0
                    ? `${failures} punto(s) no pasaron.`
                    : 'Todo lo obligatorio está respondido.'}
              </Text>
              <Input
                label="Observaciones internas"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="No lo ve el cliente"
              />
              <Button
                label="Aprobar control de calidad"
                onPress={confirmPass}
                disabled={isBusy}
              />
              <Button
                label="Enviar de vuelta a reparación"
                variant="secondary"
                onPress={confirmFail}
                disabled={isBusy}
              />
            </View>
          ) : null}
        </Card>
      )}

      {history.length > 1 ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">Controles anteriores</Text>
          <Divider />
          {history.slice(1).map((past) => (
            <View
              key={past.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
              }}
            >
              <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                {formatDate(past.startedAt)}
                {past.completedByName ? ` · ${past.completedByName}` : ''}
              </Text>
              <StatusBadge
                label={past.statusLabel}
                tone={past.status === 'passed' ? 'success' : 'danger'}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
