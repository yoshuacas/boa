// Server-only helper for Studio's Cognito user pool admin operations.
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminResetUserPasswordCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';

function getClient() {
  const region = process.env.STUDIO_COGNITO_REGION || 'us-east-1';
  return new CognitoIdentityProviderClient({ region });
}

function getPoolId(): string {
  const id = process.env.STUDIO_COGNITO_USER_POOL_ID;
  if (!id) throw new Error('STUDIO_COGNITO_USER_POOL_ID is not configured');
  return id;
}

function attr(user: UserType, name: string): string {
  return user.Attributes?.find(a => a.Name === name)?.Value ?? '';
}

export type StudioUser = {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  createdAt: string | null;
};

function toStudioUser(u: UserType): StudioUser {
  return {
    username: u.Username ?? '',
    email: attr(u, 'email'),
    status: u.UserStatus ?? '',
    enabled: u.Enabled ?? true,
    createdAt: u.UserCreateDate?.toISOString() ?? null,
  };
}

export async function listUsers(): Promise<StudioUser[]> {
  const client = getClient();
  const res = await client.send(new ListUsersCommand({ UserPoolId: getPoolId() }));
  return (res.Users ?? []).map(toStudioUser).sort((a, b) => a.email.localeCompare(b.email));
}

export async function createUser(email: string): Promise<void> {
  const client = getClient();
  await client.send(new AdminCreateUserCommand({
    UserPoolId: getPoolId(),
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    // Cognito sends the invitation email with a temporary password.
    DesiredDeliveryMediums: ['EMAIL'],
  }));
}

export async function deleteUser(username: string): Promise<void> {
  const client = getClient();
  await client.send(new AdminDeleteUserCommand({ UserPoolId: getPoolId(), Username: username }));
}

export async function enableUser(username: string): Promise<void> {
  const client = getClient();
  await client.send(new AdminEnableUserCommand({ UserPoolId: getPoolId(), Username: username }));
}

export async function disableUser(username: string): Promise<void> {
  const client = getClient();
  await client.send(new AdminDisableUserCommand({ UserPoolId: getPoolId(), Username: username }));
}

export async function resetUserPassword(username: string): Promise<void> {
  const client = getClient();
  await client.send(new AdminResetUserPasswordCommand({ UserPoolId: getPoolId(), Username: username }));
}
