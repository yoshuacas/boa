import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';

interface Props {
  mode: 'token' | 'cognito';
}

export function LoginForm({ mode }: Props) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeSession, setChallengeSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isNewPasswordStep = challengeSession !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = mode === 'cognito'
        ? isNewPasswordStep
          ? { email, password, newPassword, session: challengeSession }
          : { email, password }
        : { password };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string; challenge?: string; session?: string };

      if (!res.ok) throw new Error(data.error || 'Login failed');

      if (data.challenge === 'NEW_PASSWORD_REQUIRED') {
        setChallengeSession(data.session ?? null);
        setLoading(false);
        return;
      }

      await refresh();
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
      <div className="w-full max-w-sm mx-4">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-white tracking-tight">BOA Studio</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isNewPasswordStep
              ? 'Set a new password to continue'
              : mode === 'cognito'
                ? 'Sign in with your account'
                : 'Enter your access token to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'cognito' && !isNewPasswordStep && (
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              required
              className="w-full bg-[#1c1c21] border border-[#2a2a2f] text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-gray-500 placeholder:text-gray-600"
            />
          )}

          {!isNewPasswordStep && (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'cognito' ? 'Password' : 'Access token'}
              autoFocus={mode === 'token'}
              required
              className="w-full bg-[#1c1c21] border border-[#2a2a2f] text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-gray-500 placeholder:text-gray-600"
            />
          )}

          {isNewPasswordStep && (
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
              autoFocus
              required
              className="w-full bg-[#1c1c21] border border-[#2a2a2f] text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-gray-500 placeholder:text-gray-600"
            />
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              (isNewPasswordStep ? !newPassword : (
                !password || (mode === 'cognito' && !email)
              ))
            }
            className="w-full bg-white text-black text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Signing in…'
              : isNewPasswordStep
                ? 'Set password'
                : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
