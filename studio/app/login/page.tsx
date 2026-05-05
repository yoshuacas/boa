import { getAuthMode } from '@/lib/studio-auth';
import { LoginForm } from '@/components/login-form';

export default function LoginPage() {
  const mode = getAuthMode();
  return <LoginForm mode={mode === 'cognito' ? 'cognito' : 'token'} />;
}
