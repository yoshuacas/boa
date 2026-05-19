let _lambdaClient = null;

async function defaultLambdaInvoke(params) {
  if (!_lambdaClient) {
    const { LambdaClient, InvokeCommand } =
      await import('@aws-sdk/client-lambda');
    _lambdaClient = { client: new LambdaClient({ region: process.env.REGION_NAME }), InvokeCommand };
  }
  const command = new _lambdaClient.InvokeCommand(params);
  const response = await _lambdaClient.client.send(command);
  const payload = new TextDecoder().decode(response.Payload);
  return { Payload: payload };
}

export function buildBoaClient(jwt, role, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.API_URL || '';
  const serviceRoleKey = deps.serviceRoleKey
    || process.env.SERVICE_ROLE_KEY || '';
  const lambdaInvoke = deps.lambdaInvoke || defaultLambdaInvoke;
  const fetchFn = deps.fetch || globalThis.fetch;
  const createServicePool = deps.createServicePool || null;

  let _servicePool = null;

  async function directInvoke(name, payload, token) {
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || '';
    const invokePayload = {
      _boaInternal: { name },
      payload,
      headers: token
        ? { authorization: `Bearer ${token}` }
        : { apikey: serviceRoleKey },
    };
    return lambdaInvoke({
      FunctionName: functionName,
      Payload: JSON.stringify(invokePayload),
    });
  }

  function buildRestProxy(token) {
    return {
      from(table) {
        return {
          async select(columns = '*') {
            const url =
              `${apiUrl}/rest/v1/${table}?select=${columns}`;
            const res = await fetchFn(url, {
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: serviceRoleKey,
              },
            });
            return res.json();
          },
        };
      },
    };
  }

  function getServiceRolePool() {
    if (createServicePool) {
      return createServicePool('service_role');
    }
    const endpoint = process.env.DSQL_ENDPOINT;
    const region = process.env.REGION_NAME;
    return { endpoint, region, role: 'service_role', query() {} };
  }

  return {
    async db() {
      if (!_servicePool) {
        _servicePool = getServiceRolePool();
      }
      return _servicePool;
    },
    rest: buildRestProxy(jwt),
    functions: {
      async invoke(name, payload) {
        return directInvoke(name, payload, jwt);
      },
    },
    asService() {
      return buildBoaClient('', 'service_role', {
        ...deps,
        apiUrl,
        serviceRoleKey,
        lambdaInvoke,
        fetch: fetchFn,
        createServicePool,
      });
    },
  };
}
