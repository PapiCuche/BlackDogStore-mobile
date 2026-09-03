type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * The gates a developer and CI must both actually run.
 *
 * These assert BEHAVIOUR OF THE REPOSITORY rather than product behaviour, which
 * is unusual for a test file and is the point: `git diff --check` was missing
 * from CI for the whole life of the project, and nothing could have noticed —
 * a gate that is absent produces no signal at all, which is exactly what a
 * passing pipeline looks like.
 */

const CI = '.github/workflows/mobile-ci.yml';

describe('CI runs every gate the project claims to have', () => {
  const workflow = fs.readFileSync(CI, 'utf8');

  it.each([
    ['install', /npm ci/],
    ['typecheck', /npm run typecheck/],
    ['lint', /npm run lint/],
    ['tests', /npm run test:ci/],
    ['expo doctor', /expo-doctor/],
    ['metro export', /expo export/],
    ['patch integrity', /git diff --check/],
  ])('runs %s', (_name, pattern) => {
    expect(workflow).toMatch(pattern);
  });

  it('exports BOTH platforms, not just one', () => {
    // A bundle that compiles for iOS can still fail for Android — different
    // transforms, different native module resolution.
    expect(workflow).toMatch(/--platform ios/);
    expect(workflow).toMatch(/--platform android/);
  });

  it('keeps Expo Doctor non-blocking while it runs unpinned', () => {
    // DELIBERATE, and this test exists so it stays deliberate. Doctor resolves
    // the SDK matrix over the network and the workflow invokes it as
    // `expo-doctor@latest`, so making it a hard gate would let somebody else's
    // release fail this repository's pull requests with no change to this
    // repository. If it is ever pinned, this test should be revisited rather
    // than deleted — a pinned Doctor CAN be a gate.
    const doctorJob = workflow.slice(workflow.indexOf('doctor:'));
    expect(doctorJob).toMatch(/continue-on-error:\s*true/);
    expect(doctorJob).toMatch(/expo-doctor@latest/);
  });

  it('pins the same Node everywhere it installs', () => {
    const versions = [...workflow.matchAll(/node-version:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions).size).toBe(1);

    // And the same one EAS builds with, so a bundle that passes CI is a bundle
    // built the same way.
    const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    expect(eas.build.base.node).toBe(versions[0]);
  });
});

describe('`npm run verify` is representative of CI', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const verify: string = pkg.scripts.verify;

  it('covers the fast gates a developer can run before opening a PR', () => {
    for (const gate of ['typecheck', 'lint', 'test:ci', 'git diff --check']) {
      expect(verify).toContain(gate);
    }
  });

  it('leaves out the slow and networked ones on purpose', () => {
    // `npm ci` wipes node_modules, and the exports and Doctor take minutes and
    // touch the network. A pre-PR command people avoid running is worse than a
    // shorter one they actually run; CI still covers all four.
    expect(verify).not.toContain('npm ci');
    expect(verify).not.toContain('expo export');
    expect(verify).not.toContain('expo-doctor');
  });
});
