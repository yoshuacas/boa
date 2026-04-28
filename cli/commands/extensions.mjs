import * as config from '../lib/config.mjs';
import { getRegistry } from '../lib/extensions.mjs';

export default async function extensions(_args) {
  const cfg = config.read(); // may be null (no project)
  const registry = getRegistry();
  const enabled = cfg?.extensions || [];

  console.log('Available extensions:');
  console.log('');

  for (const [name, info] of Object.entries(registry)) {
    const status = enabled.includes(name)
      ? '  [enabled]'
      : '';
    const marker = info.deprecated ? ' (deprecated)' : '';
    console.log(
      `  ${name.padEnd(18)} ${info.description}${marker}${status}`
    );
  }

  if (cfg) {
    console.log('');
    if (enabled.length > 0) {
      console.log(`Enabled: ${enabled.join(', ')}`);
    } else {
      console.log('Enabled: (none)');
    }
  }
}
