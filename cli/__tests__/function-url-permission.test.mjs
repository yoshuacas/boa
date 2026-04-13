import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// File paths relative to the test file location
const CLI_TEMPLATE_PATH = join(
  __dirname, '..', 'templates', 'backend.yaml'
);
const PLUGIN_TEMPLATE_PATH = join(
  __dirname, '..', '..', 'plugin', 'templates', 'backend.yaml'
);
const VERIFY_MJS_PATH = join(
  __dirname, '..', 'commands', 'verify.mjs'
);
const VERIFY_SH_PATH = join(
  __dirname, '..', '..', 'plugin', 'scripts', 'verify.sh'
);
const PITFALLS_PATH = join(
  __dirname, '..', '..', 'plugin', 'docs', 'PITFALLS.md'
);

// Read all files once
const cliTemplate = readFileSync(CLI_TEMPLATE_PATH, 'utf8');
const pluginTemplate = readFileSync(PLUGIN_TEMPLATE_PATH, 'utf8');
const verifyMjs = readFileSync(VERIFY_MJS_PATH, 'utf8');
const verifySh = readFileSync(VERIFY_SH_PATH, 'utf8');
const pitfalls = readFileSync(PITFALLS_PATH, 'utf8');

// -----------------------------------------------------------
// CLI SAM template
// -----------------------------------------------------------

describe('CLI SAM template — ApiFunctionInvokePermission', () => {
  it('contains an ApiFunctionInvokePermission resource', () => {
    assert.ok(
      cliTemplate.includes('ApiFunctionInvokePermission'),
      'template should contain ApiFunctionInvokePermission resource'
    );
  });

  it('ApiFunctionInvokePermission Type is AWS::Lambda::Permission', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Type:\s*AWS::Lambda::Permission/
        .test(cliTemplate),
      'ApiFunctionInvokePermission should have Type: AWS::Lambda::Permission'
    );
  });

  it('ApiFunctionInvokePermission Action is lambda:InvokeFunction', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Action:\s*lambda:InvokeFunction/
        .test(cliTemplate),
      'ApiFunctionInvokePermission should have Action: lambda:InvokeFunction'
    );
  });

  it('ApiFunctionInvokePermission FunctionName references ApiFunction.Arn', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?FunctionName:\s*!GetAtt\s+ApiFunction\.Arn/
        .test(cliTemplate),
      'ApiFunctionInvokePermission should reference !GetAtt ApiFunction.Arn'
    );
  });

  it('ApiFunctionInvokePermission has InvokedViaFunctionUrl: true', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?InvokedViaFunctionUrl:\s*true/
        .test(cliTemplate),
      'ApiFunctionInvokePermission should have InvokedViaFunctionUrl: true'
    );
  });

  it('ApiFunctionInvokePermission Principal is *', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Principal:\s*'\*'/
        .test(cliTemplate),
      "ApiFunctionInvokePermission should have Principal: '*'"
    );
  });
});

// -----------------------------------------------------------
// Plugin SAM template
// -----------------------------------------------------------

describe('Plugin SAM template — ApiFunctionInvokePermission', () => {
  it('contains an ApiFunctionInvokePermission resource', () => {
    assert.ok(
      pluginTemplate.includes('ApiFunctionInvokePermission'),
      'template should contain ApiFunctionInvokePermission resource'
    );
  });

  it('ApiFunctionInvokePermission Type is AWS::Lambda::Permission', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Type:\s*AWS::Lambda::Permission/
        .test(pluginTemplate),
      'ApiFunctionInvokePermission should have Type: AWS::Lambda::Permission'
    );
  });

  it('ApiFunctionInvokePermission Action is lambda:InvokeFunction', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Action:\s*lambda:InvokeFunction/
        .test(pluginTemplate),
      'ApiFunctionInvokePermission should have Action: lambda:InvokeFunction'
    );
  });

  it('ApiFunctionInvokePermission FunctionName references ApiFunction.Arn', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?FunctionName:\s*!GetAtt\s+ApiFunction\.Arn/
        .test(pluginTemplate),
      'ApiFunctionInvokePermission should reference !GetAtt ApiFunction.Arn'
    );
  });

  it('ApiFunctionInvokePermission has InvokedViaFunctionUrl: true', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?InvokedViaFunctionUrl:\s*true/
        .test(pluginTemplate),
      'ApiFunctionInvokePermission should have InvokedViaFunctionUrl: true'
    );
  });

  it('ApiFunctionInvokePermission Principal is *', () => {
    assert.ok(
      /ApiFunctionInvokePermission:[\s\S]*?Principal:\s*'\*'/
        .test(pluginTemplate),
      "ApiFunctionInvokePermission should have Principal: '*'"
    );
  });
});

// -----------------------------------------------------------
// Template parity
// -----------------------------------------------------------

describe('Template parity — ApiFunctionInvokePermission', () => {
  it('both templates have structurally identical ApiFunctionInvokePermission sections', () => {
    // Extract the ApiFunctionInvokePermission block from each
    // template (from the resource name to the next top-level
    // resource or section, indicated by a line starting with
    // exactly two spaces followed by a non-space character that
    // is not a property continuation).
    const extractPermissionBlock = (template) => {
      const marker = 'ApiFunctionInvokePermission:';
      const start = template.indexOf(marker);
      if (start === -1) return null;
      // Find the end: next resource at same indentation level
      const afterMarker = template.slice(start + marker.length);
      const nextResource = afterMarker.search(/\n  \S/);
      if (nextResource === -1) return afterMarker.trim();
      return afterMarker.slice(0, nextResource).trim();
    };

    const cliBlock = extractPermissionBlock(cliTemplate);
    const pluginBlock = extractPermissionBlock(pluginTemplate);

    assert.ok(
      cliBlock !== null,
      'CLI template should contain ApiFunctionInvokePermission'
    );
    assert.ok(
      pluginBlock !== null,
      'Plugin template should contain ApiFunctionInvokePermission'
    );
    assert.equal(
      cliBlock,
      pluginBlock,
      'ApiFunctionInvokePermission sections should be identical across templates'
    );
  });
});

// -----------------------------------------------------------
// CLI verify command (verify.mjs)
// -----------------------------------------------------------

describe('CLI verify command — Function URL permission checks', () => {
  it('contains a lambda:InvokeFunctionUrl permission check', () => {
    assert.ok(
      verifyMjs.includes('lambda:InvokeFunctionUrl'),
      'verify.mjs should check for lambda:InvokeFunctionUrl permission'
    );
  });

  it('contains a lambda:InvokeFunction permission check', () => {
    assert.ok(
      verifyMjs.includes('lambda:InvokeFunction'),
      'verify.mjs should check for lambda:InvokeFunction permission'
    );
  });

  it('calls aws lambda get-policy to retrieve the resource policy', () => {
    assert.ok(
      verifyMjs.includes('get-policy'),
      'verify.mjs should call aws lambda get-policy'
    );
  });

  it('does not include 403 in the valid HTTP codes', () => {
    // Match the validCodes array definition and check 403 is
    // not present
    const codesMatch = verifyMjs.match(
      /validCodes\s*=\s*\[([^\]]*)\]/
    );
    assert.ok(
      codesMatch,
      'verify.mjs should contain a validCodes array'
    );
    assert.ok(
      !codesMatch[1].includes('403'),
      'validCodes should NOT include 403'
    );
  });

  it('includes 200, 401, and 404 in the valid HTTP codes', () => {
    const codesMatch = verifyMjs.match(
      /validCodes\s*=\s*\[([^\]]*)\]/
    );
    assert.ok(
      codesMatch,
      'verify.mjs should contain a validCodes array'
    );
    const codesStr = codesMatch[1];
    assert.ok(
      codesStr.includes('200'),
      'validCodes should include 200'
    );
    assert.ok(
      codesStr.includes('401'),
      'validCodes should include 401'
    );
    assert.ok(
      codesStr.includes('404'),
      'validCodes should include 404'
    );
  });
});

// -----------------------------------------------------------
// Plugin verify script (verify.sh)
// -----------------------------------------------------------

describe('Plugin verify script — Function URL permission checks', () => {
  it('contains a lambda:InvokeFunctionUrl permission check', () => {
    assert.ok(
      verifySh.includes('lambda:InvokeFunctionUrl'),
      'verify.sh should check for lambda:InvokeFunctionUrl permission'
    );
  });

  it('contains a lambda:InvokeFunction permission check', () => {
    assert.ok(
      verifySh.includes('lambda:InvokeFunction'),
      'verify.sh should check for lambda:InvokeFunction permission'
    );
  });

  it('calls aws lambda get-policy to retrieve the resource policy', () => {
    assert.ok(
      verifySh.includes('get-policy'),
      'verify.sh should call aws lambda get-policy'
    );
  });

  it('does not accept HTTP 403 as a passing result', () => {
    // verify.sh currently has an elif branch that passes on
    // 403. Check that no line accepts 403 as passing.
    const lines = verifySh.split('\n');
    const has403Pass = lines.some((line) => {
      // Match patterns like: == "403" ]] followed by pass,
      // or "403".*"pass" on the same or adjacent lines
      return (
        (/=="?\s*"?403"?/.test(line) && !line.includes('fail'))
        || (/403/.test(line) && /pass/.test(line))
      );
    });
    assert.ok(
      !has403Pass,
      'verify.sh should not accept HTTP 403 as a passing result'
    );
  });
});

// -----------------------------------------------------------
// PITFALLS.md
// -----------------------------------------------------------

describe('PITFALLS.md — Function URL 403 entry', () => {
  it('index table contains an entry numbered 24', () => {
    assert.ok(
      /\|\s*24\s*\|/.test(pitfalls),
      'PITFALLS.md should contain entry #24 in the index table'
    );
  });

  it('entry 24 mentions Function URL 403 or lambda:InvokeFunction', () => {
    // Find the line with | 24 | and check its content
    const entry24 = pitfalls.match(
      /\|\s*24\s*\|([^|]*)\|/
    );
    assert.ok(
      entry24,
      'PITFALLS.md should contain entry #24'
    );
    const content = entry24[1];
    assert.ok(
      content.includes('Function URL 403')
        || content.includes('lambda:InvokeFunction'),
      'entry 24 should mention Function URL 403 or lambda:InvokeFunction'
    );
  });

  it('contains a detail section for the Function URL 403 pitfall', () => {
    assert.ok(
      /##.*Function URL 403/i.test(pitfalls),
      'PITFALLS.md should contain a detail section for Function URL 403'
    );
  });

  it('detail section includes aws lambda add-permission command', () => {
    assert.ok(
      pitfalls.includes('aws lambda add-permission'),
      'PITFALLS.md detail section should include the manual fix command'
    );
  });
});
