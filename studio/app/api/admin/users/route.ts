import { NextRequest, NextResponse } from 'next/server';
import { isCognito } from '@/lib/studio-auth';
import { listUsers, createUser, deleteUser, enableUser, disableUser, resetUserPassword } from '@/lib/studio-cognito';

function notAvailable() {
  return NextResponse.json({ error: 'Admin API requires STUDIO_AUTH=cognito' }, { status: 403 });
}

export async function GET() {
  if (!isCognito()) return notAvailable();
  try {
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isCognito()) return notAvailable();
  const body = await req.json() as { email?: string };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  try {
    await createUser(body.email);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isCognito()) return notAvailable();
  const username = new URL(req.url).searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  try {
    await deleteUser(username);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isCognito()) return notAvailable();
  const username = new URL(req.url).searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

  const body = await req.json() as { action: string };
  try {
    if (body.action === 'enable') await enableUser(username);
    else if (body.action === 'disable') await disableUser(username);
    else if (body.action === 'reset-password') await resetUserPassword(username);
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
