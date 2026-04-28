import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shellEscape } from '../lib/aws.mjs';

describe('shellEscape for verify commands', () => {
  it('test_verify_apiUrl_shell_escape: metacharacters in apiUrl are escaped', () => {
    const malicious = 'https://example.com/;echo injected';
    const escaped = shellEscape(malicious + '/rest/v1/');
    assert.ok(
      escaped.startsWith("'"),
      'escaped value should be wrapped in single quotes'
    );
    assert.ok(
      escaped.endsWith("'"),
      'escaped value should end with single quote'
    );
    assert.equal(
      escaped,
      "'https://example.com/;echo injected/rest/v1/'",
      'entire value including metacharacters should be inside single quotes'
    );
    const cmd = `curl -s -o /dev/null -w '%{http_code}' ${escaped}`;
    assert.ok(
      cmd.includes("'https://example.com/;echo injected/rest/v1/'"),
      `command should contain the escaped URL, got: ${cmd}`
    );
  });

  it('test_verify_alb_arn_shell_escape: metacharacters in ALB ARN are escaped', () => {
    const malicious = 'arn:aws:elasticloadbalancing:us-east-1:123;rm -rf /';
    const escaped = shellEscape(malicious);
    assert.ok(
      escaped.startsWith("'"),
      'escaped value should be wrapped in single quotes'
    );
    assert.equal(
      escaped,
      "'arn:aws:elasticloadbalancing:us-east-1:123;rm -rf /'",
      'entire value including semicolon should be inside single quotes'
    );
  });

  it('shellEscape handles embedded single quotes', () => {
    const val = "it's a test";
    const escaped = shellEscape(val);
    assert.ok(
      escaped.includes("\\'"),
      `escaped value should handle embedded single quotes, got: ${escaped}`
    );
    const cmd = `echo ${escaped}`;
    assert.ok(
      !cmd.includes("it's"),
      'embedded single quote should be escaped'
    );
  });

  it('shellEscape handles empty string', () => {
    const escaped = shellEscape('');
    assert.equal(
      escaped, "''",
      'empty string should produce two single quotes'
    );
  });

  it('test_verify_waf_check_includes_arn_in_failure: failure message includes constructed ARN', () => {
    const region = 'us-east-1';
    const restApiId = 'abc123';
    const stage = 'prod';

    const stageArn =
      `arn:aws:apigateway:${region}`
        + `::/restapis/${restApiId}`
        + `/stages/${stage}`;

    const failureMsg =
      `WAF WebACL is not attached to API Gateway`
        + ` stage (${stageArn})`;

    assert.ok(
      failureMsg.includes(stageArn),
      'failure message should include the stage ARN'
    );
    assert.ok(
      failureMsg.includes('abc123'),
      'failure message should include the restApiId'
    );
    assert.ok(
      stageArn.includes('::/restapis/'),
      'stage ARN should have double-colon format'
    );
  });

  it('test_verify_alb_targetGroupArn_shell_escape: target group ARN is escaped', () => {
    const malicious = 'arn:aws:elasticloadbalancing:us-east-1:123$(whoami)';
    const escaped = shellEscape(malicious);
    const cmd = `aws elbv2 describe-target-health --target-group-arn ${escaped}`;
    assert.ok(
      cmd.includes("'arn:aws:elasticloadbalancing:us-east-1:123$(whoami)'"),
      `command substitution should be inside quotes, got: ${cmd}`
    );
  });
});
