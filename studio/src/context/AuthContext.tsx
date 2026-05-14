import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AuthMode = 'none' | 'token' | 'cognito';

interface AuthState {
  authenticated: boolean;
  authMode: AuthMode;
  studioMode: 'local' | 'cloud';
  loading: boolean;
  apiError: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  authenticated: false,
  authMode: 'none',
  studioMode: 'local',
  loading: true,
  apiError: false,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [studioMode, setStudioMode] = useState<'local' | 'cloud'>('local');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json() as {
          authenticated: boolean;
          authMode: AuthMode;
          studioMode: 'local' | 'cloud';
        };
        setAuthenticated(data.authenticated);
        setAuthMode(data.authMode);
        setStudioMode(data.studioMode);
        setApiError(false);
      } else {
        setAuthenticated(false);
        setApiError(true);
      }
    } catch {
      setAuthenticated(false);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, authMode, studioMode, loading, apiError, refresh: checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
