import { S3Client } from '@aws-sdk/client-s3';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { fromEnv } from '@aws-sdk/credential-providers';
import { BoaConfig } from '@/types/boa';

export function getAwsClients(cfg: BoaConfig) {
  const region = cfg.region || 'us-east-1';
  // Use fromEnv() in Lambda (where env var creds are always present) to avoid
  // the default provider chain doing filesystem/IMDS lookups that may fail in
  // the Amplify SSR Lambda bundle. Fall back to SDK defaults for local dev.
  const credentials = process.env.AWS_ACCESS_KEY_ID ? fromEnv() : undefined;

  return {
    s3: new S3Client({ region, ...(credentials && { credentials }) }),
    lambda: new LambdaClient({ region, ...(credentials && { credentials }) }),
    logs: new CloudWatchLogsClient({ region, ...(credentials && { credentials }) }),
    sts: new STSClient({ region, ...(credentials && { credentials }) }),
    cfn: new CloudFormationClient({ region, ...(credentials && { credentials }) }),
  };
}

export async function checkAwsCredentials(
  cfg: BoaConfig
): Promise<{ valid: boolean; identity?: string; error?: string }> {
  try {
    const { sts } = getAwsClients(cfg);
    const res = await sts.send(new GetCallerIdentityCommand({}));
    return { valid: true, identity: res.Arn };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: msg };
  }
}
