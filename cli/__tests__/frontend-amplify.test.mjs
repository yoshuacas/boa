import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createApp,
  createBranch,
  startDeployment,
  waitForDeployment,
  getApp,
  deleteApp,
  attachDomain,
} from '../lib/amplify.mjs';

let tmp;
let origPath;
let callLog;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'boa-amplify-'));
  mkdirSync(join(tmp, 'bin'), { recursive: true });
  origPath = process.env.PATH;
  callLog = join(tmp, 'calls.log');

  const fakeAws = `#!/bin/sh
echo "$@" >> "${callLog}"
case "$@" in
  *create-app*)
    echo '{"app":{"appId":"app-001","defaultDomain":"main.app-001.amplifyapp.com"}}'
    ;;
  *create-branch*)
    echo '{"branch":{"branchName":"main"}}'
    ;;
  *create-deployment*)
    echo '{"jobId":"job-42","zipUploadUrl":"https://s3.example.com/upload"}'
    ;;
  *start-deployment*)
    echo '{"jobSummary":{"jobId":"job-99","status":"PENDING","jobType":"RELEASE","startTime":"2026-01-01T00:00:00Z"}}'
    ;;
  *get-job*timeout*)
    echo '{"job":{"summary":{"status":"RUNNING"}}}'
    ;;
  *get-job*job2*)
    COUNT_FILE="${tmp}/poll_count"
    if [ -f "$COUNT_FILE" ]; then
      echo '{"job":{"summary":{"status":"SUCCEED","endTime":"2026-01-01T00:00:00Z"}}}'
    else
      touch "$COUNT_FILE"
      echo '{"job":{"summary":{"status":"RUNNING"}}}'
    fi
    ;;
  *get-job*)
    echo '{"job":{"summary":{"status":"SUCCEED","endTime":"2026-01-01T00:00:00Z"}}}'
    ;;
  *get-app*nonexistent*)
    echo "NotFoundException: App not found" >&2
    exit 1
    ;;
  *get-app*)
    echo '{"app":{"appId":"abc123","name":"myapp"}}'
    ;;
  *delete-app*)
    echo '{"app":{"appId":"abc123"}}'
    ;;
  *create-domain-association*)
    echo '{"domainAssociation":{"domainName":"app.example.dev","certificateVerificationDNSRecord":"_verify CNAME abc.acm-validations.aws"}}'
    ;;
  *)
    echo '{}'
    ;;
esac
`;
  writeFileSync(join(tmp, 'bin', 'aws'), fakeAws, { mode: 0o755 });

  const fakeCurl = `#!/bin/sh
echo "curl $@" >> "${callLog}"
`;
  writeFileSync(join(tmp, 'bin', 'curl'), fakeCurl, { mode: 0o755 });

  process.env.PATH = join(tmp, 'bin') + ':' + process.env.PATH;
});

afterEach(() => {
  process.env.PATH = origPath;
  rmSync(tmp, { recursive: true, force: true });
});

function readCalls() {
  try {
    return readFileSync(callLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

describe('amplify module', () => {
  describe('createApp', () => {
    it('invokes aws amplify create-app with name and region', () => {
      createApp({ name: 'myapp-web', region: 'us-east-2' });
      const calls = readCalls();
      const cmd = calls.find((c) => c.includes('create-app'));
      assert.ok(cmd, 'expected create-app command');
      assert.ok(cmd.includes('--name'), 'expected --name flag');
      assert.ok(cmd.includes('--region'), 'expected --region flag');
      assert.ok(cmd.includes('us-east-2'), 'expected region value');
    });

    it('returns appId and defaultDomain from response', () => {
      const result = createApp({ name: 'myapp-web', region: 'us-east-2' });
      assert.equal(result.appId, 'app-001');
      assert.equal(result.defaultDomain, 'main.app-001.amplifyapp.com');
    });
  });

  describe('createBranch', () => {
    it('invokes aws amplify create-branch with appId and branch', () => {
      createBranch({ appId: 'abc123', branch: 'main', region: 'us-east-1' });
      const calls = readCalls();
      const cmd = calls.find((c) => c.includes('create-branch'));
      assert.ok(cmd, 'expected create-branch command');
      assert.ok(cmd.includes('--app-id'), 'expected --app-id flag');
      assert.ok(cmd.includes('abc123'), 'expected appId value');
      assert.ok(cmd.includes('--branch-name'), 'expected --branch-name flag');
      assert.ok(cmd.includes('main'), 'expected branch value');
    });
  });

  describe('startDeployment', () => {
    it('calls create-deployment first to get uploadUrl and jobId', () => {
      startDeployment({ appId: 'abc123', branch: 'main', sourceUrl: '/tmp/build.zip', region: 'us-east-1' });
      const calls = readCalls();
      const idx = calls.findIndex((c) => c.includes('create-deployment'));
      assert.ok(idx >= 0, 'expected create-deployment call');
    });

    it('uploads zip to presigned URL via PUT', () => {
      startDeployment({ appId: 'abc123', branch: 'main', sourceUrl: '/tmp/build.zip', region: 'us-east-1' });
      const calls = readCalls();
      const curlCmd = calls.find((c) => c.includes('curl'));
      assert.ok(curlCmd, 'expected curl PUT upload');
      assert.ok(curlCmd.includes('PUT'), 'expected PUT method');
      assert.ok(curlCmd.includes('application/zip'), 'expected Content-Type');
    });

    it('calls start-deployment after upload', () => {
      startDeployment({ appId: 'abc123', branch: 'main', sourceUrl: '/tmp/build.zip', region: 'us-east-1' });
      const calls = readCalls();
      const createIdx = calls.findIndex((c) => c.includes('create-deployment'));
      const startIdx = calls.findIndex((c) => c.includes('start-deployment'));
      assert.ok(startIdx > createIdx, 'expected start-deployment after create-deployment');
    });

    it('returns jobId and appId', () => {
      const result = startDeployment({ appId: 'abc123', branch: 'main', sourceUrl: '/tmp/build.zip', region: 'us-east-1' });
      assert.equal(result.jobId, 'job-42');
      assert.equal(result.appId, 'abc123');
    });
  });

  describe('waitForDeployment', () => {
    it('returns immediately when status is SUCCEED', () => {
      const result = waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'job1', region: 'us-east-1' });
      assert.equal(result.status, 'SUCCEED');
    });

    it('polls until terminal state', () => {
      const result = waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'job2', region: 'us-east-1' });
      assert.equal(result.status, 'SUCCEED');
      const calls = readCalls();
      const getJobCalls = calls.filter((c) => c.includes('get-job'));
      assert.ok(getJobCalls.length >= 2, 'expected multiple polls');
    });

    it('throws on timeout after 120s', () => {
      const origDateNow = Date.now;
      let callCount = 0;
      Date.now = () => {
        callCount++;
        if (callCount <= 1) return 0;
        return 200_000;
      };
      try {
        assert.throws(
          () => waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'timeout', region: 'us-east-1' }),
          /timed out/i
        );
      } finally {
        Date.now = origDateNow;
      }
    });
  });

  describe('getApp', () => {
    it('returns app object for valid appId', () => {
      const result = getApp({ appId: 'abc123', region: 'us-east-1' });
      assert.ok(result !== null);
      assert.equal(result.appId, 'abc123');
    });

    it('returns null for non-existent appId', () => {
      const result = getApp({ appId: 'nonexistent', region: 'us-east-1' });
      assert.equal(result, null);
    });
  });

  describe('deleteApp', () => {
    it('invokes aws amplify delete-app with appId', () => {
      deleteApp({ appId: 'abc123', region: 'us-east-1' });
      const calls = readCalls();
      const cmd = calls.find((c) => c.includes('delete-app'));
      assert.ok(cmd, 'expected delete-app command');
      assert.ok(cmd.includes('--app-id'), 'expected --app-id flag');
      assert.ok(cmd.includes('abc123'), 'expected appId value');
    });
  });

  describe('attachDomain', () => {
    it('invokes create-domain-association with domain and sub-domain mapping', () => {
      attachDomain({ appId: 'abc123', domain: 'app.example.dev', branch: 'main', region: 'us-east-1' });
      const calls = readCalls();
      const cmd = calls.find((c) => c.includes('create-domain-association'));
      assert.ok(cmd, 'expected create-domain-association command');
      assert.ok(cmd.includes('--domain-name'), 'expected --domain-name flag');
      assert.ok(cmd.includes('app.example.dev'), 'expected domain value');
      assert.ok(cmd.includes('--sub-domain-settings'), 'expected --sub-domain-settings flag');
    });
  });
});
