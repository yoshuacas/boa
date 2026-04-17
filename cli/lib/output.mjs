export function ok(msg) {
  console.log(`  [OK] ${msg}`);
}

export function pass(msg) {
  console.log(`  [PASS] ${msg}`);
}

export function fail(msg) {
  console.log(`  [FAIL] ${msg}`);
}

export function skip(msg) {
  console.log(`  [skip] ${msg}`);
}

export function error(msg) {
  console.error(`Error: ${msg}`);
}

export function header(title) {
  console.log('======================================');
  console.log(`  ${title}`);
  console.log('======================================');
}
