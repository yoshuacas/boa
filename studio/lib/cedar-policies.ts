// Server-only: read/write Cedar policy files.
// In local mode: reads/writes from the project's policies/ directory on disk.
// In cloud mode: reads from the live Lambda zip; writes go through the deploy endpoint.
import fs from 'fs/promises';
import path from 'path';
import { parseCedar } from './cedar-policies-client';
import { isCloud } from './studio-mode';
import type { BoaConfig } from '@/types/boa';

export type { PolicyFile, PolicySummary, PolicyRule } from './cedar-policies-client';
export { parseCedar } from './cedar-policies-client';

import type { PolicyFile } from './cedar-policies-client';

// ── Disk helpers (local mode) ──────────────────────────────────────────────────

function getPoliciesDir(projectRoot: string): string {
  return path.join(projectRoot, 'policies');
}

async function listPoliciesFromDisk(projectRoot: string): Promise<PolicyFile[]> {
  if (!projectRoot) return [];
  const dir = getPoliciesDir(projectRoot);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const cedarFiles = files.filter(f => f.endsWith('.cedar')).sort();
  const results: PolicyFile[] = [];
  for (const filename of cedarFiles) {
    const content = await fs.readFile(path.join(dir, filename), 'utf-8');
    results.push({ filename, content, summary: parseCedar(content) });
  }
  return results;
}

async function readPolicyFromDisk(projectRoot: string, filename: string): Promise<PolicyFile | null> {
  if (!projectRoot) return null;
  const safe = sanitizeFilename(filename);
  if (!safe) return null;
  const dir = getPoliciesDir(projectRoot);
  try {
    const content = await fs.readFile(path.join(dir, safe), 'utf-8');
    return { filename: safe, content, summary: parseCedar(content) };
  } catch {
    return null;
  }
}

// ── Lambda zip helpers (cloud mode) ───────────────────────────────────────────

async function getLambdaZip(cfg: BoaConfig): Promise<Buffer | null> {
  // Lazy imports so these heavy modules don't load in local mode.
  const { getStackFunctions } = await import('./stack-functions');
  const { getAwsClients } = await import('./aws-clients');
  const { GetFunctionCommand } = await import('@aws-sdk/client-lambda');

  let apiFunctionName: string;
  try {
    const fns = await getStackFunctions(cfg);
    const apiFn = fns.find(f => f.kind === 'api');
    if (!apiFn) return null;
    apiFunctionName = apiFn.physicalId;
  } catch {
    return null;
  }

  const { lambda } = getAwsClients(cfg);
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: apiFunctionName }));
  const codeUrl = fn.Code?.Location;
  if (!codeUrl) return null;

  const resp = await fetch(codeUrl);
  if (!resp.ok) return null;
  return Buffer.from(await resp.arrayBuffer());
}

async function listPoliciesFromLambda(cfg: BoaConfig): Promise<PolicyFile[]> {
  const AdmZip = (await import('adm-zip')).default;

  const zipBuffer = await getLambdaZip(cfg);
  if (!zipBuffer) return [];

  const zip = new AdmZip(zipBuffer);
  const results: PolicyFile[] = [];

  for (const entry of zip.getEntries()) {
    if (
      entry.entryName.startsWith('policies/') &&
      entry.entryName.endsWith('.cedar') &&
      !entry.isDirectory
    ) {
      const filename = path.basename(entry.entryName);
      const content = entry.getData().toString('utf-8');
      results.push({ filename, content, summary: parseCedar(content) });
    }
  }

  return results.sort((a, b) => a.filename.localeCompare(b.filename));
}

async function readPolicyFromLambda(cfg: BoaConfig, filename: string): Promise<PolicyFile | null> {
  const safe = sanitizeFilename(filename);
  if (!safe) return null;

  const AdmZip = (await import('adm-zip')).default;
  const zipBuffer = await getLambdaZip(cfg);
  if (!zipBuffer) return null;

  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntry(`policies/${safe}`);
  if (!entry) return null;

  const content = entry.getData().toString('utf-8');
  return { filename: safe, content, summary: parseCedar(content) };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function listPolicies(cfg: BoaConfig, projectRoot: string): Promise<PolicyFile[]> {
  if (isCloud()) return listPoliciesFromLambda(cfg);
  return listPoliciesFromDisk(projectRoot);
}

export async function readPolicy(cfg: BoaConfig, projectRoot: string, filename: string): Promise<PolicyFile | null> {
  if (isCloud()) return readPolicyFromLambda(cfg, filename);
  return readPolicyFromDisk(projectRoot, filename);
}

export async function writePolicy(projectRoot: string, filename: string, content: string): Promise<void> {
  const safe = sanitizeFilename(filename);
  if (!safe) throw new Error('Invalid filename');
  const dir = getPoliciesDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safe), content, 'utf-8');
}

export async function deletePolicy(projectRoot: string, filename: string): Promise<void> {
  const safe = sanitizeFilename(filename);
  if (!safe) throw new Error('Invalid filename');
  const dir = getPoliciesDir(projectRoot);
  await fs.unlink(path.join(dir, safe));
}

function sanitizeFilename(filename: string): string | null {
  const base = path.basename(filename);
  if (!/^[a-zA-Z0-9_\-.]+\.cedar$/.test(base)) return null;
  return base;
}
