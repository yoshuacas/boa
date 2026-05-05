export type BoaConfig = {
  region: string;
  stack_name?: string;
  stackName?: string;
  dsql_endpoint?: string;
  dsqlEndpoint?: string;
  database?: { endpoint?: string; name?: string };
  dsql_database?: string;
  lambda_function_name?: string;
  lambdaFunctionName?: string;
  lambda?: { functionName?: string };
  api_url?: string;
  apiUrl?: string;
  api?: { url?: string; id?: string };
  api_id?: string;
  apiId?: string;
  s3_bucket?: string;
  s3Bucket?: string;
  bucketName?: string;
  storage?: { bucket?: string };
  authProvider?: 'better-auth' | 'cognito';
  cognito_user_pool_id?: string;
  cognito_client_id?: string;
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields: { name: string; dataTypeID: number }[];
  error?: string;
  durationMs?: number;
};

export type TableInfo = {
  schema: string;
  name: string;
  rowCount: number | null;
};
