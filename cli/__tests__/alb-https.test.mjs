import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('ALB extension HTTPS (sec H-1)', () => {
  const fragment = readFileSync(
    join(__dirname, '..', 'extensions', 'alb', 'fragment.yaml'),
    'utf8',
  );

  it('declares a CertificateArn parameter', () => {
    assert.match(fragment, /CertificateArn:\s*\n\s*Type:\s*String/);
  });

  it('has an HTTPS:443 listener with a modern SSL policy', () => {
    assert.match(fragment, /Port:\s*443/);
    assert.match(fragment, /Protocol:\s*HTTPS/);
    assert.match(fragment, /SslPolicy:\s*ELBSecurityPolicy-TLS13-1-2-2021-06/);
  });

  it('HTTP:80 is a redirect to HTTPS, not a forward', () => {
    assert.match(fragment, /Port:\s*80/);
    // The 80 listener must declare a redirect action, not forward
    assert.match(fragment, /Type:\s*redirect[\s\S]*?Protocol:\s*HTTPS/);
    // Scope the "port 80 has no forward" check to the block
    // between Port: 80 and the next Listener (or the AlbHttps block).
    const port80Block = fragment.match(
      /AlbHttpRedirectListener[\s\S]*?(?=AlbHttpsListener|\nOutputs:)/,
    );
    assert.ok(port80Block, 'redirect listener block should exist');
    assert.doesNotMatch(port80Block[0], /Type:\s*forward/,
      'port 80 must not forward to any target group');
  });

  it('security group allows 443', () => {
    assert.match(fragment, /FromPort:\s*443/);
    assert.match(fragment, /ToPort:\s*443/);
  });

  it('AlbUrl output is https:// not http://', () => {
    assert.match(
      fragment,
      /Value:\s*!Sub\s*'https:\/\/\$\{ApplicationLoadBalancer\.DNSName\}'/,
    );
  });

  it('has no bare http:// AlbUrl output', () => {
    assert.doesNotMatch(
      fragment,
      /Value:\s*!Sub\s*'http:\/\/\$\{ApplicationLoadBalancer\.DNSName\}'/,
    );
  });
});

describe('boa extend alb requires --certificate-arn', () => {
  const extendSrc = readFileSync(
    join(__dirname, '..', 'commands', 'extend.mjs'),
    'utf8',
  );

  it('parses --certificate-arn flag', () => {
    assert.match(extendSrc, /--certificate-arn/);
  });

  it('errors when alb requested without a cert arn', () => {
    assert.match(extendSrc,
      /name === 'alb'[\s\S]*?!opts\.certificateArn/);
  });

  it('persists the cert arn into config for subsequent deploys', () => {
    assert.match(extendSrc, /cfg\.certificateArn\s*=\s*opts\.certificateArn/);
  });
});
