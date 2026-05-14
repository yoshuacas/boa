import { BoaConfig, QueryResult } from '@/types/boa';
import { runQuery } from './dsql-client';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  image: string | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function getUsers(cfg: BoaConfig): Promise<AuthUser[]> {
  const result = await runQuery(cfg, `
    SELECT id, email, name, "emailVerified", "createdAt", "updatedAt", image
    FROM better_auth.user
    ORDER BY "createdAt" DESC
    LIMIT 500
  `);
  if (result.error) throw new Error(result.error);
  return result.rows as unknown as AuthUser[];
}

export async function getUserCount(cfg: BoaConfig): Promise<number> {
  const result = await runQuery(cfg, `SELECT COUNT(*)::int AS count FROM better_auth.user`);
  if (result.error) throw new Error(result.error);
  return (result.rows[0]?.count as number) ?? 0;
}

export async function getActiveSessions(cfg: BoaConfig): Promise<number> {
  const result = await runQuery(
    cfg,
    `SELECT COUNT(*)::int AS count FROM better_auth.session WHERE "expiresAt" > NOW()`
  );
  if (result.error) throw new Error(result.error);
  return (result.rows[0]?.count as number) ?? 0;
}

export async function checkBetterAuthSchema(cfg: BoaConfig): Promise<boolean> {
  const result = await runQuery(
    cfg,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'better_auth' AND tablename = 'user'`
  );
  return !result.error && result.rows.length > 0;
}
