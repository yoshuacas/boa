import { DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { BoaConfig } from '@/types/boa';
import { getAwsClients } from './aws-clients';
import { getStackName } from './boa-config';

export type StackFunction = {
  logicalId: string;       // SAM logical ID e.g. "ApiFunction", "StorageFunction"
  physicalId: string;      // Actual Lambda name e.g. "boaapp-ApiFunction-XYZ"
  kind: 'api' | 'custom';  // 'api' = main pgrest-lambda, 'custom' = developer-added
  label: string;           // Human-readable label
  sourceDir?: string;      // e.g. "functions/storage" for custom functions
};

// Derive a human-readable label and source dir from the SAM logical resource ID.
// Convention: "ApiFunction" → main API; "StorageFunction" → functions/storage/
function classify(logicalId: string, physicalId: string): Omit<StackFunction, 'logicalId' | 'physicalId'> {
  if (logicalId === 'ApiFunction') {
    return { kind: 'api', label: 'API (pgrest-lambda)' };
  }

  // Strip trailing "Function" suffix to get the source dir name
  const baseName = logicalId.replace(/Function$/, '');
  // Convert PascalCase to kebab-case: "StripeWebhook" → "stripe-webhook"
  const dirName = baseName
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')
    .toLowerCase();

  return {
    kind: 'custom',
    label: baseName,
    sourceDir: `functions/${dirName}`,
  };
}

export async function getStackFunctions(cfg: BoaConfig): Promise<StackFunction[]> {
  const { cfn } = getAwsClients(cfg);
  const stackName = getStackName(cfg);

  const result = await cfn.send(
    new DescribeStackResourcesCommand({ StackName: stackName })
  );

  const lambdaResources = (result.StackResources || []).filter(
    r => r.ResourceType === 'AWS::Lambda::Function' &&
         r.ResourceStatus !== 'DELETE_COMPLETE'
  );

  return lambdaResources.map(r => {
    const logicalId = r.LogicalResourceId!;
    const physicalId = r.PhysicalResourceId!;
    return { logicalId, physicalId, ...classify(logicalId, physicalId) };
  });
}
