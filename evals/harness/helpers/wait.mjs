/**
 * Poll until fn() returns truthy or timeout expires.
 * @param {Function} fn - Async function to poll
 * @param {number} timeoutMs - Max wait time (default 5s)
 * @param {number} intervalMs - Poll interval (default 200ms)
 * @returns {Promise<any>} The truthy return value of fn
 */
export async function waitFor(fn, timeoutMs = 5000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

/**
 * Simple delay.
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
