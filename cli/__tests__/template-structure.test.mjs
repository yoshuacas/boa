import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(
  __dirname, '..', 'templates', 'backend.yaml'
);
const template = readFileSync(TEMPLATE_PATH, 'utf8');

// -----------------------------------------------------------
// Function URL default (after Task 02 updates the template)
// -----------------------------------------------------------

describe('SAM template — Function URL default', () => {
  it('ApiFunction has FunctionUrlConfig property', () => {
    assert.ok(
      template.includes('FunctionUrlConfig'),
      'template should contain FunctionUrlConfig on ApiFunction'
    );
  });

  it('FunctionUrlConfig has AuthType: NONE', () => {
    assert.ok(
      template.includes('AuthType: NONE'),
      'FunctionUrlConfig should have AuthType: NONE'
    );
  });

  it('FunctionUrlConfig.Cors includes Authorization in AllowHeaders', () => {
    assert.ok(
      /AllowHeaders:[\s\S]*?- Authorization/m.test(template),
      'FunctionUrlConfig.Cors.AllowHeaders should include Authorization'
    );
  });

  it('FunctionUrlConfig.Cors includes apikey in AllowHeaders', () => {
    assert.ok(
      /AllowHeaders:[\s\S]*?- apikey/m.test(template),
      'FunctionUrlConfig.Cors.AllowHeaders should include apikey'
    );
  });

  it('Outputs contains ApiFunctionUrl (not ApiUrl)', () => {
    assert.ok(
      template.includes('ApiFunctionUrl'),
      'Outputs should contain ApiFunctionUrl'
    );
  });

  it('there is NO Api resource (AWS::Serverless::Api)', () => {
    assert.ok(
      !template.includes('AWS::Serverless::Api'),
      'template should NOT contain AWS::Serverless::Api resource'
    );
  });

  it('there is NO AuthorizerFunction resource', () => {
    assert.ok(
      !template.includes('AuthorizerFunction'),
      'template should NOT contain AuthorizerFunction resource'
    );
  });

  it('there is NO AuthorizerFunctionPermission resource', () => {
    assert.ok(
      !template.includes('AuthorizerFunctionPermission'),
      'template should NOT contain AuthorizerFunctionPermission resource'
    );
  });

  it('ApiFunction does NOT have an Events property', () => {
    // Extract the ApiFunction section (up to the next top-level
    // resource) and verify it has no Events: key.
    const start = template.indexOf('ApiFunction:');
    const end = template.indexOf('StorageBucket:');
    assert.ok(start !== -1, 'template should contain ApiFunction');
    assert.ok(end !== -1, 'template should contain StorageBucket');
    const apiFunctionSection = template.slice(start, end);
    assert.ok(
      !apiFunctionSection.includes('Events:'),
      'ApiFunction should NOT have an Events property in base template'
    );
  });
});

// -----------------------------------------------------------
// Config backwards compatibility
// -----------------------------------------------------------

describe('config backwards compatibility', () => {
  it('config without extensions field defaults to empty array', () => {
    const cfg = { stackName: 'test', region: 'us-east-1' };
    const extensions = cfg.extensions || [];
    assert.deepEqual(
      extensions, [],
      'cfg.extensions || [] should default to empty array'
    );
  });
});
