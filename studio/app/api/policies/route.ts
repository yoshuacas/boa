import { NextRequest, NextResponse } from 'next/server';
import { loadBoaConfigWithRoot } from '@/lib/boa-config';
import { listPolicies, readPolicy, writePolicy, deletePolicy } from '@/lib/cedar-policies';

async function getConfigAndRoot() {
  const result = await loadBoaConfigWithRoot();
  if (!result) return null;
  return result;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  const result = await getConfigAndRoot();
  if (!result) return NextResponse.json({ error: 'No BOA config found' }, { status: 404 });

  if (filename) {
    const policy = await readPolicy(result.config, result.projectRoot, filename);
    if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(policy);
  }

  const policies = await listPolicies(result.config, result.projectRoot);
  return NextResponse.json({ policies });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  const result = await getConfigAndRoot();
  if (!result) return NextResponse.json({ error: 'No BOA config found' }, { status: 404 });

  if (!result.projectRoot) {
    return NextResponse.json({ error: 'Local saves are not available in cloud mode — use Deploy instead' }, { status: 400 });
  }

  const body = await req.json() as { content: string };
  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  try {
    await writePolicy(result.projectRoot, filename, body.content);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const result = await getConfigAndRoot();
  if (!result) return NextResponse.json({ error: 'No BOA config found' }, { status: 404 });

  if (!result.projectRoot) {
    return NextResponse.json({ error: 'Local saves are not available in cloud mode — use Deploy instead' }, { status: 400 });
  }

  const body = await req.json() as { filename: string; content: string };
  if (!body.filename || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'filename and content required' }, { status: 400 });
  }

  try {
    await writePolicy(result.projectRoot, body.filename, body.content);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  const result = await getConfigAndRoot();
  if (!result) return NextResponse.json({ error: 'No BOA config found' }, { status: 404 });

  if (!result.projectRoot) {
    return NextResponse.json({ error: 'Deleting policies is not supported in cloud mode' }, { status: 400 });
  }

  try {
    await deletePolicy(result.projectRoot, filename);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
