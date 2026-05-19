export function buildLogger(functionName) {
  const base = { function: functionName };
  return {
    info(msg, data = {}) {
      console.log(JSON.stringify({
        level: 'info', ...base, msg, ...data, ts: Date.now(),
      }));
    },
    warn(msg, data = {}) {
      console.log(JSON.stringify({
        level: 'warn', ...base, msg, ...data, ts: Date.now(),
      }));
    },
    error(msg, data = {}) {
      console.error(JSON.stringify({
        level: 'error', ...base, msg, ...data, ts: Date.now(),
      }));
    },
  };
}
