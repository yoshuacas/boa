/**
 * BOA Dashboard — AWS CLI Bridge
 *
 * Generates copy-paste AWS CLI commands for each service based on the
 * loaded config. Since the dashboard is a static HTML page running
 * locally in the browser, it cannot execute AWS CLI directly. Instead
 * it formats the correct commands that the developer can paste into
 * their terminal.
 */

const CLIBridge = (() => {
  // ── Helpers ────────────────────────────────────────────────────────

  function region() {
    return BOA.getRegion();
  }

  function q(s) {
    // wrap a value in single quotes for shell safety
    return `'${s}'`;
  }

  // ── Copy to clipboard utility ──────────────────────────────────────

  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
  }

  // ── DSQL / Database ────────────────────────────────────────────────

  function getDsqlEndpoint(cfg) {
    return cfg.dsql_endpoint || cfg.dsqlEndpoint || cfg.database?.endpoint || '';
  }

  function getDsqlCommands(cfg) {
    const endpoint = getDsqlEndpoint(cfg);
    const r = cfg.region || cfg.aws_region || 'us-east-1';
    const dbName = cfg.dsql_database || cfg.database?.name || 'postgres';

    if (!endpoint) return [];

    return [
      {
        title: 'Connect via psql',
        description: 'Open an interactive PostgreSQL session to your DSQL cluster',
        command: `# Generate an auth token and connect\nDSQL_TOKEN=$(aws dsql generate-db-connect-admin-auth-token \\\n  --hostname ${endpoint} \\\n  --region ${r} \\\n  --expires-in 3600)\n\npsql "host=${endpoint} dbname=${dbName} user=admin password=$DSQL_TOKEN sslmode=require"`,
      },
      {
        title: 'List tables',
        description: 'Show all user-created tables in the database',
        command: `DSQL_TOKEN=$(aws dsql generate-db-connect-admin-auth-token \\\n  --hostname ${endpoint} \\\n  --region ${r} \\\n  --expires-in 3600)\n\npsql "host=${endpoint} dbname=${dbName} user=admin password=$DSQL_TOKEN sslmode=require" \\\n  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"`,
      },
      {
        title: 'Describe a table',
        description: 'Show columns and types for a specific table (edit TABLE_NAME)',
        command: `DSQL_TOKEN=$(aws dsql generate-db-connect-admin-auth-token \\\n  --hostname ${endpoint} \\\n  --region ${r} \\\n  --expires-in 3600)\n\npsql "host=${endpoint} dbname=${dbName} user=admin password=$DSQL_TOKEN sslmode=require" \\\n  -c "\\d TABLE_NAME"`,
      },
      {
        title: 'Count rows in a table',
        description: 'Quick row count (edit TABLE_NAME)',
        command: `DSQL_TOKEN=$(aws dsql generate-db-connect-admin-auth-token \\\n  --hostname ${endpoint} \\\n  --region ${r} \\\n  --expires-in 3600)\n\npsql "host=${endpoint} dbname=${dbName} user=admin password=$DSQL_TOKEN sslmode=require" \\\n  -c "SELECT COUNT(*) FROM TABLE_NAME;"`,
      },
    ];
  }

  // ── Cognito / Auth ─────────────────────────────────────────────────

  function getUserPoolId(cfg) {
    return cfg.cognito_user_pool_id || cfg.cognitoUserPoolId || cfg.auth?.userPoolId || '';
  }

  function getClientId(cfg) {
    return cfg.cognito_client_id || cfg.cognitoClientId || cfg.auth?.clientId || '';
  }

  function getCognitoCommands(cfg) {
    const poolId = getUserPoolId(cfg);
    const clientId = getClientId(cfg);
    const r = cfg.region || cfg.aws_region || 'us-east-1';

    if (!poolId) return [];

    return [
      {
        title: 'Describe user pool',
        description: 'Get full configuration of your Cognito user pool',
        command: `aws cognito-idp describe-user-pool \\\n  --user-pool-id ${poolId} \\\n  --region ${r}`,
      },
      {
        title: 'List users',
        description: 'Show all registered users in the pool',
        command: `aws cognito-idp list-users \\\n  --user-pool-id ${poolId} \\\n  --region ${r}`,
      },
      {
        title: 'Create a test user',
        description: 'Create and confirm a user for local testing (edit email and password)',
        command: `# Create user\naws cognito-idp admin-create-user \\\n  --user-pool-id ${poolId} \\\n  --username testuser@example.com \\\n  --temporary-password 'TempPass123!' \\\n  --user-attributes Name=email,Value=testuser@example.com Name=email_verified,Value=true \\\n  --region ${r}\n\n# Set permanent password\naws cognito-idp admin-set-user-password \\\n  --user-pool-id ${poolId} \\\n  --username testuser@example.com \\\n  --password 'MySecurePass123!' \\\n  --permanent \\\n  --region ${r}`,
      },
      {
        title: 'Check self-signup status',
        description: 'Verify whether self-service sign-up is enabled',
        command: `aws cognito-idp describe-user-pool \\\n  --user-pool-id ${poolId} \\\n  --region ${r} \\\n  --query 'UserPool.{SelfSignUp: AdminCreateUserConfig.AllowAdminCreateUserOnly, MFA: MfaConfiguration, PasswordPolicy: Policies.PasswordPolicy}'`,
      },
    ];
  }

  // ── Lambda / Functions ─────────────────────────────────────────────

  function getLambdaName(cfg) {
    return cfg.lambda_function_name || cfg.lambdaFunctionName || cfg.lambda?.functionName || '';
  }

  function getLambdaCommands(cfg) {
    const fnName = getLambdaName(cfg);
    const r = cfg.region || cfg.aws_region || 'us-east-1';

    if (!fnName) return [];

    return [
      {
        title: 'Get function configuration',
        description: 'View runtime, memory, timeout, environment variables, and more',
        command: `aws lambda get-function-configuration \\\n  --function-name ${fnName} \\\n  --region ${r}`,
      },
      {
        title: 'View recent invocations',
        description: 'List the last 20 invocations from CloudWatch Logs Insights',
        command: `# Get the log group name\nLOG_GROUP="/aws/lambda/${fnName}"\n\n# Query recent invocations (last 1 hour)\naws logs start-query \\\n  --log-group-name "$LOG_GROUP" \\\n  --start-time $(date -v-1H +%s 2>/dev/null || date -d '1 hour ago' +%s) \\\n  --end-time $(date +%s) \\\n  --query-string 'fields @timestamp, @message | filter @type = "REPORT" | sort @timestamp desc | limit 20' \\\n  --region ${r}`,
      },
      {
        title: 'Tail live logs',
        description: 'Stream logs in real-time (Ctrl+C to stop)',
        command: `aws logs tail "/aws/lambda/${fnName}" \\\n  --follow \\\n  --region ${r}`,
      },
      {
        title: 'Invoke the function',
        description: 'Manually invoke with a test payload (edit the JSON body)',
        command: `aws lambda invoke \\\n  --function-name ${fnName} \\\n  --payload '{"httpMethod":"GET","path":"/","headers":{}}' \\\n  --cli-binary-format raw-in-base64-out \\\n  --region ${r} \\\n  /dev/stdout`,
      },
    ];
  }

  // ── API Gateway ────────────────────────────────────────────────────

  function getApiUrl(cfg) {
    return cfg.api_url || cfg.apiUrl || cfg.api?.url || '';
  }

  function getApiId(cfg) {
    return cfg.api_id || cfg.apiId || cfg.api?.id || '';
  }

  function getApiGatewayCommands(cfg) {
    const apiUrl = getApiUrl(cfg);
    const apiId = getApiId(cfg);
    const r = cfg.region || cfg.aws_region || 'us-east-1';
    const poolId = getUserPoolId(cfg);
    const clientId = getClientId(cfg);

    const commands = [];

    if (apiUrl) {
      commands.push({
        title: 'Test an endpoint (unauthenticated)',
        description: 'Simple GET request to your API root',
        command: `curl -s ${apiUrl}/ | jq .`,
      });
    }

    if (apiUrl && clientId && poolId) {
      commands.push({
        title: 'Test an endpoint (authenticated)',
        description: 'Get a Cognito token and call a protected endpoint (edit credentials)',
        command: `# Get an auth token from Cognito\nTOKEN=$(aws cognito-idp initiate-auth \\\n  --client-id ${clientId} \\\n  --auth-flow USER_PASSWORD_AUTH \\\n  --auth-parameters USERNAME=testuser@example.com,PASSWORD='MySecurePass123!' \\\n  --region ${r} \\\n  --query 'AuthenticationResult.IdToken' \\\n  --output text)\n\n# Call a protected endpoint\ncurl -s -H "Authorization: Bearer $TOKEN" \\\n  ${apiUrl}/items | jq .`,
      });
    }

    if (apiId) {
      commands.push({
        title: 'Get API resources',
        description: 'List all routes and methods defined in your API',
        command: `aws apigateway get-resources \\\n  --rest-api-id ${apiId} \\\n  --region ${r} \\\n  --query 'items[].{Path:path, Methods:resourceMethods}'`,
      });

      commands.push({
        title: 'Get API stages',
        description: 'List deployment stages (prod, dev, etc.)',
        command: `aws apigateway get-stages \\\n  --rest-api-id ${apiId} \\\n  --region ${r}`,
      });
    }

    return commands;
  }

  // ── S3 / Storage ───────────────────────────────────────────────────

  function getBucketName(cfg) {
    return cfg.s3_bucket || cfg.s3Bucket || cfg.storage?.bucket || '';
  }

  function getS3Commands(cfg) {
    const bucket = getBucketName(cfg);
    const r = cfg.region || cfg.aws_region || 'us-east-1';

    if (!bucket) return [];

    return [
      {
        title: 'List objects',
        description: 'Show all objects in the bucket (first 100)',
        command: `aws s3api list-objects-v2 \\\n  --bucket ${bucket} \\\n  --max-items 100 \\\n  --region ${r} \\\n  --query 'Contents[].{Key:Key, Size:Size, Modified:LastModified}'`,
      },
      {
        title: 'Check bucket policy',
        description: 'View the access policy attached to the bucket',
        command: `aws s3api get-bucket-policy \\\n  --bucket ${bucket} \\\n  --region ${r} \\\n  --output text | jq .`,
      },
      {
        title: 'Get presigned URL',
        description: 'Generate a temporary download URL for an object (edit KEY)',
        command: `aws s3 presign \\\n  s3://${bucket}/YOUR_OBJECT_KEY \\\n  --expires-in 3600 \\\n  --region ${r}`,
      },
      {
        title: 'Check CORS configuration',
        description: 'View CORS rules for browser-based uploads',
        command: `aws s3api get-bucket-cors \\\n  --bucket ${bucket} \\\n  --region ${r}`,
      },
    ];
  }

  // ── Expose ─────────────────────────────────────────────────────────
  return {
    copyToClipboard,
    // Getters
    getDsqlEndpoint,
    getUserPoolId,
    getClientId,
    getLambdaName,
    getApiUrl,
    getApiId,
    getBucketName,
    // Command generators
    getDsqlCommands,
    getCognitoCommands,
    getLambdaCommands,
    getApiGatewayCommands,
    getS3Commands,
  };
})();
