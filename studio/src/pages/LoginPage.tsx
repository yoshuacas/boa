import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/login-form';
import { useAuth } from '@/src/context/AuthContext';

export default function LoginPage() {
  const { authenticated, authMode, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (authenticated || authMode === 'none')) {
      navigate('/', { replace: true });
    }
  }, [authenticated, authMode, loading, navigate]);

  if (loading) return null;

  return <LoginForm mode={authMode === 'cognito' ? 'cognito' : 'token'} />;
}
