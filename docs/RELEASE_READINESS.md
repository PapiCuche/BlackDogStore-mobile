# Release readiness

What has been checked before a store build, what it was checked against, and
what is still open. Verified on Mobile `dbf1c95`, Backend `origin/master`
`97c2dd0`.

This is not a plan. Everything marked **done** is enforced by a test or by
configuration; everything marked **open** is a decision somebody has to make,
with the reason it cannot be settled from here.

---

## Environments

| Profile | `EXPO_PUBLIC_APP_ENV` | API |
|---|---|---|
| `development` / `ios-simulator` | `development` | inferred from the Metro host |
| `preview` | `staging` | `https://blackdogstoreperu.com` |
| `production` | `production` | `https://blackdogstoreperu.com` |

**Preview points at production, and that is the open item** (STAGING-01). Until
a staging backend exists:

- destructive QA on Preview stays blocked — the Maestro suite runs against the
  scratch backend through a development build, never through Preview;
- a Preview build is for looking at the app, not for exercising it.

Two rules make a misconfigured binary refuse to work rather than work against
the wrong thing, both in `src/config/env.ts` and both covered by
`__tests__/env-config.test.ts`:

- a non-development build that resolves to `localhost`, `127.0.0.1`,
  `0.0.0.0`, `10.0.2.2` or a `.local` host resolves to **no API at all**;
- a non-development build that resolves to anything that is not `https:`
  does the same. Cleartext in a distributed build is not a weaker connection:
  iOS refuses it under ATS and Android under its network config, so every
  request fails — after somebody has typed their password into it.

The app then says it is unconfigured on the first screen instead of failing one
request at a time.

## Identity

| | Value |
|---|---|
| Display name | Black Dog Store (`CFBundleDisplayName`: Black Dog) |
| Bundle identifier | `com.blackdogstore.app` |
| Android package | `com.blackdogstore.app` |
| Scheme | `blackdogstore` |
| EAS project | `e4a0a7b3-27ff-43fc-8061-6fdad2b8bac3` |
| Version | `1.0.0`, `appVersionSource: remote`, `autoIncrement` on production |

**Open — the slug is `BlackDogStore-mobile-temp`.** It is not user-facing and it
is not the store identity, but it is the EAS project's name, and changing it
later points the CLI at a different project: new build history, new channels.
Deciding it before the first store submission costs nothing; deciding it after
costs the history. Not changed here, because changing it by surprise is exactly
the accident worth avoiding.

## iOS

- **App Transport Security is enforced in every distributed build.** Expo's
  template ships `NSAllowsArbitraryLoads: true`, which is right for a
  development client reaching Metro and Django over plain HTTP on a LAN, and
  wrong for a binary somebody downloads. `app.config.js` sets it to `false` for
  every profile except `development`, and
  `__tests__/release-native-config.test.ts` asserts both shapes.
- **Usage descriptions match what the app actually does**: camera and photo
  library, both in Spanish, both naming the shop. No microphone, no location,
  no Face ID — `expo-secure-store` writes an English Face ID string by default
  for a `requireAuthentication` option this app never passes, and the plugin is
  configured with `faceIDPermission: false`, which deletes the key.
- `NSLocalNetworkUsageDescription` comes from `expo-dev-launcher` and is
  stripped from non-Debug builds by its own build phase. Verified in
  `node_modules/expo-dev-launcher/plugin/build/withDevLauncher.js`.
- `ITSAppUsesNonExemptEncryption: false` is declared, so submission does not
  stop to ask.

## Android

- Package and adaptive icons are set; `predictiveBackGestureEnabled: false`.
- **Open — `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are in the
  merged manifest.** They come from Expo's base template rather than from
  anything this app calls: the photo picker uses the system picker and
  `expo-file-system` writes to the app's own cache. Both are candidates for
  `android.blockedPermissions`, and Play flags broad storage permissions at
  review. They are NOT blocked here because the change cannot be verified
  without an Android device, and this project has none: blocking them blind
  risks breaking the evidence picker on Android 10–12 in a way no test here
  would catch. **Before the first Play submission: block them, then run flow
  `12-service-evidence` on a real Android device.**

## Privacy

- The **access token is never persisted** — not to SecureStore, not to
  AsyncStorage, not to React state. It lives in a closure and dies with the
  process.
- The **refresh token is the only secret written to SecureStore**
  (`bds.auth.refresh_token`), and sign-out and a rejected refresh both wipe it.
- AsyncStorage holds preferences only, and says so.
- There are **no `console.*` calls in `src/`**.
- The dev quick-login is a credential autocompleter that returns `null` outside
  a development build — and, since this pass, is not even in the release
  bundle. Returning null was not enough: Metro still packed the module, so the
  fixture password it names was a readable string inside the production binary.
  The screen now requires it under `__DEV__`, which the release build replaces
  with `false`, so the branch is dead code and the module is dropped.
  Asserted by `__tests__/dev-quick-login-release-guard.test.tsx`.

  The check that found it, worth repeating before a submission:

  ```bash
  EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_API_BASE_URL=https://blackdogstoreperu.com \
  EXPO_PUBLIC_COMPANY_SLUG=black-dog-store EXPO_PUBLIC_USE_MOCK_DATA=false \
    npx expo export --platform ios --output-dir /tmp/export-ios
  strings /tmp/export-ios/_expo/static/js/ios/*.hbc \
    | grep -cE 'Demo123!|localhost:8000|dev_master'   # expects 0
  ```

## Resilience

Re-checked for this release, 135 tests across six suites
(`connectivity`, `offline-ux`, `refresh-coordinator`, `deep-link-auth-gate`,
`deep-link-security`, `deep-link-lifecycle`):

- a genuine offline state appears, and recovery clears it — the latch that
  paused every mutation is covered by both a test and Maestro flow `19`;
- 92 critical mutations carry `retry: false`;
- a 401 refreshes once through the coordinator; a **403 does not log anybody
  out** — it is an answer about one request, not about the session;
- a deep link never grants authorization: it parks an intent, the gate decides,
  and `18-deep-links` drives four addresses including one that does not exist.

## Observability — open, and deliberately not solved here

There is **no crash reporting and no release diagnostics**. Nothing is
installed, and nothing should be installed by surprise: a crash reporter is a
new processor of other people's data, which is a decision for whoever owns the
privacy policy, not a dependency to add during a hardening pass.

What a decision needs to cover:

- **Crash reporting** (Sentry's `@sentry/react-native` is the usual choice with
  Expo, and this repository's Jest config already tolerates it in
  `transformIgnorePatterns`). It needs a DSN, a data-retention answer, and a
  scrubbing rule for the one thing that must never arrive: tokens and customer
  PII.
- **Source maps**, uploaded per build, or a crash report is a stack of minified
  frames.
- **Release health**, which needs the version and channel to be attached to
  every event.

Until that decision exists, a crash in production is invisible from here.
`expo-updates` is **not** installed either, so the `channel` keys in `eas.json`
are inert and there is no OTA path: a fix ships as a build.

## Before the first production build

1. `EXPO_PUBLIC_API_BASE_URL` is the approved HTTPS host — the fail-closed
   rules above make a mistake unusable rather than silent.
2. `EXPO_PUBLIC_USE_MOCK_DATA=false`, and production forbids mocks regardless
   (`resolveMockDataPolicy`).
3. Dev quick-login absent — it is, by environment.
4. Bundle identifier, package and version as in the table above.
5. The whole gate: `npm run verify`, `npm run doctor`, an iOS export and an
   Android export, `git diff --check`.

A production cloud build is worth running when it verifies something the
configuration cannot — signing, submission metadata, store assets. Running one
to repeat what these checks already prove spends quota for nothing.
