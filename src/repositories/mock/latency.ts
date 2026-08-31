/**
 * Simulated network latency for the mock repositories.
 *
 * Without it every mock resolves synchronously, loading states never render,
 * and skeletons ship untested — the classic way a mock-backed app falls apart
 * the moment it meets a real network. The delay is skipped under Jest so the
 * suite does not pay for it.
 */
const DEFAULT_DELAY_MS = 320;

const isTestEnvironment = process.env.NODE_ENV === 'test';

export function simulateLatency(signal?: AbortSignal, ms = DEFAULT_DELAY_MS): Promise<void> {
  if (isTestEnvironment) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
