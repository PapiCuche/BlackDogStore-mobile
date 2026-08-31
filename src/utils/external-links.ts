import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

/**
 * Open a link that came from the SERVER.
 *
 * The server is trusted and this still validates, because a URL is the one
 * response field that becomes an action. A `javascript:` or `file:` scheme
 * reaching an opener is the difference between rendering bad data and running
 * it, and one function is cheaper than auditing every call site.
 *
 * `https:` opens in the in-app browser: the user stays in the app, and the
 * address bar shows them which site they are on — which matters most for the
 * payment page, where a look-alike is the whole attack.
 *
 * `whatsapp:`, `tel:` and `mailto:` hand off to the system, because that is
 * what they are for. Nothing else is opened at all.
 */
const IN_APP_SCHEMES = ['https:'];
const HANDOFF_SCHEMES = ['whatsapp:', 'tel:', 'mailto:'];

export function isOpenableLink(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  try {
    const { protocol } = new URL(raw);
    return IN_APP_SCHEMES.includes(protocol) || HANDOFF_SCHEMES.includes(protocol);
  } catch {
    return false;
  }
}

/** Returns whether the link was opened. Never throws: a dead link is not a crash. */
export async function openExternalLink(raw: unknown): Promise<boolean> {
  if (!isOpenableLink(raw)) return false;

  try {
    const { protocol } = new URL(raw);
    if (IN_APP_SCHEMES.includes(protocol)) {
      await WebBrowser.openBrowserAsync(raw);
      return true;
    }
    // A handoff can fail simply because the app is not installed. That is a
    // normal outcome, not an error to surface.
    const supported = await Linking.canOpenURL(raw);
    if (!supported) return false;
    await Linking.openURL(raw);
    return true;
  } catch {
    return false;
  }
}
