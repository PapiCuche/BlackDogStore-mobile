import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type { InternalEvidence } from '@/domain/internal/evidence-types';
import {
  EVIDENCE_CAPTION_MAX_LENGTH,
  EVIDENCE_VOID_REASON_MAX_LENGTH,
} from '@/domain/internal/evidence-types';
import { describeEvidenceStage } from '@/domain/repairs/evidence';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * Repair photos as the workshop handles them — M12D, staff side.
 *
 * WHAT MAKES A BUTTON APPEAR. `canActOnStage` is asked per PHOTO, because the
 * server asks per photo: a quality photo takes `service.quality.manage`, a
 * diagnosis photo takes `service.diagnostic.manage`, and both also take access
 * to the order's branch. One blanket "may manage this order" would offer acts
 * the server then refuses.
 *
 * SHARING IS AN EXPLICIT ACT, AND SO IS UNDOING IT. The badge says in words
 * whether the customer can see a photo; nothing here infers it from the stage.
 *
 * A VOIDED PHOTO IS A DEAD END. The server refuses to share one, so no share
 * button is drawn for it — and it stays listed, with its reason, because
 * "this evidence was withdrawn" is part of the record.
 *
 * Every image is an authorised request: the content route re-checks company,
 * branch, capability, visibility and voiding, so nothing loads until the Bearer
 * header is resolved.
 */
export type ServiceEvidenceSectionProps = {
  evidence: readonly InternalEvidence[];
  /** `Bearer …`, or null while it resolves. Nothing loads without it. */
  authorization: string | null;
  contentUrl: (evidenceId: number) => string;
  /** Per photo: the capability its stage demands, as the server resolved it. */
  canActOnStage: (evidence: InternalEvidence) => boolean;
  isBusy: boolean;
  error: unknown;
  onPublish: (evidenceId: number) => void;
  /** The note is the only editable field of a photo. */
  onUpdateCaption: (evidenceId: number, caption: string) => void;
  onHide: (evidenceId: number) => void;
  onVoid: (evidenceId: number, reason: string) => void;
};

const THUMBNAIL = 112;

export function ServiceEvidenceSection({
  evidence,
  authorization,
  contentUrl,
  canActOnStage,
  isBusy,
  error,
  onPublish,
  onUpdateCaption,
  onHide,
  onVoid,
}: ServiceEvidenceSectionProps) {
  const theme = useTheme();
  const [openId, setOpenId] = useState<number | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const open = evidence.find((item) => item.id === openId) ?? null;

  if (evidence.length === 0) {
    return (
      <Text variant="subhead" color="textSecondary">
        Esta orden todavía no tiene fotos. Se toman desde la consola web.
      </Text>
    );
  }

  function source(item: InternalEvidence) {
    if (!authorization) return undefined;
    return { uri: contentUrl(item.id), headers: { Authorization: authorization } };
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm }}
      >
        {evidence.map((item) => {
          const stage = describeEvidenceStage(item.stage);
          return (
            <View key={item.id} style={{ width: THUMBNAIL, gap: theme.spacing.xs }}>
              <Image
                source={source(item)}
                style={{
                  width: THUMBNAIL,
                  height: THUMBNAIL,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.skeleton,
                  opacity: item.voidedAt ? 0.4 : 1,
                }}
                contentFit="cover"
                accessibilityLabel={
                  item.caption ? `${stage.label}: ${item.caption}` : stage.label
                }
                transition={120}
              />
              <StatusBadge label={stage.label} tone={stage.tone} size="small" />
              <Button
                label={openId === item.id ? 'Ocultar detalle' : 'Ver detalle'}
                variant="ghost"
                size="compact"
                onPress={() => setOpenId(openId === item.id ? null : item.id)}
              />
            </View>
          );
        })}
      </ScrollView>

      {error ? (
        <Text variant="footnote" color="statusDanger">
          {serviceErrorMessage(error)}
        </Text>
      ) : null}

      {open ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Divider />
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            <StatusBadge
              label={
                open.voidedAt
                  ? 'Anulada'
                  : open.visibility === 'customer'
                    ? 'El cliente la ve'
                    : 'Solo interna'
              }
              tone={
                open.voidedAt ? 'neutral' : open.visibility === 'customer' ? 'success' : 'info'
              }
              accessibilityPrefix="Visibilidad de la foto"
            />
          </View>
          {open.caption ? <Text>{open.caption}</Text> : null}
          <Text variant="caption" color="textTertiary">
            {`${formatDate(open.createdAt)} · ${open.uploadedBy || 'sin autor registrado'}`}
          </Text>
          {open.voidedAt ? (
            <Text variant="footnote" color="textSecondary">
              {open.voidReason
                ? `Anulada: «${open.voidReason}»`
                : 'Anulada, sin motivo registrado.'}
            </Text>
          ) : null}

          {/* The stage decides who may act, so the three buttons live behind
              the SAME answer the server will give for this photo. */}
          {!open.voidedAt && canActOnStage(open) ? (
            <View style={{ gap: theme.spacing.xs }}>
              {/* The NOTE, and only the note. Editing a stage would relabel
                  evidence after the fact, and visibility is its own audited
                  act — the server accepts `caption` and nothing else. */}
              {editingId === open.id ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Input
                    label="Nota de la foto"
                    value={caption}
                    onChangeText={setCaption}
                    maxLength={EVIDENCE_CAPTION_MAX_LENGTH}
                    multiline
                    hint="Vacío borra la nota."
                  />
                  <Button
                    label="Guardar la nota"
                    size="compact"
                    loading={isBusy}
                    onPress={() => {
                      setEditingId(null);
                      onUpdateCaption(open.id, caption);
                    }}
                  />
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    size="compact"
                    onPress={() => setEditingId(null)}
                  />
                </View>
              ) : (
                <Button
                  label={open.caption ? 'Corregir la nota' : 'Añadir una nota'}
                  variant="ghost"
                  size="compact"
                  onPress={() => {
                    setCaption(open.caption);
                    setEditingId(open.id);
                  }}
                />
              )}

              {open.visibility === 'customer' ? (
                <Button
                  label="Dejar de compartirla"
                  variant="secondary"
                  loading={isBusy}
                  onPress={() => onHide(open.id)}
                />
              ) : (
                <Button
                  label="Compartir con el cliente"
                  loading={isBusy}
                  onPress={() => onPublish(open.id)}
                />
              )}

              {voidingId === open.id ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Input
                    label="Motivo de la anulación"
                    value={voidReason}
                    onChangeText={setVoidReason}
                    maxLength={EVIDENCE_VOID_REASON_MAX_LENGTH}
                    hint="Queda en el registro de la foto."
                  />
                  <Button
                    label="Anular la foto"
                    variant="destructive"
                    loading={isBusy}
                    onPress={() => {
                      setVoidingId(null);
                      onVoid(open.id, voidReason);
                      setVoidReason('');
                    }}
                  />
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    onPress={() => setVoidingId(null)}
                  />
                </View>
              ) : (
                <Button
                  label="Anular la foto"
                  variant="ghost"
                  onPress={() => setVoidingId(open.id)}
                />
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
