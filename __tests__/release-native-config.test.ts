type ConfigFn = (input: { config: Record<string, unknown> }) => Record<string, unknown>;
const appConfig = jest.requireActual('../app.config.js') as ConfigFn;
const appJson = jest.requireActual('../app.json') as {
  expo: Record<string, unknown>;
};

/**
 * WHAT A DISTRIBUTED BINARY MAY DO ON THE NETWORK.
 *
 * Expo's iOS template ships `NSAllowsArbitraryLoads: true`, which is right for
 * a development client — Metro and Django are plain HTTP on a LAN address —
 * and wrong for a build somebody downloads: it turns App Transport Security
 * off for the whole app, so the system stops refusing a cleartext or
 * downgraded connection.
 *
 * The rule is keyed on the BUILD's environment, which EAS sets per profile, so
 * these tests are the only place the two shapes can be compared without
 * building twice.
 */

function resolve(appEnv: string | undefined) {
  const previous = process.env.EXPO_PUBLIC_APP_ENV;
  if (appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = appEnv;
  try {
    return appConfig({ config: JSON.parse(JSON.stringify(appJson.expo)) });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = previous;
  }
}

function ats(config: Record<string, unknown>) {
  const ios = config.ios as { infoPlist?: Record<string, unknown> } | undefined;
  return ios?.infoPlist?.NSAppTransportSecurity as
    | { NSAllowsArbitraryLoads?: boolean }
    | undefined;
}

describe('App Transport Security', () => {
  it.each(['production', 'staging', undefined])(
    'is enforced when EXPO_PUBLIC_APP_ENV is %s',
    (appEnv) => {
      expect(ats(resolve(appEnv))?.NSAllowsArbitraryLoads).toBe(false);
    },
  );

  it('is left to the template in a development build', () => {
    // Not asserted as `true`: the point is that this file does not touch it,
    // so the development client keeps whatever Expo generates for it.
    expect(ats(resolve('development'))).toBeUndefined();
  });

  it('changes nothing else about the app', () => {
    const released = resolve('production');
    expect(released.name).toBe(appJson.expo.name);
    expect(released.slug).toBe(appJson.expo.slug);
    expect(released.scheme).toBe(appJson.expo.scheme);
    expect((released.ios as { bundleIdentifier?: string }).bundleIdentifier).toBe(
      (appJson.expo.ios as { bundleIdentifier?: string }).bundleIdentifier,
    );
    expect(released.android).toEqual(appJson.expo.android);
  });
});

describe('the permissions this app asks for', () => {
  const plugins = appJson.expo.plugins as unknown[];

  function pluginConfig(name: string): Record<string, unknown> | undefined {
    for (const entry of plugins) {
      if (Array.isArray(entry) && entry[0] === name) {
        return entry[1] as Record<string, unknown>;
      }
    }
    return undefined;
  }

  it('does not ask for Face ID, which nothing in the app uses', () => {
    // `expo-secure-store` writes `NSFaceIDUsageDescription` by default, in
    // English, for a `requireAuthentication` option this app never passes.
    // `false` is what deletes the key rather than renaming it.
    expect(pluginConfig('expo-secure-store')?.faceIDPermission).toBe(false);
  });

  it('does not ask for the microphone', () => {
    expect(pluginConfig('expo-image-picker')?.microphonePermission).toBe(false);
  });

  it('explains the camera and the photo library in the language of the app', () => {
    const picker = pluginConfig('expo-image-picker') ?? {};
    for (const key of ['cameraPermission', 'photosPermission']) {
      expect(String(picker[key])).toContain('Black Dog Store');
    }
  });
});
