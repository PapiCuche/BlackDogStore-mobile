import { useState } from 'react';
import { View } from 'react-native';

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
import type { ServiceDiagnostic } from '@/domain/internal/service-types';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

export type ServiceDiagnosticSectionProps = {
  diagnostics: readonly ServiceDiagnostic[];
  canManage: boolean;
  isSaving: boolean;
  error: unknown;
  onCreate: (input: {
    description: string;
    recommendedAction: string;
    rootCause?: string;
    internalNotes?: string;
  }) => void;
  onUpdate: (
    diagnosticId: number,
    input: { description: string; recommendedAction: string; rootCause?: string; internalNotes?: string },
  ) => void;
};

/**
 * What the technician found.
 *
 * A FINALIZED REVISION IS READ-ONLY, and the form does not appear for one. The
 * server refuses the edit anyway — that is the guarantee — but drawing a field
 * somebody cannot save is a small lie the screen tells before the server
 * corrects it.
 *
 * `root_cause` is optional here because it is optional in the domain: a
 * technician often knows a laptop does not charge long before they know why,
 * and a required field turns "I do not know yet" into a guess written as fact.
 */
export function ServiceDiagnosticSection({
  diagnostics,
  canManage,
  isSaving,
  error,
  onCreate,
  onUpdate,
}: ServiceDiagnosticSectionProps) {
  const theme = useTheme();
  const latest = diagnostics[0];
  const editable = latest && latest.finalizedAt === null;

  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(latest?.description ?? '');
  const [recommendedAction, setRecommendedAction] = useState(
    latest?.recommendedAction ?? '',
  );
  const [rootCause, setRootCause] = useState(latest?.rootCause ?? '');
  const [internalNotes, setInternalNotes] = useState(latest?.internalNotes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const descriptionError = submitted && description.trim().length === 0
    ? 'Describe lo que encontraste.'
    : undefined;
  const actionError = submitted && recommendedAction.trim().length === 0
    ? 'Indica la acción recomendada.'
    : undefined;

  const openForm = (fresh: boolean) => {
    if (fresh) {
      setDescription('');
      setRecommendedAction('');
      setRootCause('');
      setInternalNotes('');
    } else if (latest) {
      setDescription(latest.description);
      setRecommendedAction(latest.recommendedAction);
      setRootCause(latest.rootCause);
      setInternalNotes(latest.internalNotes);
    }
    setSubmitted(false);
    setEditing(true);
  };

  const submit = () => {
    setSubmitted(true);
    if (description.trim().length === 0 || recommendedAction.trim().length === 0) return;

    const payload = {
      description: description.trim(),
      recommendedAction: recommendedAction.trim(),
      rootCause: rootCause.trim() || undefined,
      internalNotes: internalNotes.trim() || undefined,
    };
    if (editable && latest) onUpdate(latest.id, payload);
    else onCreate(payload);
    setEditing(false);
  };

  return (
    <View>
      <SectionHeader title="Diagnóstico" />
      <Card variant="outlined">
        <View style={{ gap: theme.spacing.sm }}>
          {latest ? (
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
                  Revisión #{latest.revision} · {latest.diagnosedByName || '—'}
                </Text>
                <StatusBadge
                  label={latest.statusLabel}
                  tone={latest.finalizedAt ? 'neutral' : 'progress'}
                  size="small"
                  accessibilityPrefix="Estado del diagnóstico"
                />
              </View>

              <Field label="Hallazgo" value={latest.description} theme={theme} />
              {latest.rootCause ? (
                <Field label="Causa" value={latest.rootCause} theme={theme} />
              ) : null}
              <Field
                label="Acción recomendada"
                value={latest.recommendedAction}
                theme={theme}
              />
              {latest.internalNotes ? (
                <Field label="Notas internas" value={latest.internalNotes} theme={theme} />
              ) : null}

              {latest.finalizedAt ? (
                <Text variant="caption" color="textTertiary">
                  Congelado el {formatDate(latest.finalizedAt)} al enviar una cotización.
                  Un cambio de criterio es una revisión nueva.
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="subhead" color="textSecondary">
              Todavía no hay diagnóstico para esta orden.
            </Text>
          )}

          {error ? (
            <Text variant="subhead" color="danger">
              {serviceErrorMessage(error)}
            </Text>
          ) : null}

          {canManage && editing ? (
            <>
              <Divider />
              <Input
                label="Hallazgo"
                value={description}
                onChangeText={setDescription}
                multiline
                error={descriptionError}
              />
              <Input
                label="Causa (opcional)"
                value={rootCause}
                onChangeText={setRootCause}
                multiline
                hint="Déjala vacía si todavía no la puedes afirmar."
              />
              <Input
                label="Acción recomendada"
                value={recommendedAction}
                onChangeText={setRecommendedAction}
                multiline
                error={actionError}
                hint="Es lo que se cotiza."
              />
              <Input
                label="Notas internas (opcional)"
                value={internalNotes}
                onChangeText={setInternalNotes}
                multiline
                hint="El cliente no las ve."
              />
              <Button label="Guardar" loading={isSaving} onPress={submit} />
              <Button
                label="Cancelar"
                variant="ghost"
                disabled={isSaving}
                onPress={() => setEditing(false)}
              />
            </>
          ) : null}

          {canManage && !editing ? (
            <Button
              label={editable ? 'Editar diagnóstico' : 'Registrar diagnóstico'}
              variant="secondary"
              size="compact"
              onPress={() => openForm(!editable)}
            />
          ) : null}
        </View>
      </Card>
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
