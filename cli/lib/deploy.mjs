import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, run, shellEscape } from './aws.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAMBDA_SRC_DIR = join(__dirname, '..', 'templates', 'lambda');

// BOA packages the Lambda as a zip, uploads it to an SAM-compatible
// artifacts bucket, and passes the S3 location as CloudFormation
// parameters. Replaces `sam build` + `sam deploy` with raw
// CloudFormation so users do not need the SAM CLI installed.

const ARTIFACTS_BUCKET_PREFIX = 'boa-cli-artifacts';

function sleepMs(ms) {
  // Synchronous sleep — deploy is a CLI command, we want to block
  // until the next poll without involving async/await.
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait through a no-op system call so the process stays
    // responsive to SIGINT without spinning at 100% CPU
    const remaining = end - Date.now();
    if (remaining <= 0) break;
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)), 0, 0,
      Math.min(remaining, 250),
    );
  }
}

function accountIdFromSts() {
  return JSON.parse(exec('aws sts get-caller-identity')).Account;
}

export function artifactsBucketName(accountId, region) {
  return `${ARTIFACTS_BUCKET_PREFIX}-${accountId}-${region}`;
}

// Idempotently create the regional artifacts bucket. CloudFormation
// is not involved — the bucket is a CLI-managed durable resource
// shared across every BOA stack in the account and region.
export function ensureArtifactsBucket(region, accountId) {
  const bucket = artifactsBucketName(accountId, region);
  try {
    exec(
      `aws s3api head-bucket --bucket ${shellEscape(bucket)} --region ${shellEscape(region)}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return bucket;
  } catch {
    // Fall through — bucket does not exist yet.
  }
  // us-east-1 rejects LocationConstraint; every other region requires it.
  const locationArg = region === 'us-east-1'
    ? ''
    : `--create-bucket-configuration LocationConstraint=${shellEscape(region)}`;
  exec(
    `aws s3api create-bucket --bucket ${shellEscape(bucket)} --region ${shellEscape(region)} ${locationArg}`
  );
  exec(
    `aws s3api put-public-access-block --bucket ${shellEscape(bucket)} --region ${shellEscape(region)} ` +
    `--public-access-block-configuration ` +
    `"BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`
  );
  return bucket;
}

// Hash the staged lambda directory so repeated deploys that change
// nothing do not upload a new zip.
function hashLambdaDir(lambdaDir) {
  const hash = createHash('sha256');
  const files = listFilesRecursive(lambdaDir).sort();
  for (const f of files) {
    hash.update(f);
    hash.update('\0');
    hash.update(readFileSync(f));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Zip the lambda directory (including node_modules) for upload.
// The `zip` binary is available by default on macOS and every major
// Linux distro; the CLI already requires `aws` and `psql`, so this
// does not add a new user-visible dependency.
export function zipLambda(lambdaDir, destZip) {
  if (!existsSync(lambdaDir)) {
    throw new Error(`lambda directory not found: ${lambdaDir}`);
  }
  if (existsSync(destZip)) rmSync(destZip);
  const destDir = destZip.slice(0, destZip.lastIndexOf('/'));
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  run(
    `cd ${shellEscape(lambdaDir)} && zip -rq ${shellEscape(destZip)} . ` +
    `-x "*.DS_Store" -x "package-lock.json"`
  );
}

// Upload the zip under a content-addressed key so the same contents
// are never uploaded twice.
export function uploadLambdaZip({
  zipPath, bucket, region, contentHash,
}) {
  const key = `lambda/${contentHash}.zip`;
  // If the object already exists, skip the upload.
  try {
    exec(
      `aws s3api head-object --bucket ${shellEscape(bucket)} ` +
      `--key ${shellEscape(key)} --region ${shellEscape(region)}`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { bucket, key, uploaded: false };
  } catch {
    // fall through — needs upload
  }
  run(
    `aws s3 cp ${shellEscape(zipPath)} s3://${bucket}/${key} ` +
    `--region ${shellEscape(region)}`
  );
  return { bucket, key, uploaded: true };
}

// Upload the CloudFormation template body to the artifacts bucket so
// CreateStack can reference it via URL (template bodies over 51 KiB
// must go through S3).
export function uploadTemplate({
  templatePath, bucket, region, stackName,
}) {
  const body = readFileSync(templatePath, 'utf8');
  const hash = createHash('sha256').update(body).digest('hex');
  const key = `templates/${hash}.yaml`;
  run(
    `aws s3 cp ${shellEscape(templatePath)} s3://${bucket}/${key} ` +
    `--region ${shellEscape(region)}`
  );
  return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
}

function stackStatus(stackName, region) {
  try {
    return exec(
      `aws cloudformation describe-stacks --stack-name ${shellEscape(stackName)} ` +
      `--region ${shellEscape(region)} --query 'Stacks[0].StackStatus' --output text`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('does not exist')) return null;
    throw err;
  }
}

function stackExists(stackName, region) {
  return stackStatus(stackName, region) !== null;
}

const TERMINAL_SUCCESS = new Set([
  'CREATE_COMPLETE',
  'UPDATE_COMPLETE',
  'DELETE_COMPLETE',
]);

const TERMINAL_FAILURE = new Set([
  'CREATE_FAILED',
  'ROLLBACK_COMPLETE',
  'ROLLBACK_FAILED',
  'UPDATE_ROLLBACK_COMPLETE',
  'UPDATE_ROLLBACK_FAILED',
  'UPDATE_FAILED',
  'DELETE_FAILED',
]);

// Map CloudFormation logical IDs to user-facing product concepts so
// the deploy reports "Database" instead of "DsqlCluster". Resources
// not in the map are plumbing (IAM roles, permissions, subnets) and
// are hidden from the progress UI entirely.
const CONCEPT_OF = {
  // Base template
  DsqlCluster: 'Database',
  StorageBucket: 'File storage',
  ApiFunctionRole: 'API',
  ApiFunction: 'API',
  Api: 'API',
  ApiProxyPlusResource: 'API',
  ApiRootMethod: 'API',
  ApiProxyPlusMethod: 'API',
  ApiDeployment: 'API',
  ApiprodStage: 'API',
  ApiFunctionProxyRootPermissionprod: 'API',
  ApiFunctionProxyPlusPermissionprod: 'API',
  WafWebAcl: 'Firewall',
  WafApiGatewayAssociation: 'Firewall',
  // ALB extension
  AlbVpc: 'Load balancer',
  InternetGateway: 'Load balancer',
  GatewayAttachment: 'Load balancer',
  PublicSubnet1: 'Load balancer',
  PublicSubnet2: 'Load balancer',
  PublicRouteTable: 'Load balancer',
  PublicRoute: 'Load balancer',
  Subnet1RouteTableAssoc: 'Load balancer',
  Subnet2RouteTableAssoc: 'Load balancer',
  AlbSecurityGroup: 'Load balancer',
  ApplicationLoadBalancer: 'Load balancer',
  AlbLambdaPermission: 'Load balancer',
  AlbTargetGroup: 'Load balancer',
  AlbHttpRedirectListener: 'Load balancer',
  AlbHttpsListener: 'Load balancer',
  WafAlbAssociation: 'Firewall',
};

// Tracks one concept (Database, API, ...). A concept enters
// "in progress" when any mapped resource starts. It completes the
// first time every resource the event stream has mentioned is in a
// terminal *_COMPLETE state. It fails as soon as any mapped resource
// enters a *_FAILED or ROLLBACK_IN_PROGRESS state.
function makeProgressUI() {
  const order = [];         // concept display order, first-seen wins
  const concepts = new Map(); // name -> { ids: Map<id, status>,
                              //           startedAt, completedAt, failureReason,
                              //           printedStart, printedEnd }
  let linesPrinted = 0;
  const isTty = !!process.stdout.isTTY;

  function ensureConcept(name) {
    if (!concepts.has(name)) {
      concepts.set(name, {
        ids: new Map(),
        failureReason: null,
        completed: false,
        printedStart: false,
        printedEnd: false,
      });
      order.push(name);
    }
    return concepts.get(name);
  }

  function isCompleteStatus(s) {
    return s === 'CREATE_COMPLETE' || s === 'UPDATE_COMPLETE';
  }

  function stateOf(c) {
    if (c.failureReason) return 'failed';
    if (c.completed) return 'complete';
    return 'in_progress';
  }

  function renderLine(name) {
    const c = concepts.get(name);
    const s = stateOf(c);
    if (s === 'complete') return `  [✓] ${name}`;
    if (s === 'failed') return `  [✗] ${name}  ${c.failureReason}`.trimEnd();
    return `  [ ] ${name}`;
  }

  function redraw() {
    if (linesPrinted > 0) {
      process.stdout.write(`\x1b[${linesPrinted}A`);
    }
    for (const name of order) {
      process.stdout.write(`\x1b[2K${renderLine(name)}\n`);
    }
    linesPrinted = order.length;
  }

  function appendOnly(name) {
    const c = concepts.get(name);
    if (!c.printedStart) {
      console.log(`  [ ] ${name}`);
      c.printedStart = true;
    }
    if (!c.printedEnd) {
      if (c.failureReason) {
        console.log(`  [✗] ${name}  ${c.failureReason}`.trimEnd());
        c.printedEnd = true;
      } else if (c.completed) {
        console.log(`  [✓] ${name}`);
        c.printedEnd = true;
      }
    }
  }

  function recordEvent(logicalId, status, reason) {
    const name = CONCEPT_OF[logicalId];
    if (!name) return false;
    const c = ensureConcept(name);
    c.ids.set(logicalId, status);
    if (status.endsWith('_FAILED') || status === 'ROLLBACK_IN_PROGRESS') {
      c.failureReason = c.failureReason || reason || status;
    }
    // A concept becomes "complete" the first moment every mapped
    // resource we've observed is in a *_COMPLETE state. Sticky: once
    // completed it does not flip back even if new sibling resources
    // join later.
    if (!c.completed && !c.failureReason) {
      const statuses = [...c.ids.values()];
      if (statuses.length > 0 && statuses.every(isCompleteStatus)) {
        c.completed = true;
      }
    }
    if (isTty) {
      redraw();
    } else {
      appendOnly(name);
    }
    return true;
  }

  return { recordEvent };
}

// Stream per-resource events to the console so the user sees progress
// during the long CloudFormation phase. Each event is seen once; the
// progress UI folds related resources into product concepts.
function drainStackEvents(stackName, region, cutoffIso, seenIds, ui) {
  let events;
  try {
    const out = exec(
      `aws cloudformation describe-stack-events --stack-name ${shellEscape(stackName)} ` +
      `--region ${shellEscape(region)} --max-items 100 --output json`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    events = JSON.parse(out).StackEvents || [];
  } catch {
    return; // stay silent; the poll loop decides when to give up
  }
  // The API returns newest first; flip so we feed the UI in chronological order.
  events.reverse();
  for (const e of events) {
    if (seenIds.has(e.EventId)) continue;
    seenIds.add(e.EventId);
    if (e.Timestamp < cutoffIso) continue;
    ui.recordEvent(
      e.LogicalResourceId,
      e.ResourceStatus || '',
      e.ResourceStatusReason || '',
    );
  }
}

// Poll describe-stacks in-process so the deploy survives transient
// errors that kill `aws cloudformation wait` (intermittent endpoint
// failures, throttling). Retries up to `maxTransientErrors` in a row
// before giving up; polls every 5 s.
function waitForTerminalStatus(stackName, region, opts = {}) {
  const {
    timeoutMs = 30 * 60 * 1000,
    pollIntervalMs = 5_000,
    maxTransientErrors = 5,
    streamEvents = true,
  } = opts;
  const started = Date.now();
  const cutoffIso = new Date(started - 1000).toISOString();
  const seenIds = new Set();
  const ui = streamEvents ? makeProgressUI() : null;
  let transientErrors = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let status;
    try {
      status = stackStatus(stackName, region);
      transientErrors = 0;
    } catch (err) {
      transientErrors += 1;
      if (transientErrors >= maxTransientErrors) throw err;
      // Sleep and retry
      sleepMs(pollIntervalMs);
      continue;
    }
    if (ui && status !== null) {
      drainStackEvents(stackName, region, cutoffIso, seenIds, ui);
    }
    if (status === null) {
      return { status: 'DELETE_COMPLETE' };
    }
    if (TERMINAL_SUCCESS.has(status)) return { status };
    if (TERMINAL_FAILURE.has(status)) {
      const err = new Error(
        `Stack ${stackName} reached terminal failure: ${status}`
      );
      err.isDeployFailure = true;
      err.stackStatus = status;
      throw err;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for stack ${stackName}, last status: ${status}`);
    }
    sleepMs(pollIntervalMs);
  }
}

// Previous `ROLLBACK_COMPLETE` or `REVIEW_IN_PROGRESS` stacks cannot
// be updated — CFN only allows delete. Clean them up silently so a
// retried first deploy does not require the user to run teardown.
function cleanupStalledStack(stackName, region) {
  const status = stackStatus(stackName, region);
  if (status === 'ROLLBACK_COMPLETE' || status === 'REVIEW_IN_PROGRESS') {
    run(
      `aws cloudformation delete-stack --stack-name ${shellEscape(stackName)} ` +
      `--region ${shellEscape(region)}`
    );
    waitForTerminalStatus(stackName, region, { streamEvents: false });
  }
}

function formatParams(params) {
  const entries = Object.entries(params)
    .filter(([, v]) => v != null && v !== '');
  return entries.map(([k, v]) =>
    `ParameterKey=${k},ParameterValue=${shellEscape(String(v))}`
  ).join(' ');
}

// Create or update the CloudFormation stack, waiting for the operation
// to complete. Returns when the stack reaches a terminal state; throws
// on failure so the caller can surface the stack events.
export function deployStack({
  stackName, region, templateUrl, parameters,
}) {
  cleanupStalledStack(stackName, region);
  const exists = stackExists(stackName, region);
  const verb = exists ? 'update-stack' : 'create-stack';
  const paramStr = formatParams(parameters);

  try {
    exec(
      `aws cloudformation ${verb} --stack-name ${shellEscape(stackName)} ` +
      `--region ${shellEscape(region)} --template-url ${shellEscape(templateUrl)} ` +
      `--capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM ` +
      `--parameters ${paramStr}`
    );
  } catch (err) {
    // `update-stack` returns a ValidationError with "No updates are
    // to be performed." when there is nothing to diff — treat that
    // as a successful no-op so `boa deploy` is idempotent.
    const msg = err.message || '';
    if (exists && msg.includes('No updates are to be performed')) {
      return;
    }
    throw err;
  }

  waitForTerminalStatus(stackName, region);
}

export function deleteStack(stackName, region) {
  run(
    `aws cloudformation delete-stack --stack-name ${shellEscape(stackName)} ` +
    `--region ${shellEscape(region)}`
  );
  waitForTerminalStatus(stackName, region);
}

// Stage the Lambda source into the project's build dir, overlaying
// the project's `policies/` directory if present so the Cedar
// policies ship with the function code. This replaces `sam build`'s
// CopySource + NpmInstall (the lambda dir already has node_modules
// installed via ensureLambdaDepsInstalled before this runs).
export function stageLambda(projectDir) {
  const stagingDir = join(projectDir, '.boa', 'build', 'lambda');
  if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });
  cpSync(LAMBDA_SRC_DIR, stagingDir, { recursive: true });
  const policiesDir = join(projectDir, 'policies');
  if (existsSync(policiesDir)) {
    const policyFiles = readdirSync(policiesDir);
    if (policyFiles.length > 0) {
      cpSync(policiesDir, join(stagingDir, 'policies'), { recursive: true });
    }
  }
  return stagingDir;
}

// Package a project for deployment: stage the lambda source, zip it,
// upload both the zip and the CloudFormation template, and return the
// values deployStack() needs.
export function packageArtifacts({
  projectDir, templatePath, region, stackName,
}) {
  const accountId = accountIdFromSts();
  const bucket = ensureArtifactsBucket(region, accountId);
  const lambdaDir = stageLambda(projectDir);
  const zipPath = join(projectDir, '.boa', 'build', 'lambda.zip');
  const contentHash = hashLambdaDir(lambdaDir);
  zipLambda(lambdaDir, zipPath);
  const { key: lambdaKey } = uploadLambdaZip({
    zipPath, bucket, region, contentHash,
  });
  const templateUrl = uploadTemplate({
    templatePath, bucket, region, stackName,
  });
  return { bucket, lambdaKey, templateUrl, accountId };
}
