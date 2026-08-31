/**
 * Jest setup.
 *
 * Only NATIVE boundaries are mocked here — the things that genuinely cannot run
 * in Node. Application code is never mocked at this level: a suite that stubs
 * its own modules stops testing them.
 */

// AsyncStorage ships an official in-memory mock; the theme provider reads a
// preference on mount, so without this every render logs a native-module error.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The Taptic Engine does not exist in Node. Feedback is fire-and-forget, so a
// resolved promise is a faithful stand-in.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));

// The Keychain/Keystore is a native module. Mocked at the boundary so the
// wrapper in `src/storage/secure-storage.ts` — which is ours — is what gets
// tested, rather than Expo's internals.
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// SF Symbols / Material Symbols are rendered by the OS. The stub keeps the
// component tree shaped the same without pulling in a native view.
jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return { SymbolView: View };
});

// Safe-area insets come from the native window. Zeroing them keeps layout
// assertions deterministic instead of depending on a simulated device.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
