import { execSync } from 'node:child_process';
import { shellEscape } from './aws.mjs';

function run(cmd) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out;
  } catch (err) {
    const msg = err.stderr ? err.stderr.trim() : err.message;
    if (msg.includes('BadRequestException')) {
      throw new Error(`App already exists: ${msg}`);
    }
    throw new Error(msg);
  }
}

function runJson(cmd) {
  return JSON.parse(run(cmd));
}

export function createApp({ name, region }) {
  const resp = runJson(
    `aws amplify create-app --name ${shellEscape(name)} --region ${shellEscape(region)} --output json`
  );
  const app = resp.app;
  return { appId: app.appId, defaultDomain: app.defaultDomain };
}

export function createBranch({ appId, branch = 'main', region }) {
  runJson(
    `aws amplify create-branch --app-id ${shellEscape(appId)} --branch-name ${shellEscape(branch)} --region ${shellEscape(region)} --output json`
  );
  return { appId, branch };
}

export function startDeployment({ appId, branch = 'main', sourceUrl, region }) {
  const deployResp = runJson(
    `aws amplify create-deployment --app-id ${shellEscape(appId)} --branch-name ${shellEscape(branch)} --region ${shellEscape(region)} --output json`
  );
  const { jobId, zipUploadUrl } = deployResp;

  run(
    `curl -s -X PUT -H "Content-Type: application/zip" --data-binary @${shellEscape(sourceUrl)} ${shellEscape(zipUploadUrl)}`
  );

  runJson(
    `aws amplify start-deployment --app-id ${shellEscape(appId)} --branch-name ${shellEscape(branch)} --job-id ${shellEscape(jobId)} --region ${shellEscape(region)} --output json`
  );

  return { jobId, appId };
}

export function waitForDeployment({ appId, branch = 'main', jobId, region }) {
  const timeoutMs = 120_000;
  const pollMs = 5_000;
  const started = Date.now();

  while (true) {
    const resp = runJson(
      `aws amplify get-job --app-id ${shellEscape(appId)} --branch-name ${shellEscape(branch)} --job-id ${shellEscape(jobId)} --region ${shellEscape(region)} --output json`
    );
    const status = resp.job.summary.status;
    if (status === 'SUCCEED' || status === 'FAILED') {
      return { status, endTime: resp.job.summary.endTime };
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error('Deployment timed out after 120 seconds');
    }
    sleepMs(pollMs);
  }
}

export function deleteApp({ appId, region }) {
  runJson(
    `aws amplify delete-app --app-id ${shellEscape(appId)} --region ${shellEscape(region)} --output json`
  );
  return { appId };
}

export function attachDomain({ appId, domain, branch = 'main', region }) {
  const resp = runJson(
    `aws amplify create-domain-association --app-id ${shellEscape(appId)} --domain-name ${shellEscape(domain)} --sub-domain-settings prefix=,branchName=${shellEscape(branch)} --region ${shellEscape(region)} --output json`
  );
  return resp.domainAssociation;
}

export function getApp({ appId, region }) {
  try {
    const resp = runJson(
      `aws amplify get-app --app-id ${shellEscape(appId)} --region ${shellEscape(region)} --output json`
    );
    return resp.app;
  } catch {
    return null;
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
