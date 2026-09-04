import { View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Badge } from './badge';
import { Text } from './text';

export type KeyValueLayout = 'inline' | 'stacked';

/**
 * How much the pair should outweigh its neighbours. Three levels, because the
 * screens this replaced already used three and each one meant something:
 *
 *   `none`   an ordinary fact in a list of facts.
 *   `value`  the number is the point and its label is just a caption — an
 *            inventory KPI, where "1 240" carries the meaning and "Unidades en
 *            stock" only says what it counts.
 *   `pair`   this line is the answer the screen exists to give. The order total.
 *            Both halves rise, so it reads as a conclusion rather than a row.
 */
export type KeyValueEmphasis = 'none' | 'value' | 'pair';

export type KeyValueRowProps = {
  /** What the value is. Always read first by a screen reader. */
  label: string;
  /**
   * The value, ALREADY FORMATTED by whoever owns it.
   *
   * A string, not a node, and deliberately so: the accessibility label is built
   * from it, and a node cannot be spoken. A screen that wants a currency, a date
   * or an identifier formats it with the house helper and passes the result —
   * this component neither parses nor computes anything it is given.
   */
  value: string;
  /**
   * `inline` puts the value on the right of its label, `stacked` puts it
   * underneath. Short pairs read faster inline; a value that runs long — a
   * reported fault, a note — is easier to read stacked, with the full width to
   * itself.
   */
  layout?: KeyValueLayout;
  emphasis?: KeyValueEmphasis;
  /** Monospaced value, for identifiers that are compared character by character. */
  mono?: boolean;
  /**
   * Wraps the value in a `Badge`, for a number that should catch the eye when it
   * is not zero. The caller decides when it applies, because "is this worth
   * looking at" is a question about the data, not about the layout.
   */
  badge?: boolean;
};

/**
 * A label and its value.
 *
 * WHY THIS EXISTS. Five screens had each written their own: `DetailRow`
 * (repairs), `Field` and `Row` (service order), `SummaryRow` (customer order)
 * and `Metric` (inventory). One idea, five implementations, and they agreed on
 * nothing — three different label variants, four different value variants,
 * three different gaps, and an accessibility treatment present in two of the
 * five. The same information was announced as one unit on the customer's repair
 * screen and as two unlinked nodes on the operator's service screen.
 *
 * The point of collecting them is not to save lines. It is that "how tight does
 * a label sit above its value" should be answered once, by the design system,
 * rather than five times by whoever was writing a screen that afternoon.
 *
 * ACCESSIBILITY IS NOT OPTIONAL HERE. The pair is always one accessible node
 * announcing `label: value`. Read separately, "Recibido por" and "Ana Torres"
 * are two facts a screen-reader user has to join by memory across a list of
 * twenty; read together they are the one fact they were always meant to be.
 *
 * NOTHING IS COMPUTED. No total is added up, no currency parsed, no date
 * localised. `value` arrives formatted and is rendered as it arrived — this
 * component cannot make a server-owned number disagree with the server, because
 * it never looks inside one.
 */
export function KeyValueRow({
  label,
  value,
  layout = 'inline',
  emphasis = 'none',
  mono = false,
  badge = false,
}: KeyValueRowProps) {
  const theme = useTheme();

  const valueVariant = mono
    ? 'mono'
    : emphasis === 'pair'
      ? 'title3'
      : emphasis === 'value'
        ? 'headline'
        : layout === 'stacked'
          ? 'callout'
          : 'subhead';

  if (layout === 'stacked') {
    return (
      <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: LABEL_GAP }}>
        <Text variant="caption" color="textTertiary">
          {label}
        </Text>
        <Text variant={valueVariant}>{value}</Text>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Text
        variant={emphasis === 'pair' ? 'headline' : 'subhead'}
        color={emphasis === 'pair' ? 'textPrimary' : 'textSecondary'}
      >
        {label}
      </Text>

      {badge ? (
        <Badge label={value} tone="accent" />
      ) : (
        <Text
          variant={valueVariant}
          // Right-aligned and free to wrap. No `numberOfLines`: a customer name
          // or a branch name that no longer fits at 1.6x text size should take a
          // second line rather than lose its end to an ellipsis.
          style={{ flex: 1, textAlign: 'right' }}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

/**
 * The gap between a stacked label and its value: 2, and deliberately off the
 * spacing scale, whose smallest step is 4.
 *
 * This is a typographic relationship rather than a layout one. The two lines are
 * one block, and the line height already separates them; a full `xxs` pushes
 * them apart enough to read as two. It lives here, as a private constant, rather
 * than becoming a tenth step on a scale that is documented as having nine —
 * every other spacing decision in the app should still come from the scale.
 */
const LABEL_GAP = 2;
