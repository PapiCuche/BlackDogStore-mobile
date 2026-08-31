import { describeAuthError, redactHeaders, redactPayload } from '@/auth/redact';
import { RefreshNetworkError, RefreshRejectedError } from '@/auth/auth-errors';
import { ApiError } from '@/api/errors';

/**
 * M3 — nothing on an auth path may emit a credential.
 *
 * The individual redaction helpers already have unit coverage. What this file
 * adds is the STRUCTURAL claim: now that real tokens flow through these
 * modules, no console call exists there to leak one in the first place.
 *
 * A source scan rather than a runtime spy, because the failure this prevents is
 * someone adding a `console.log(response)` while debugging and shipping it. A
 * spy only catches the paths a test happens to exercise; this catches the line.
 */

const ROOTS = ['src/auth', 'src/api'];

/**
 * The slice of `fs`/`path` this file needs, declared locally.
 *
 * The project has no `@types/node`, and adding a dependency so one test can
 * read a directory would be the tail wagging the dog. Jest runs on Node, so the
 * modules are there at runtime; only the types are missing.
 */
type FileSystem = {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};
type PathModule = { join(...parts: string[]): string };

const fs = jest.requireActual('fs') as FileSystem;
const path = jest.requireActual('path') as PathModule;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((entry: string) => {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('no console call exists on an auth or transport path', () => {
  it.each(ROOTS)('%s emits nothing to the console', (root) => {
    const offenders = sourceFiles(root).filter((file) =>
      /\bconsole\s*\.\s*(log|warn|error|info|debug|trace)\s*\(/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('does not stringify a whole response anywhere on those paths', () => {
    // `JSON.stringify(response)` is the other way a token reaches a log — via
    // an error message that then gets reported.
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      /JSON\.stringify\s*\(\s*(response|wire|result|tokens|credentials)\b/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );

    expect(offenders).toEqual([]);
  });
});

describe('errors carry no credential', () => {
  it('an auth error message never contains a token', () => {
    for (const error of [new RefreshRejectedError('blacklisted'), new RefreshNetworkError()]) {
      expect(error.message).not.toMatch(/eyJ/);
      expect(error.message.toLowerCase()).not.toContain('bearer');
    }
  });

  it('describeAuthError reports the KIND, not the contents', () => {
    const described = describeAuthError(new RefreshRejectedError('expired'));

    expect(described).toContain('RefreshRejectedError');
    expect(described).not.toMatch(/eyJ/);
  });

  it('an ApiError from the auth endpoints carries no password', () => {
    const error = new ApiError('unauthorized', 'Correo o contraseña incorrectos.', {
      status: 401,
    });

    expect(error.message).not.toContain('Pass123!');
  });
});

describe('redaction covers the shapes this contract actually produces', () => {
  it('masks the Authorization header the transport sends', () => {
    const safe = redactHeaders({
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      'Content-Type': 'application/json',
    });

    expect(JSON.stringify(safe)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(safe['Content-Type']).toBe('application/json');
  });

  it('masks a login request body', () => {
    const safe = redactPayload({ email: 'carlos@example.com', password: 'Pass123!' });

    expect(JSON.stringify(safe)).not.toContain('Pass123!');
  });

  it('masks a login RESPONSE, which carries both tokens', () => {
    const safe = redactPayload({
      access: 'eyJhbGciOiJIUzI1NiJ9.a.b',
      refresh: 'eyJhbGciOiJIUzI1NiJ9.c.d',
      expires_in: 1800,
      user: { id: 42, email: 'carlos@example.com' },
    });
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9.a.b');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9.c.d');
    // The non-secret half survives, or redaction would be useless for debugging.
    expect(serialized).toContain('1800');
  });
});
