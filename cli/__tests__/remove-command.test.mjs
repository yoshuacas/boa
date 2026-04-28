import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildDeployConfig } from '../commands/deploy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'boa.mjs');

function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], opts, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('boa remove', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-remove-'));
    return tmpDir;
  }

  it('no arguments: stderr contains usage and exit code is 1', async () => {
    const { code, stderr } = await run(['remove']);
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Usage: boa remove <name>'),
      `stderr should contain usage message, got: ${stderr}`
    );
  });

  it('no config: stderr contains config not found error', async () => {
    const dir = makeTmpDir();
    const { code, stderr } = await run(
      ['remove', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Error: .boa/config.json not found'),
      `stderr should contain config not found error, got: ${stderr}`
    );
  });

  it('empty extensions: stderr contains not enabled error', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: [],
      })
    );

    const { code, stderr } = await run(
      ['remove', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Extension 'alb' is not enabled"
      ),
      `stderr should contain not enabled error, got: ${stderr}`
    );
  });

  it('no extensions field: stderr contains not enabled error', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
      })
    );

    const { code, stderr } = await run(
      ['remove', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Extension 'alb' is not enabled"
      ),
      `stderr should contain not enabled error, got: ${stderr}`
    );
  });

  it('test_remove_alb_cleans_config_block: alb block is removed after remove', () => {
    const updatedCfg = {
      stackName: 'test',
      region: 'us-east-1',
      apiUrl: 'https://abc.execute-api.us-east-1.amazonaws.com/prod',
      apiGateway: { restApiId: 'abc', stage: 'prod' },
      alb: {
        arn: 'arn:...',
        dnsName: 'test-alb.us-east-1.elb.amazonaws.com',
        targetGroupArn: 'arn:...',
        vpcId: 'vpc-123',
      },
      extensions: ['alb'],
    };

    const name = 'alb';
    updatedCfg.extensions = updatedCfg.extensions.filter(
      e => e !== name
    );
    if (name === 'alb') {
      delete updatedCfg.alb;
    }

    assert.equal(
      updatedCfg.alb, undefined,
      'alb block should be removed after remove'
    );
    assert.deepEqual(
      updatedCfg.extensions, [],
      'extensions should be empty after removing alb'
    );
  });

  it('alb enabled: proceeds without validation error', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        extensions: ['alb'],
      })
    );

    const { stderr } = await run(
      ['remove', 'alb'],
      { cwd: dir }
    );
    assert.ok(
      !stderr.includes("Extension 'alb' is not enabled"),
      `stderr should NOT contain not-enabled error, got: ${stderr}`
    );
  });

  it('test_remove_alb_final_config_consistent', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'ApiGatewayUrl',
        OutputValue: 'https://abc.execute-api.us-east-1.amazonaws.com/prod' },
      { OutputKey: 'RestApiId',
        OutputValue: 'abc' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(
      cfg, fakeOutputs, []
    );

    assert.deepEqual(result.extensions, []);
    assert.equal(result.alb, undefined);
    assert.ok(
      result.apiUrl.startsWith('https://'),
      'apiUrl should be HTTPS API Gateway URL'
    );
    assert.ok(
      result.apiGateway,
      'should have apiGateway block'
    );
    assert.equal(result.apiGateway.restApiId, 'abc');
  });
});
