/**
 * RELEASE-ONLY NATIVE HARDENING, on top of `app.json`.
 *
 * `app.json` stays the single description of the app — name, identifiers,
 * icons, plugins. This file changes nothing about it except the handful of
 * native settings that must differ between a build a developer runs against a
 * laptop and a build somebody downloads.
 *
 * WHY IT EXISTS AT ALL. Expo's iOS template ships
 * `NSAppTransportSecurity.NSAllowsArbitraryLoads = true`, which is right for a
 * development client — Metro and Django are plain HTTP on a LAN address — and
 * wrong for anything distributed: it switches off App Transport Security for
 * the whole binary, so a downgraded or intercepted connection is no longer
 * refused by the system. A release build talks to one HTTPS host and needs
 * none of it.
 *
 * The switch is the BUILD's environment, not a flag inside the app:
 * `EXPO_PUBLIC_APP_ENV` is set per EAS profile (`development`, `staging`,
 * `production`), so a development client keeps what it needs and every other
 * profile gets the strict plist.
 */

/** Only the development client talks to a laptop over plain HTTP. */
function isDevelopmentBuild() {
  return (process.env.EXPO_PUBLIC_APP_ENV ?? '').trim() === 'development';
}

module.exports = ({ config }) => {
  if (isDevelopmentBuild()) return config;

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        // ATS back on. No arbitrary loads, and no local-network exception
        // either: a distributed build has no business reaching a private
        // address, and `isLocalOnlyApiHost` already refuses to resolve one.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },
      },
    },
  };
};
