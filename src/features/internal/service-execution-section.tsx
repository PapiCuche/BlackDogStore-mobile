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
  SERVICE_RESULT_CODES,
  type ServiceCompleteInput,
  type ServiceExecution,
  type ServiceResultCode,
} from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServiceExecutionSectionProps = {
  execution: ServiceExecution | null;
  status: string;
  canManage: boolean;
  isBusy: boolean;
  error: unknown;
  onStart: () => void;
  onSaveWork: (input: { workPerformed: string; internalNotes: string }) => void;
  onComplete: (input: ServiceCompleteInput) => void;
  onPause: (comment: string) => void;
  onResume: () => void;
};

/**
 * The bench: starting the work, recording it, pausing it, finishing it.
 *
 * NOTHING HERE DECIDES ANYTHING. The buttons it draws are the ones the server's
 * lifecycle allows for the status it was handed, and the server re-checks every
 * one of them under a row lock. There is no transition table in this file and a
 * structural test fails if one appears.
 *
 * `work_performed` STARTS EMPTY, deliberately. The diagnosis is a proposal and
 * this is the record of what happened; pre-filling one with the other is how a
 * shop ends up with a hundred repairs whose notes all say what somebody
 * intended rather than what they found.
 */
export function ServiceExecutionSection({
  execution,
  status,
  canManage,
  isBusy,
  error,
  onStart,
  onSaveWork,
  onComplete,
  onPause,
  onResume,
}: ServiceExecutionSectionProps) {
  const theme = useTheme();
  const [work, setWork] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<ServiceResultCode | ''>('');
  const [pauseNote, setPauseNote] = useState('');
  const [draftLoaded, setDraftLoaded] = useState<number | null>(null);

  const open = execution !== null && !execution.isCompleted;
  const working = status === 'in_repair' || status === 'waiting_parts';

  // Seed the editor ONCE per execution, from the server's copy. Re-seeding on
  // every render would fight the technician's typing.
  if (execution && draftLoaded !== execution.id) {
    setDraftLoaded(execution.id);
    setWork(execution.workPerformed);
    setNotes(execution.internalNotes);
    setResult((execution.result as ServiceResultCode) || '');
  }

  function confirmComplete() {
    if (!work.trim()) {
      Alert.alert('Falta el trabajo realizado', 'Describe qué se hizo antes de finalizar.');
      return;
    }
    if (!result) {
      Alert.alert('Falta el resultado', 'Indica cómo terminó la reparación.');
      return;
    }
    Alert.alert(
      'Finalizar trabajo técnico',
      'El servidor marcará la orden como reparada. Esto no significa que esté '
      + 'revisada ni lista para entregar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: () =>
            onComplete({ workPerformed: work.trim(), result, internalNotes: notes }),
        },
      ],
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title="Trabajo técnico" />

      {error ? (
        <Card variant="outlined">
          <Text variant="subhead" color="danger">{String((error as Error)?.message ?? error)}</Text>
        </Card>
      ) : null}

      {execution === null ? (
        <Card variant="outlined">
          <Text variant="subhead" color="textSecondary">
            Nadie ha empezado a trabajar en este equipo todavía.
          </Text>
          {canManage && status === 'approved' ? (
            <>
              <Divider />
              <Button
                label="Iniciar reparación"
                onPress={() =>
                  Alert.alert(
                    'Iniciar reparación',
                    '¿Empezar a trabajar en este equipo? Quedará registrado a tu nombre.',
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
            <Text variant="headline">
              {execution.isCompleted ? 'Trabajo finalizado' : 'Trabajo en curso'}
            </Text>
            {execution.resultLabel ? (
              <StatusBadge
                label={execution.resultLabel}
                tone={execution.result === 'success' ? 'success' : 'warning'}
              />
            ) : null}
          </View>

          <Text variant="footnote" color="textTertiary">
            {`Iniciado ${formatDate(execution.startedAt)}`}
            {execution.startedByName ? ` · ${execution.startedByName}` : ''}
          </Text>
          {execution.completedAt ? (
            <Text variant="footnote" color="textTertiary">
              {`Finalizado ${formatDate(execution.completedAt)}`}
              {execution.completedByName ? ` · ${execution.completedByName}` : ''}
            </Text>
          ) : null}

          <Divider />

          {execution.isCompleted ? (
            <>
              <Text variant="subhead" color="textSecondary">Trabajo realizado</Text>
              <Text variant="body">{execution.workPerformed || '—'}</Text>
              {execution.internalNotes ? (
                <>
                  <Text variant="subhead" color="textSecondary">Notas internas</Text>
                  <Text variant="subhead" color="textSecondary">{execution.internalNotes}</Text>
                </>
              ) : null}
            </>
          ) : canManage ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Input
                label="Trabajo realizado"
                value={work}
                onChangeText={setWork}
                multiline
                placeholder="Qué se hizo realmente en el equipo"
              />
              <Input
                label="Notas internas"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="No lo ve el cliente"
              />
              <Button
                label="Guardar avance"
                variant="secondary"
                onPress={() => onSaveWork({ workPerformed: work, internalNotes: notes })}
                disabled={isBusy}
              />

              <Divider />

              <Text variant="subhead" color="textSecondary">Resultado</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {SERVICE_RESULT_CODES.map((option) => (
                  <Button
                    key={option.value}
                    label={option.label}
                    variant={result === option.value ? 'primary' : 'secondary'}
                    onPress={() => setResult(option.value)}
                    disabled={isBusy}
                  />
                ))}
              </View>

              <Button
                label="Finalizar trabajo técnico"
                onPress={confirmComplete}
                disabled={isBusy || status !== 'in_repair'}
              />
              {status === 'waiting_parts' ? (
                <Text variant="footnote" color="textTertiary">
                  Reanuda la reparación antes de finalizarla.
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <Text variant="subhead" color="textSecondary">Trabajo realizado</Text>
              <Text variant="body">{execution.workPerformed || '—'}</Text>
            </>
          )}
        </Card>
      )}

      {canManage && open && working ? (
        <Card variant="outlined">
          {status === 'in_repair' ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="subhead" color="textSecondary">Pausar por repuestos</Text>
              <Text variant="footnote" color="textTertiary">
                Usa esto cuando falte una pieza. El cliente verá que su equipo
                está esperando repuestos.
              </Text>
              <Input
                label="Motivo (opcional)"
                value={pauseNote}
                onChangeText={setPauseNote}
                placeholder="Qué se está esperando"
              />
              <Button
                label="Pausar por repuestos"
                variant="secondary"
                onPress={() => onPause(pauseNote)}
                disabled={isBusy}
              />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="subhead" color="textSecondary">Esperando repuestos</Text>
              <Button
                label="Reanudar reparación"
                onPress={onResume}
                disabled={isBusy}
              />
            </View>
          )}
        </Card>
      ) : null}
    </View>
  );
}
