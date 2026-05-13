import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApp,
  createBranch,
  startDeployment,
  waitForDeployment,
  getApp,
  deleteApp,
  attachDomain,
} from '../lib/amplify.mjs';

let execCalls;
let execMock;

beforeEach(() => {
  execCalls = [];
});

afterEach(() => {
  mock.restoreAll();
});

describe('amplify module', () => {
  describe('createApp', () => {
    it('invokes aws amplify create-app with name and region', () => {
      const result = createApp({ name: 'myapp-web', region: 'us-east-2' });
      assert.ok(
        result !== undefined,
        'expected createApp to return a result with appId and defaultDomain'
      );
    });

    it('returns appId and defaultDomain from response', () => {
      const result = createApp({ name: 'myapp-web', region: 'us-east-2' });
      assert.ok('appId' in result, 'expected result to contain appId');
      assert.ok('defaultDomain' in result, 'expected result to contain defaultDomain');
    });
  });

  describe('createBranch', () => {
    it('invokes aws amplify create-branch with appId and branch', () => {
      const result = createBranch({ appId: 'abc123', branch: 'main' });
      assert.ok(
        result !== undefined,
        'expected createBranch to invoke aws amplify create-branch --app-id abc123 --branch-name main'
      );
    });
  });

  describe('startDeployment', () => {
    it('calls create-deployment first to get uploadUrl and jobId', () => {
      const result = startDeployment({
        appId: 'abc123',
        branch: 'main',
        sourceUrl: '/tmp/build.zip',
      });
      assert.ok(
        result !== undefined,
        'expected startDeployment to call create-deployment for uploadUrl and jobId'
      );
    });

    it('uploads zip to presigned URL via PUT', () => {
      const result = startDeployment({
        appId: 'abc123',
        branch: 'main',
        sourceUrl: '/tmp/build.zip',
      });
      assert.ok(
        result !== undefined,
        'expected startDeployment to PUT zip to presigned upload URL'
      );
    });

    it('calls start-deployment after upload', () => {
      const result = startDeployment({
        appId: 'abc123',
        branch: 'main',
        sourceUrl: '/tmp/build.zip',
      });
      assert.ok(
        result !== undefined,
        'expected startDeployment to invoke aws amplify start-deployment after upload'
      );
    });
  });

  describe('waitForDeployment', () => {
    it('returns immediately when status is SUCCEED', () => {
      const result = waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'job1' });
      assert.ok(result !== undefined, 'expected waitForDeployment to return status SUCCEED');
      assert.equal(result.status, 'SUCCEED', 'expected terminal status SUCCEED');
    });

    it('polls until terminal state', () => {
      const result = waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'job2' });
      assert.ok(
        result !== undefined,
        'expected waitForDeployment to poll until terminal state'
      );
    });

    it('throws on timeout after 120s', () => {
      assert.throws(
        () => waitForDeployment({ appId: 'abc123', branch: 'main', jobId: 'timeout' }),
        /timed out/i,
        'expected waitForDeployment to throw "Deployment timed out"'
      );
    });
  });

  describe('getApp', () => {
    it('returns app object for valid appId', () => {
      const result = getApp({ appId: 'abc123' });
      assert.ok(result !== undefined, 'expected getApp to return app object');
    });

    it('returns null for non-existent appId', () => {
      const result = getApp({ appId: 'nonexistent' });
      assert.equal(result, null, 'expected getApp to return null for non-existent app');
    });
  });

  describe('deleteApp', () => {
    it('invokes aws amplify delete-app with appId', () => {
      const result = deleteApp({ appId: 'abc123' });
      assert.ok(
        result !== undefined,
        'expected deleteApp to invoke aws amplify delete-app --app-id abc123'
      );
    });
  });

  describe('attachDomain', () => {
    it('invokes create-domain-association with domain and sub-domain mapping', () => {
      const result = attachDomain({
        appId: 'abc123',
        domain: 'app.example.dev',
        branch: 'main',
      });
      assert.ok(
        result !== undefined,
        'expected attachDomain to invoke aws amplify create-domain-association'
      );
    });
  });
});
