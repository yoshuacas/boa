import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { loadBoaConfigWithRoot } from '@/lib/boa-config';
import { writePolicy } from '@/lib/cedar-policies';
import { getStackFunctions } from '@/lib/stack-functions';
import { getAwsClients } from '@/lib/aws-clients';
import {
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  waitUntilFunctionUpdated,
} from '@aws-sdk/client-lambda';

export async function POST(req: NextRequest) {
  const body = await req.json() as { filename: string; content: string };
  const { filename, content } = body;

  if (!filename || typeof content !== 'string') {
    return NextResponse.json({ error: 'filename and content required' }, { status: 400 });
  }

  const result = await loadBoaConfigWithRoot();
  if (!result) return NextResponse.json({ error: 'No BOA config found' }, { status: 404 });
  const { config: cfg, projectRoot } = result;

  // 1. Save the file locally first
  try {
    await writePolicy(projectRoot, filename, content);
  } catch (err: unknown) {
    return NextResponse.json({ error: `Failed to save file: ${String(err)}` }, { status: 400 });
  }

  // 2. Find the API Lambda function
  let apiFunctionName: string;
  try {
    const fns = await getStackFunctions(cfg);
    const apiFn = fns.find(f => f.kind === 'api');
    if (!apiFn) {
      return NextResponse.json({ error: 'No API Lambda function found in stack' }, { status: 404 });
    }
    apiFunctionName = apiFn.physicalId;
  } catch (err: unknown) {
    return NextResponse.json({ error: `Failed to find Lambda: ${String(err)}` }, { status: 500 });
  }

  const { lambda } = getAwsClients(cfg);

  // 3. Download the current Lambda code zip
  let zipBuffer: Buffer;
  try {
    const fn = await lambda.send(new GetFunctionCommand({ FunctionName: apiFunctionName }));
    const codeUrl = fn.Code?.Location;
    if (!codeUrl) {
      return NextResponse.json({ error: 'Could not get Lambda code URL' }, { status: 500 });
    }
    const resp = await fetch(codeUrl);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    zipBuffer = Buffer.from(await resp.arrayBuffer());
  } catch (err: unknown) {
    return NextResponse.json({ error: `Failed to download Lambda code: ${String(err)}` }, { status: 500 });
  }

  // 4. Patch the zip — update or add the policy file
  try {
    const zip = new AdmZip(zipBuffer);
    const entryPath = `policies/${filename}`;

    const existing = zip.getEntry(entryPath);
    if (existing) {
      zip.updateFile(entryPath, Buffer.from(content, 'utf-8'));
    } else {
      zip.addFile(entryPath, Buffer.from(content, 'utf-8'));
    }

    zipBuffer = zip.toBuffer();
  } catch (err: unknown) {
    return NextResponse.json({ error: `Failed to patch zip: ${String(err)}` }, { status: 500 });
  }

  // 5. Upload patched zip back to Lambda
  try {
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: apiFunctionName,
      ZipFile: zipBuffer,
    }));

    // Wait for the update to complete before returning
    await waitUntilFunctionUpdated(
      { client: lambda, maxWaitTime: 60 },
      { FunctionName: apiFunctionName }
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: `Failed to update Lambda: ${String(err)}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, functionName: apiFunctionName });
}
