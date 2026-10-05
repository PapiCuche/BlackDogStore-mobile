import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, StatusBadge, Text } from '@/design-system';
import type { RepairEvidence } from '@/domain/repairs/evidence';
import { describeEvidenceStage } from '@/domain/repairs/evidence';
import { useTheme } from '@/theme/theme-provider';

/**
 * The photos the shop shared about one repair — M12D, customer side.
 *
 * EVERY IMAGE IS AN AUTHORISED REQUEST. The server hands out a content route,
 * never a storage key or a signed link, and that route re-checks company,
 * ownership, visibility and voiding on each call. So each `<Image>` carries the
 * Bearer header, and a photo the shop has since withdrawn stops loading by
 * itself rather than because this component remembered to hide it.
 *
 * `authorization` arrives as a prop rather than being read here: resolving it
 * can need a token refresh, which is asynchronous, and a gallery is not the
 * place to own session work.
 *
 * TAPPING EXPANDS IN PLACE rather than opening a modal. The app has no `Modal`
 * anywhere else, and a photo of your own device is not an interruption that
 * earns one — it is more of the same screen.
 *
 * NO CAPTION IS INVENTED. An empty caption renders the stage and nothing else;
 * writing "Foto de la reparación" under a photo somebody took of a cracked
 * screen would be the app narrating the workshop's evidence.
 */
export type RepairEvidenceGalleryProps = {
  evidence: readonly RepairEvidence[];
  /** `Bearer …`, or null while it resolves. Nothing loads without it. */
  authorization: string | null;
  /** Built by the repository: the content route for one photo. */
  contentUrl: (evidenceId: number) => string;
};

const THUMBNAIL = 104;

export function RepairEvidenceGallery({
  evidence,
  authorization,
  contentUrl,
}: RepairEvidenceGalleryProps) {
  const theme = useTheme();
  const [openId, setOpenId] = useState<number | null>(null);
  const open = evidence.find((item) => item.id === openId) ?? null;

  if (evidence.length === 0) return null;

  function source(item: RepairEvidence) {
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
            <Pressable
              key={item.id}
              onPress={() => setOpenId(item.id)}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                item.caption ? `${stage.label}: ${item.caption}` : stage.label
              }
              accessibilityHint="Abre la foto a pantalla completa"
              style={{ width: THUMBNAIL, gap: theme.spacing.xs }}
            >
              <Image
                source={source(item)}
                style={{
                  width: THUMBNAIL,
                  height: THUMBNAIL,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.skeleton,
                }}
                contentFit="cover"
                accessible={false}
                transition={120}
              />
              <StatusBadge label={stage.label} tone={stage.tone} size="small" />
            </Pressable>
          );
        })}
      </ScrollView>

      {open ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Image
            source={source(open)}
            style={{
              width: '100%',
              aspectRatio: open.width > 0 && open.height > 0 ? open.width / open.height : 4 / 3,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.skeleton,
            }}
            contentFit="contain"
            accessibilityLabel={
              open.caption
                ? `${describeEvidenceStage(open.stage).label}: ${open.caption}`
                : describeEvidenceStage(open.stage).label
            }
          />
          {open.caption ? <Text>{open.caption}</Text> : null}
          <Button label="Cerrar" variant="secondary" onPress={() => setOpenId(null)} />
        </View>
      ) : null}
    </View>
  );
}
