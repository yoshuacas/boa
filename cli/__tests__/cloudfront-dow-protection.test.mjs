import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { needsMigrationWarning } from '../commands/deploy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Read files under test ---

const template = readFileSync(
  join(__dirname, '..', 'templates', 'backend.yaml'), 'utf8'
);
const initSrc = readFileSync(
  join(__dirname, '..', 'commands', 'init.mjs'), 'utf8'
);
const deploySrc = readFileSync(
  join(__dirname, '..', 'commands', 'deploy.mjs'), 'utf8'
);
const verifySrc = readFileSync(
  join(__dirname, '..', 'commands', 'verify.mjs'), 'utf8'
);
const statusSrc = readFileSync(
  join(__dirname, '..', 'commands', 'status.mjs'), 'utf8'
);
const extensionsSrc = readFileSync(
  join(__dirname, '..', 'lib', 'extensions.mjs'), 'utf8'
);
const skillMd = readFileSync(
  join(__dirname, '..', '..', 'plugin', 'skills', 'boa', 'SKILL.md'),
  'utf8'
);
const pluginClaudeMd = readFileSync(
  join(__dirname, '..', '..', 'plugin', 'CLAUDE.md'), 'utf8'
);
const apiPatternsMd = readFileSync(
  join(__dirname, '..', '..', 'plugin', 'docs', 'API-PATTERNS.md'),
  'utf8'
);
const pitfallsMd = readFileSync(
  join(__dirname, '..', '..', 'plugin', 'docs', 'PITFALLS.md'),
  'utf8'
);

/**
 * Extract a named resource section from the SAM template.
 * Returns text from "  Name:" to the next resource at the
 * same indentation level, or empty string if not found.
 */
function resourceSection(name) {
  const marker = `  ${name}:`;
  const start = template.indexOf(marker);
  if (start === -1) return '';
  const rest = template.slice(start + marker.length);
  const next = rest.search(/\n  [A-Z]\w+:|\n[A-Z]\w+:/);
  if (next !== -1) {
    return template.slice(start, start + marker.length + next);
  }
  return template.slice(start);
}

// -----------------------------------------------------------
// SAM template -- CloudFront resources
// -----------------------------------------------------------

describe('SAM template -- CloudFront resources', () => {
  it('contains CloudFrontDistribution resource', () => {
    assert.ok(
      template.includes('CloudFrontDistribution:'),
      'template should contain a CloudFrontDistribution resource'
    );
  });

  it('does NOT contain CloudFrontOAC resource', () => {
    assert.ok(
      !template.includes('CloudFrontOAC:'),
      'template should not contain CloudFrontOAC'
        + ' (replaced by origin secret header)'
    );
  });

  it('contains CloudFrontCachePolicy resource', () => {
    assert.ok(
      template.includes('CloudFrontCachePolicy:'),
      'template should contain a CloudFrontCachePolicy resource'
    );
  });

  it('contains CloudFrontOriginRequestPolicy resource', () => {
    assert.ok(
      template.includes('CloudFrontOriginRequestPolicy:'),
      'template should contain a CloudFrontOriginRequestPolicy resource'
    );
  });

  it('contains ApiFunctionUrlPermission resource', () => {
    assert.ok(
      template.includes('ApiFunctionUrlPermission:'),
      'template should contain an ApiFunctionUrlPermission resource'
    );
  });

  it('contains origin custom header x-origin-verify', () => {
    assert.ok(
      template.includes('x-origin-verify'),
      'template should contain x-origin-verify custom header'
        + ' on CloudFront origin'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- WAF and alarm
// -----------------------------------------------------------

describe('SAM template -- WAF and alarm', () => {
  it('contains WafWebAcl resource', () => {
    assert.ok(
      template.includes('WafWebAcl:'),
      'template should contain a WafWebAcl resource'
    );
  });

  it('contains ThrottleAlarmTopic resource', () => {
    assert.ok(
      template.includes('ThrottleAlarmTopic:'),
      'template should contain a ThrottleAlarmTopic resource'
    );
  });

  it('contains LambdaThrottleAlarm resource', () => {
    assert.ok(
      template.includes('LambdaThrottleAlarm:'),
      'template should contain a LambdaThrottleAlarm resource'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- conditions
// -----------------------------------------------------------

describe('SAM template -- conditions', () => {
  it('has Conditions section with IsUsEast1', () => {
    assert.ok(
      template.includes('Conditions:'),
      'template should contain a Conditions section'
    );
    assert.ok(
      template.includes('IsUsEast1'),
      'Conditions section should define IsUsEast1'
    );
  });

  it('WafWebAcl has Condition: IsUsEast1', () => {
    const section = resourceSection('WafWebAcl');
    assert.ok(
      section.length > 0,
      'template should contain WafWebAcl resource'
    );
    assert.ok(
      section.includes('Condition: IsUsEast1'),
      'WafWebAcl should have Condition: IsUsEast1'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- function configuration
// -----------------------------------------------------------

describe('SAM template -- function configuration', () => {
  it('ApiFunction has AuthType: NONE', () => {
    assert.ok(
      template.includes('AuthType: NONE'),
      'FunctionUrlConfig AuthType should be NONE'
    );
  });

  it('FunctionUrlConfig contains a Cors block', () => {
    const start = template.indexOf('FunctionUrlConfig:');
    assert.ok(
      start !== -1,
      'template should contain FunctionUrlConfig'
    );
    const envStart = template.indexOf('Environment:', start);
    assert.ok(
      envStart !== -1,
      'template should contain Environment after FunctionUrlConfig'
    );
    const section = template.slice(start, envStart);
    assert.ok(
      section.includes('Cors:'),
      'FunctionUrlConfig should have a Cors block'
        + ' (required when AuthType is NONE)'
    );
  });

  it('Lambda env vars include ORIGIN_SECRET', () => {
    assert.ok(
      template.includes('ORIGIN_SECRET'),
      'Lambda environment should include ORIGIN_SECRET'
    );
  });

  it('ApiFunction has ReservedConcurrentExecutions: 50', () => {
    assert.ok(
      template.includes('ReservedConcurrentExecutions: 50'),
      'ApiFunction should have ReservedConcurrentExecutions: 50'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- removed permissions
// -----------------------------------------------------------

describe('SAM template -- removed resources', () => {
  it('does NOT contain CloudFrontInvokePermission resource', () => {
    assert.ok(
      !template.includes('CloudFrontInvokePermission:'),
      'template should not contain CloudFrontInvokePermission'
        + ' (replaced by public permissions)'
    );
  });

  it('does NOT contain CloudFrontOAC resource', () => {
    assert.ok(
      !template.includes('CloudFrontOAC:'),
      'template should not contain CloudFrontOAC'
        + ' (replaced by origin secret header)'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- CloudFront permission details
// -----------------------------------------------------------

describe('SAM template -- public permission details', () => {
  it('ApiFunctionUrlPermission has Principal: *', () => {
    const section = resourceSection('ApiFunctionUrlPermission');
    assert.ok(
      section.length > 0,
      'template should contain ApiFunctionUrlPermission resource'
    );
    assert.ok(
      section.includes("'*'"),
      'ApiFunctionUrlPermission Principal should be *'
    );
  });

  it('ApiFunctionUrlPermission has FunctionUrlAuthType: NONE', () => {
    const section = resourceSection('ApiFunctionUrlPermission');
    assert.ok(
      section.length > 0,
      'template should contain ApiFunctionUrlPermission resource'
    );
    assert.ok(
      section.includes('FunctionUrlAuthType: NONE'),
      'ApiFunctionUrlPermission FunctionUrlAuthType should be NONE'
    );
  });

  it('ApiFunctionInvokePermission has Principal: *', () => {
    const section = resourceSection('ApiFunctionInvokePermission');
    assert.ok(
      section.length > 0,
      'template should contain ApiFunctionInvokePermission resource'
    );
    assert.ok(
      section.includes("'*'"),
      'ApiFunctionInvokePermission Principal should be *'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- cache policy
// -----------------------------------------------------------

describe('SAM template -- cache policy', () => {
  it('Headers include Authorization', () => {
    const section = resourceSection('CloudFrontCachePolicy');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontCachePolicy resource'
    );
    assert.ok(
      section.includes('- Authorization'),
      'CloudFrontCachePolicy Headers should include Authorization'
    );
  });

  it('Headers include apikey', () => {
    const section = resourceSection('CloudFrontCachePolicy');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontCachePolicy resource'
    );
    assert.ok(
      section.includes('- apikey'),
      'CloudFrontCachePolicy Headers should include apikey'
    );
  });

  it('DefaultTTL is 60', () => {
    const section = resourceSection('CloudFrontCachePolicy');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontCachePolicy resource'
    );
    assert.ok(
      section.includes('DefaultTTL: 60'),
      'CloudFrontCachePolicy DefaultTTL should be 60'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- origin request policy
// -----------------------------------------------------------

describe('SAM template -- origin request policy', () => {
  it('Headers include Content-Type', () => {
    const section = resourceSection(
      'CloudFrontOriginRequestPolicy'
    );
    assert.ok(
      section.length > 0,
      'template should contain'
        + ' CloudFrontOriginRequestPolicy resource'
    );
    assert.ok(
      section.includes('- Content-Type'),
      'CloudFrontOriginRequestPolicy Headers should include'
        + ' Content-Type'
    );
  });

  it('Headers include Prefer', () => {
    const section = resourceSection(
      'CloudFrontOriginRequestPolicy'
    );
    assert.ok(
      section.length > 0,
      'template should contain'
        + ' CloudFrontOriginRequestPolicy resource'
    );
    assert.ok(
      section.includes('- Prefer'),
      'CloudFrontOriginRequestPolicy Headers should include'
        + ' Prefer'
    );
  });

  it('Headers include accept-profile', () => {
    const section = resourceSection(
      'CloudFrontOriginRequestPolicy'
    );
    assert.ok(
      section.length > 0,
      'template should contain'
        + ' CloudFrontOriginRequestPolicy resource'
    );
    assert.ok(
      section.includes('- accept-profile'),
      'CloudFrontOriginRequestPolicy Headers should include'
        + ' accept-profile'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- OAC details
// -----------------------------------------------------------

describe('SAM template -- origin secret header', () => {
  it('CloudFront origin has OriginCustomHeaders', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('OriginCustomHeaders'),
      'CloudFront origin should have OriginCustomHeaders'
    );
  });

  it('OriginCustomHeaders includes x-origin-verify', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('x-origin-verify'),
      'OriginCustomHeaders should include x-origin-verify'
    );
  });

  it('x-origin-verify value references SSM origin-secret', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('origin-secret'),
      'x-origin-verify HeaderValue should reference'
        + ' SSM origin-secret parameter'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- distribution details
// -----------------------------------------------------------

describe('SAM template -- distribution details', () => {
  it('PriceClass is PriceClass_100', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('PriceClass: PriceClass_100'),
      'CloudFrontDistribution should have'
        + ' PriceClass: PriceClass_100'
    );
  });

  it('ViewerProtocolPolicy is https-only', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('ViewerProtocolPolicy: https-only'),
      'CloudFrontDistribution should have'
        + ' ViewerProtocolPolicy: https-only'
    );
  });

  it('HttpVersion is http2and3', () => {
    const section = resourceSection('CloudFrontDistribution');
    assert.ok(
      section.length > 0,
      'template should contain CloudFrontDistribution resource'
    );
    assert.ok(
      section.includes('HttpVersion: http2and3'),
      'CloudFrontDistribution should have'
        + ' HttpVersion: http2and3'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- WAF rule details
// -----------------------------------------------------------

describe('SAM template -- WAF rule details', () => {
  it('rate-based rule has Limit: 1000', () => {
    const section = resourceSection('WafWebAcl');
    assert.ok(
      section.length > 0,
      'template should contain WafWebAcl resource'
    );
    assert.ok(
      section.includes('Limit: 1000'),
      'WafWebAcl should have rate-based rule with Limit: 1000'
    );
  });

  it('rate-based rule has AggregateKeyType: IP', () => {
    const section = resourceSection('WafWebAcl');
    assert.ok(
      section.length > 0,
      'template should contain WafWebAcl resource'
    );
    assert.ok(
      section.includes('AggregateKeyType: IP'),
      'WafWebAcl should have AggregateKeyType: IP'
    );
  });

  it('includes AWSManagedRulesAmazonIpReputationList', () => {
    const section = resourceSection('WafWebAcl');
    assert.ok(
      section.length > 0,
      'template should contain WafWebAcl resource'
    );
    assert.ok(
      section.includes('AWSManagedRulesAmazonIpReputationList'),
      'WafWebAcl should include'
        + ' AWSManagedRulesAmazonIpReputationList managed rule'
    );
  });
});

// -----------------------------------------------------------
// SAM template -- outputs
// -----------------------------------------------------------

describe('SAM template -- outputs', () => {
  it('Outputs contains CloudFrontUrl', () => {
    assert.ok(
      template.includes('CloudFrontUrl:'),
      'Outputs should contain CloudFrontUrl'
    );
  });

  it('Outputs contains CloudFrontDistributionId', () => {
    assert.ok(
      template.includes('CloudFrontDistributionId:'),
      'Outputs should contain CloudFrontDistributionId'
    );
  });

  it('Outputs contains ThrottleAlarmTopicArn', () => {
    assert.ok(
      template.includes('ThrottleAlarmTopicArn:'),
      'Outputs should contain ThrottleAlarmTopicArn'
    );
  });

  it('ApiFunctionUrl output is still present', () => {
    const outputsStart = template.indexOf('Outputs:');
    assert.ok(
      outputsStart !== -1,
      'template should have an Outputs section'
    );
    const outputs = template.slice(outputsStart);
    assert.ok(
      outputs.includes('ApiFunctionUrl:'),
      'Outputs should still contain ApiFunctionUrl'
        + ' (kept for reference)'
    );
  });
});

// -----------------------------------------------------------
// CLI init -- output extraction
// -----------------------------------------------------------

describe('CLI init -- output extraction', () => {
  it('references CloudFrontUrl in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'CloudFrontUrl'/.test(initSrc),
      'init.mjs should extract CloudFrontUrl from stack outputs'
    );
  });

  it('references CloudFrontDistributionId in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'CloudFrontDistributionId'/.test(
        initSrc
      ),
      'init.mjs should extract CloudFrontDistributionId'
        + ' from stack outputs'
    );
  });

  it('references ThrottleAlarmTopicArn in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'ThrottleAlarmTopicArn'/.test(initSrc),
      'init.mjs should extract ThrottleAlarmTopicArn'
        + ' from stack outputs'
    );
  });

  it('config object includes functionUrl property', () => {
    assert.ok(
      initSrc.includes('functionUrl'),
      'init.mjs config should include a functionUrl property'
    );
  });

  it('config object includes cloudfront property', () => {
    assert.ok(
      initSrc.includes('cloudfront'),
      'init.mjs config should include a cloudfront property'
    );
  });
});

// -----------------------------------------------------------
// CLI deploy -- output extraction and migration
// -----------------------------------------------------------

describe('CLI deploy -- output extraction and migration', () => {
  it('references CloudFrontUrl in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'CloudFrontUrl'/.test(deploySrc),
      'deploy.mjs should extract CloudFrontUrl from stack outputs'
    );
  });

  it('references CloudFrontDistributionId in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'CloudFrontDistributionId'/.test(
        deploySrc
      ),
      'deploy.mjs should extract CloudFrontDistributionId'
        + ' from stack outputs'
    );
  });

  it('references ThrottleAlarmTopicArn in getOutputValue call', () => {
    assert.ok(
      /getOutputValue\([^)]*'ThrottleAlarmTopicArn'/.test(
        deploySrc
      ),
      'deploy.mjs should extract ThrottleAlarmTopicArn'
        + ' from stack outputs'
    );
  });

  it('Function URL apiUrl with no cloudfront triggers warning', () => {
    assert.ok(
      needsMigrationWarning({
        apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
        extensions: [],
      }),
      'needsMigrationWarning should return true for Function URL'
        + ' apiUrl without cloudfront object'
        + ' (Function URL -> CloudFront migration)'
    );
  });

  it('CloudFront apiUrl does not trigger warning', () => {
    assert.ok(
      !needsMigrationWarning({
        apiUrl: 'https://d111111abcdef8.cloudfront.net',
        extensions: [],
      }),
      'needsMigrationWarning should return false for'
        + ' CloudFront apiUrl'
    );
  });

  it('Function URL apiUrl with cloudfront present does not trigger warning', () => {
    assert.ok(
      !needsMigrationWarning({
        apiUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
        cloudfront: {
          distributionId: 'E1234567890ABC',
          domainName: 'd111111abcdef8.cloudfront.net',
        },
        extensions: [],
      }),
      'needsMigrationWarning should return false when cloudfront'
        + ' object is present (already upgraded)'
    );
  });
});

// -----------------------------------------------------------
// CLI verify -- new checks
// -----------------------------------------------------------

describe('CLI verify -- new checks', () => {
  it('contains cloudfront get-distribution check', () => {
    assert.ok(
      verifySrc.includes('cloudfront get-distribution'),
      'verify should check CloudFront distribution with'
        + ' cloudfront get-distribution'
    );
  });

  it('contains wafv2 get-web-acl-for-resource check', () => {
    assert.ok(
      verifySrc.includes('wafv2 get-web-acl-for-resource'),
      'verify should check WAF attachment with'
        + ' wafv2 get-web-acl-for-resource'
    );
  });

  it('curls cfg.functionUrl and checks for HTTP 403', () => {
    assert.ok(
      verifySrc.includes('cfg.functionUrl'),
      'verify should curl cfg.functionUrl for direct'
        + ' Function URL access check'
    );
    assert.ok(
      verifySrc.includes('403'),
      'verify should check for HTTP 403 on direct'
        + ' Function URL access'
    );
  });

  it('checks ReservedConcurrentExecutions', () => {
    assert.ok(
      verifySrc.includes('ReservedConcurrentExecutions'),
      'verify should check for ReservedConcurrentExecutions'
    );
  });

  it('skips WAF check when region is not us-east-1', () => {
    assert.ok(
      verifySrc.includes("region === 'us-east-1'")
        || verifySrc.includes('region === "us-east-1"'),
      'verify should conditionally skip WAF check'
        + ' for non-us-east-1 regions'
    );
  });
});

// -----------------------------------------------------------
// CLI status -- Function URL display
// -----------------------------------------------------------

describe('CLI status -- Function URL display', () => {
  it('displays functionUrl', () => {
    assert.ok(
      statusSrc.includes('cfg.functionUrl')
        || statusSrc.includes('functionUrl'),
      'status.mjs should display the Function URL'
    );
  });

  it('shows (internal) label next to Function URL', () => {
    assert.ok(
      statusSrc.includes('(internal)'),
      'status.mjs should label the Function URL as (internal)'
    );
  });
});

// -----------------------------------------------------------
// Extension system -- CloudFront removal
// -----------------------------------------------------------

describe('Extension system -- CloudFront removal', () => {
  it('removes CloudFrontDistribution when api-gateway active', () => {
    assert.ok(
      extensionsSrc.includes('CloudFrontDistribution'),
      'extensions.mjs should reference CloudFrontDistribution'
        + ' in a removal list'
    );
  });

  it('removes WafWebAcl when api-gateway active', () => {
    assert.ok(
      extensionsSrc.includes('WafWebAcl'),
      'extensions.mjs should reference WafWebAcl'
        + ' in a removal list'
    );
  });

  it('removes ORIGIN_SECRET env var', () => {
    assert.ok(
      extensionsSrc.includes('ORIGIN_SECRET'),
      'extensions.mjs should remove ORIGIN_SECRET'
        + ' when api-gateway extension is active'
    );
  });

  it('removes ReservedConcurrentExecutions', () => {
    assert.ok(
      extensionsSrc.includes('ReservedConcurrentExecutions'),
      'extensions.mjs should remove ReservedConcurrentExecutions'
        + ' when api-gateway extension is active'
    );
  });
});

// -----------------------------------------------------------
// Skill documentation
// -----------------------------------------------------------

describe('Skill documentation', () => {
  it('architecture diagram includes CloudFront', () => {
    const archStart = skillMd.indexOf('## Architecture');
    assert.ok(
      archStart !== -1,
      'SKILL.md should have an Architecture section'
    );
    const nextSection = skillMd.indexOf('\n## ', archStart + 1);
    const archSection = skillMd.slice(
      archStart,
      nextSection !== -1 ? nextSection : undefined
    );
    assert.ok(
      archSection.includes('CloudFront'),
      'SKILL.md architecture diagram should include CloudFront'
        + ' (not just Function URL directly)'
    );
  });

  it('mentions WAF in default traffic layer context', () => {
    // WAF should appear alongside CloudFront as part of the
    // default traffic layer, not just as an api-gateway
    // extension feature (which is the only current mention)
    assert.ok(
      /CloudFront.*WAF|WAF.*CloudFront/i.test(skillMd),
      'SKILL.md should mention WAF alongside CloudFront'
        + ' as part of the default traffic layer'
    );
  });
});

// -----------------------------------------------------------
// Plugin documentation
// -----------------------------------------------------------

describe('Plugin documentation', () => {
  it('API layer in architecture table mentions CloudFront', () => {
    const tableMatch = pluginClaudeMd.match(
      /\|\s*API\s*\|[^|]+\|/
    );
    assert.ok(
      tableMatch,
      'plugin CLAUDE.md should have an API row in the'
        + ' architecture table'
    );
    assert.ok(
      tableMatch[0].includes('CloudFront'),
      'plugin CLAUDE.md API layer should mention CloudFront,'
        + ' not just Lambda Function URLs'
    );
  });
});

// -----------------------------------------------------------
// API patterns
// -----------------------------------------------------------

describe('API patterns', () => {
  it('contains section about CloudFront as default traffic layer', () => {
    assert.ok(
      apiPatternsMd.includes('CloudFront'),
      'API-PATTERNS.md should have a section about CloudFront'
        + ' as the default traffic layer'
    );
  });
});

// -----------------------------------------------------------
// Pitfalls
// -----------------------------------------------------------

describe('Pitfalls', () => {
  it('contains entry for CloudFront 403 or direct Function URL 403', () => {
    assert.ok(
      /CloudFront.*403|direct.*Function URL.*403/i.test(
        pitfallsMd
      ),
      'PITFALLS.md should have an entry for CloudFront 403'
        + ' or direct Function URL 403'
    );
  });

  it('contains entry for CORS through CloudFront', () => {
    assert.ok(
      /CORS.*CloudFront|CloudFront.*CORS/i.test(pitfallsMd),
      'PITFALLS.md should have an entry for CORS through'
        + ' CloudFront'
    );
  });

  it('contains entry for cache stale data', () => {
    assert.ok(
      /cache.*stale|stale.*cache/i.test(pitfallsMd),
      'PITFALLS.md should have an entry for cache stale data'
    );
  });
});
