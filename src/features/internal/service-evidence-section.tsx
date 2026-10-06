import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import { Button, Divider, Input, StatusBadge, Text } from '@/design-system';
import type {
  EvidenceStageOption,
  InternalEvidence,
  InternalEvidenceGallery,
} from '@/domain/internal/evidence-types';
import {
  EVIDENCE_CAPTION_MAX_LENGTH,
  EVIDENCE_VOID_REASON_MAX_LENGTH,
} from '@/domain/internal/evidence-types';
import { describeEvidenceStage } from '@/domain/repairs/evidence';
import { useTheme } from '@/theme/theme-provider';
import {
  pickEvidencePhoto,
  type PhotoSource,
  type PickedPhoto,
} from '@/utils/evidence-photo-picker';
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
 *
 * UPLOADING ASKS FOR A STAGE FIRST, from the catalogue THE SERVER SENT with the
 * gallery, and only the stages this person's capabilities cover are offered —
 * the same per-stage rule as the three buttons, now before the photo exists. A
 * photo is born internal; sharing it is still a separate act afterwards.
 */
export type ServiceEvidenceSectionProps = {
  evidence: readonly InternalEvidence[];
  /** The stages the server offers, in the order of the repair cycle. */
  stages: readonly EvidenceStageOption[];
  /** How many photos are IN FORCE per stage, as the server counted them. */
  stageCounts: InternalEvidenceGallery['stageCounts'];
  /** Whether this person holds one stage's capability. Asked per stage. */
  canUseStage: (stage: EvidenceStageOption) => boolean;
  isUploading: boolean;
  uploadError: unknown;
  onUpload: (input: { stage: EvidenceStageOption['value']; photo: PickedPhoto; caption: string }) => void;
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
  stages,
  stageCounts,
  canUseStage,
  isUploading,
  uploadError,
  onUpload,
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

  const uploader = (
    <EvidenceUploader
      stages={stages}
      stageCounts={stageCounts}
      canUseStage={canUseStage}
      isUploading={isUploading}
      error={uploadError}
      onUpload={onUpload}
    />
  );

  if (evidence.length === 0) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subhead" color="textSecondary">
          Esta orden todavía no tiene fotos.
        </Text>
        {uploader}
      </View>
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

      <Divider />
      {uploader}
    </View>
  );
}

type EvidenceUploaderProps = {
  stages: readonly EvidenceStageOption[];
  stageCounts: InternalEvidenceGallery['stageCounts'];
  canUseStage: (stage: EvidenceStageOption) => boolean;
  isUploading: boolean;
  error: unknown;
  onUpload: ServiceEvidenceSectionProps['onUpload'];
};

/**
 * Take a photo of one moment of the repair.
 *
 * THE STAGE COMES FIRST, and it comes from the server's own catalogue. Choosing
 * it before the camera opens is not a formality: the stage is what the server
 * checks the capability against, so asking afterwards would mean opening the
 * camera for a photo that cannot be sent.
 *
 * Stages this person's capabilities do not cover are not listed. The server
 * would refuse them anyway, and the refusal would arrive after the photo.
 *
 * WHAT THE PICKER REFUSES IS SAID PLAINLY, and a cancellation says nothing at
 * all — closing the camera is not a failure.
 */
function EvidenceUploader({
  stages,
  stageCounts,
  canUseStage,
  isUploading,
  error,
  onUpload,
}: EvidenceUploaderProps) {
  const theme = useTheme();
  const [stage, setStage] = useState<EvidenceStageOption | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const allowed = stages.filter(canUseStage);

  if (allowed.length === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        No tienes permiso para añadir fotos a esta orden.
      </Text>
    );
  }

  async function pick(source: PhotoSource) {
    setNotice(null);
    const result = await pickEvidencePhoto(source);
    if (result.status === 'picked') {
      setPhoto(result.photo);
      return;
    }
    if (result.status === 'denied') {
      setNotice(
        source === 'camera'
          ? 'La cámara está bloqueada para esta app. Se habilita en los ajustes del teléfono.'
          : 'Las fotos están bloqueadas para esta app. Se habilitan en los ajustes del teléfono.',
      );
      return;
    }
    if (result.status === 'rejected') setNotice(result.reason);
    // Cancelled: the person closed the picker, and that needs no message.
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="subhead">Añadir una foto</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.xs }}
      >
        {allowed.map((option) => {
          const count = stageCounts[option.value] ?? 0;
          return (
            <Button
              key={option.value}
              // The count is the server's: «Ingreso · 6» says what is on the
              // record, not what this screen has drawn.
              label={count > 0 ? `${option.label} · ${count}` : option.label}
              variant={stage?.value === option.value ? 'primary' : 'ghost'}
              size="compact"
              onPress={() => {
                setStage(option);
                setNotice(null);
              }}
            />
          );
        })}
      </ScrollView>

      {stage ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textSecondary">
            {photo
              ? `Foto lista: ${photo.name}`
              : `La foto se guardará como «${stage.label}».`}
          </Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <Button label="Cámara" variant="secondary" size="compact" onPress={() => void pick('camera')} />
            <Button label="Galería" variant="secondary" size="compact" onPress={() => void pick('library')} />
          </View>

          {photo ? (
            <>
              <Input
                label="Nota (opcional)"
                value={note}
                onChangeText={setNote}
                maxLength={EVIDENCE_CAPTION_MAX_LENGTH}
                hint="Qué muestra la foto."
              />
              <Button
                label="Subir la foto"
                loading={isUploading}
                onPress={() => {
                  onUpload({ stage: stage.value, photo, caption: note });
                  // Cleared on dispatch: the mutation does not retry, so a
                  // second press would be a second photo on the record.
                  setPhoto(null);
                  setNote('');
                }}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Text variant="caption" color="textSecondary">
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger">
          {serviceErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}
