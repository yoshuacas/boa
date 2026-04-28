import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  mkdtempSync, mkdirSync, writeFileSync,
  readFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { mergeTemplate } from '../lib/extensions.mjs';
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

describe('boa extend', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function makeTmpDir() {
    tmpDir = mkdtempSync(join(tmpdir(), 'boa-extend-'));
    return tmpDir;
  }

  it('no arguments: stderr contains usage and exit code is 1', async () => {
    const { code, stderr } = await run(['extend']);
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Usage: boa extend <name>'),
      `stderr should contain usage message, got: ${stderr}`
    );
  });

  it('no arguments: stderr contains hint to list extensions', async () => {
    const { stderr } = await run(['extend']);
    assert.ok(
      stderr.includes(
        "Run 'boa extensions' to see available extensions."
      ),
      `stderr should contain extensions hint, got: ${stderr}`
    );
  });

  it('no config: stderr contains config not found error', async () => {
    const dir = makeTmpDir();
    const { code, stderr } = await run(
      ['extend', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes('Error: .boa/config.json not found'),
      `stderr should contain config not found error, got: ${stderr}`
    );
  });

  it('unknown extension: stderr contains unknown extension error', async () => {
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
      ['extend', 'unknown-ext'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes("Error: Unknown extension 'unknown-ext'"),
      `stderr should contain unknown extension error, got: ${stderr}`
    );
  });

  it('already enabled: stderr contains already enabled error', async () => {
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

    const { code, stderr } = await run(
      ['extend', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 1, 'exit code should be 1');
    assert.ok(
      stderr.includes(
        "Error: Extension 'alb' is already enabled"
      ),
      `stderr should contain already enabled error, got: ${stderr}`
    );
  });

  it('deprecated api-gateway alias: prints default message and exits 0', async () => {
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

    const { code, stdout } = await run(
      ['extend', 'api-gateway'],
      { cwd: dir }
    );
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes(
        'api-gateway is now the default traffic layer'
      ),
      `stdout should contain default message, got: ${stdout}`
    );
    assert.ok(
      stdout.includes('No action needed'),
      `stdout should contain "No action needed", got: ${stdout}`
    );
  });

  it('test_extend_alb_writes_merged_template: merged template has ALB, no API Gateway', () => {
    const merged = mergeTemplate(['alb']);
    assert.ok(
      merged.includes('ElasticLoadBalancingV2::LoadBalancer'),
      'merged template should contain ALB'
    );
    assert.ok(
      !merged.includes('AWS::Serverless::Api'),
      'merged template should NOT contain API Gateway'
    );
  });

  it('test_extend_alb_legacy_writes_template_yaml: legacy shortcut writes merged template', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        alb: {
          arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test/abc',
          dnsName: 'test-alb-123.us-east-1.elb.amazonaws.com',
          targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test/def',
          vpcId: 'vpc-abc123',
        },
        extensions: [],
      })
    );

    const { code } = await run(
      ['extend', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 0, 'exit code should be 0');

    assert.ok(
      existsSync(join(boaDir, 'template.yaml')),
      '.boa/template.yaml should exist after legacy shortcut'
    );

    const template = readFileSync(
      join(boaDir, 'template.yaml'), 'utf8'
    );
    assert.ok(
      template.includes(
        'ElasticLoadBalancingV2::LoadBalancer'
      ),
      'template should contain ALB resource'
    );
  });

  it('legacy ALB project: adds alb to extensions and exits 0', async () => {
    const dir = makeTmpDir();
    const boaDir = join(dir, '.boa');
    mkdirSync(boaDir, { recursive: true });
    writeFileSync(
      join(boaDir, 'config.json'),
      JSON.stringify({
        stackName: 'test',
        region: 'us-east-1',
        alb: {
          arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test/abc',
          dnsName: 'test-alb-123.us-east-1.elb.amazonaws.com',
          targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test/def',
          vpcId: 'vpc-abc123',
        },
        extensions: [],
      })
    );

    const { code, stdout } = await run(
      ['extend', 'alb'],
      { cwd: dir }
    );
    assert.equal(code, 0, 'exit code should be 0');
    assert.ok(
      stdout.includes(
        'This project already uses ALB (legacy default).'
      ),
      `stdout should indicate legacy ALB, got: ${stdout}`
    );

    const updatedCfg = JSON.parse(
      readFileSync(join(boaDir, 'config.json'), 'utf8')
    );
    assert.ok(
      updatedCfg.extensions.includes('alb'),
      'extensions should now include alb'
    );
  });

  it('test_extend_alb_config_consistency', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'AlbUrl',
        OutputValue: 'http://my-alb.example.com' },
      { OutputKey: 'AlbArn',
        OutputValue: 'arn:aws:elbv2:...:lb/app/test/abc' },
      { OutputKey: 'TargetGroupArn',
        OutputValue: 'arn:aws:elbv2:...:tg/test/def' },
      { OutputKey: 'VpcId', OutputValue: 'vpc-abc123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const result = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );
    assert.equal(
      result.alb.arn,
      'arn:aws:elbv2:...:lb/app/test/abc'
    );
    assert.equal(
      result.alb.dnsName, 'my-alb.example.com'
    );
    assert.equal(
      result.alb.targetGroupArn,
      'arn:aws:elbv2:...:tg/test/def'
    );
    assert.equal(result.alb.vpcId, 'vpc-abc123');
    assert.equal(
      result.apiUrl, 'http://my-alb.example.com'
    );
    assert.equal(result.apiGateway, undefined);
  });

  it('test_extend_deploy_config_writes_consistent', () => {
    const cfg = {
      stackName: 'test', region: 'us-east-1',
      accountId: '123', anonKey: 'k', serviceRoleKey: 'k',
    };
    const fakeOutputs = [
      { OutputKey: 'AlbUrl',
        OutputValue: 'http://my-alb.example.com' },
      { OutputKey: 'AlbArn',
        OutputValue: 'arn:aws:elbv2:...:lb' },
      { OutputKey: 'TargetGroupArn',
        OutputValue: 'arn:aws:elbv2:...:tg' },
      { OutputKey: 'VpcId', OutputValue: 'vpc-123' },
      { OutputKey: 'BucketName', OutputValue: 'bucket' },
      { OutputKey: 'DsqlEndpoint', OutputValue: 'ep' },
    ];

    const r1 = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );
    const r2 = buildDeployConfig(
      cfg, fakeOutputs, ['alb']
    );

    delete r1.deployedAt;
    delete r2.deployedAt;
    assert.deepEqual(r1, r2,
      'two calls with same inputs produce same output'
    );
  });
});
