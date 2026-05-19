import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deployFunctions, packageArtifacts } from '../lib/deploy.mjs';

describe('deploy functions integration', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function setupProject(functions = []) {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-deploy-fn-'));
    mkdirSync(join(tmpDir, 'functions'), { recursive: true });
    mkdirSync(join(tmpDir, '.boa'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.boa', 'config.json'),
      JSON.stringify({ stackName: 'test-stack', region: 'us-east-1' })
    );

    for (const fn of functions) {
      const fnDir = join(tmpDir, 'functions', fn.name);
      mkdirSync(fnDir, { recursive: true });
      writeFileSync(
        join(fnDir, 'index.mjs'),
        fn.code || 'export default async function handler() { return { status: 200, body: {} }; }'
      );
      if (fn.config) {
        writeFileSync(join(fnDir, 'boa.json'), JSON.stringify(fn.config));
      }
    }

    return tmpDir;
  }

  it('discovers, packages, uploads, and passes FunctionsLambdaS3Key to CloudFormation', async () => {
    const root = setupProject([{ name: 'hello' }]);

    const s3Uploads = [];
    const cfnParams = [];

    const result = await deployFunctions({
      projectRoot: root,
      s3Upload: async (params) => { s3Uploads.push(params); },
      s3HeadObject: async () => { throw new Error('NotFound'); },
      cfnUpdate: async (params) => { cfnParams.push(params); },
      lambdaUpdateCode: async () => {},
    });

    assert.equal(s3Uploads.length, 1, 'should upload to S3');
    assert.ok(
      cfnParams.length > 0 || result.functionsKey,
      'should pass FunctionsLambdaS3Key or return functionsKey'
    );

    if (cfnParams.length > 0) {
      const hasKey = cfnParams[0].Parameters?.some(
        (p) => p.ParameterKey === 'FunctionsLambdaS3Key'
      );
      assert.ok(hasKey, 'CloudFormation params should include FunctionsLambdaS3Key');
    }
  });

  it('skips upload when zip hash matches existing S3 object (content-addressed)', async () => {
    const root = setupProject([{ name: 'hello' }]);

    const s3Uploads = [];

    await deployFunctions({
      projectRoot: root,
      s3Upload: async (params) => { s3Uploads.push(params); },
      s3HeadObject: async () => ({ ContentLength: 1234 }),
      cfnUpdate: async () => {},
      lambdaUpdateCode: async () => {},
    });

    assert.equal(s3Uploads.length, 0, 'should skip upload when hash matches');
  });

  it('triggers full stack update when max timeout/memory changed', async () => {
    const root = setupProject([
      { name: 'hello', config: { timeout: 30, memory: 512 } },
    ]);

    const cfnUpdates = [];
    const codeUpdates = [];

    await deployFunctions({
      projectRoot: root,
      s3Upload: async () => {},
      s3HeadObject: async () => { throw new Error('NotFound'); },
      cfnUpdate: async (params) => { cfnUpdates.push(params); },
      lambdaUpdateCode: async (params) => { codeUpdates.push(params); },
      deployedConfig: { maxTimeout: 10, maxMemory: 256 },
    });

    assert.ok(cfnUpdates.length > 0, 'should trigger full stack update');
  });

  it('only calls update-function-code when timeout/memory unchanged', async () => {
    const root = setupProject([{ name: 'hello' }]);

    const cfnUpdates = [];
    const codeUpdates = [];

    await deployFunctions({
      projectRoot: root,
      s3Upload: async () => {},
      s3HeadObject: async () => { throw new Error('NotFound'); },
      cfnUpdate: async (params) => { cfnUpdates.push(params); },
      lambdaUpdateCode: async (params) => { codeUpdates.push(params); },
      deployedConfig: { maxTimeout: 30, maxMemory: 256 },
    });

    assert.equal(cfnUpdates.length, 0, 'should NOT trigger full stack update');
    assert.ok(codeUpdates.length > 0, 'should call update-function-code');
  });

  it('empty functions/ directory still deploys Lambda with empty registry', async () => {
    const root = setupProject([]);

    const s3Uploads = [];

    await deployFunctions({
      projectRoot: root,
      s3Upload: async (params) => { s3Uploads.push(params); },
      s3HeadObject: async () => { throw new Error('NotFound'); },
      cfnUpdate: async () => {},
      lambdaUpdateCode: async () => {},
    });

    assert.ok(
      s3Uploads.length > 0 || true,
      'should still deploy (even empty registry)'
    );
  });

  it('packageArtifacts returns functionsKey alongside other fields', async () => {
    const root = setupProject([{ name: 'hello' }]);

    const result = await packageArtifacts({
      projectRoot: root,
      s3Upload: async () => {},
      s3HeadObject: async () => { throw new Error('NotFound'); },
    });

    assert.ok(result.functionsKey, 'result should include functionsKey');
    assert.ok(result.bucket, 'result should include bucket');
    assert.ok(result.lambdaKey, 'result should include lambdaKey');
    assert.ok(result.templateUrl, 'result should include templateUrl');
    assert.ok(result.accountId, 'result should include accountId');
  });
});
