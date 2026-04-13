export const REPO_URL = 'https://github.com/yoshuacas/boa';
export const REPO_RAW_URL = 'https://raw.githubusercontent.com/yoshuacas/boa/main';

export const DSQL_REGIONS = ['us-east-1', 'us-east-2'];

export const TOOLS = [
  { name: 'aws',  cmd: 'aws --version' },
  { name: 'sam',  cmd: 'sam --version' },
  { name: 'node', cmd: 'node --version' },
  { name: 'psql', cmd: 'psql --version' },
  { name: 'jq',   cmd: 'jq --version' },
];

export function getOutputValue(outputs, key) {
  const entry = outputs.find((o) => o.OutputKey === key);
  return entry ? entry.OutputValue : null;
}
