import { NextRequest, NextResponse } from 'next/server';
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
} from '@aws-sdk/client-lambda';
import {
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { loadBoaConfig } from '@/lib/boa-config';
import { getAwsClients } from '@/lib/aws-clients';
import { getStackFunctions } from '@/lib/stack-functions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, functionName, payload, startTime, configPath } = body;

    const cfg = await loadBoaConfig(configPath);
    if (!cfg) return NextResponse.json({ error: 'No .boa/config.json found' }, { status: 404 });

    // Stack discovery — no functionName required
    if (action === 'stack-functions') {
      const functions = await getStackFunctions(cfg);
      return NextResponse.json({ functions });
    }

    const { lambda, logs } = getAwsClients(cfg);
    if (!functionName) return NextResponse.json({ error: 'functionName is required' }, { status: 400 });
    const fnName = functionName;

    if (action === 'config') {
      const result = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fnName }));
      return NextResponse.json({
        functionName: result.FunctionName,
        runtime: result.Runtime,
        handler: result.Handler,
        memorySize: result.MemorySize,
        timeout: result.Timeout,
        lastModified: result.LastModified,
        codeSize: result.CodeSize,
        description: result.Description,
        environment: result.Environment?.Variables || {},
      });
    }

    if (action === 'logs') {
      const logGroupName = `/aws/lambda/${fnName}`;
      const since = startTime ?? Date.now() - 30 * 60 * 1000; // last 30 min default
      const result = await logs.send(new FilterLogEventsCommand({
        logGroupName,
        startTime: since,
        limit: 200,
      }));
      return NextResponse.json({
        events: (result.events || []).map(e => ({
          timestamp: e.timestamp,
          message: e.message?.trim(),
          logStreamName: e.logStreamName,
        })),
      });
    }

    if (action === 'invoke') {
      const result = await lambda.send(new InvokeCommand({
        FunctionName: fnName,
        Payload: payload ? JSON.stringify(payload) : undefined,
      }));
      const responsePayload = result.Payload
        ? JSON.parse(Buffer.from(result.Payload).toString('utf-8'))
        : null;
      return NextResponse.json({
        statusCode: result.StatusCode,
        functionError: result.FunctionError,
        payload: responsePayload,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
