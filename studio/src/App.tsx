import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from '@/components/sidebar';

import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import DatabasePage from './pages/DatabasePage';
import DatabaseTablePage from './pages/DatabaseTablePage';
import SqlEditorPage from './pages/SqlEditorPage';
import AuthPage from './pages/AuthPage';
import StoragePage from './pages/StoragePage';
import FunctionsPage from './pages/FunctionsPage';
import FunctionDetailPage from './pages/FunctionDetailPage';
import PoliciesPage from './pages/PoliciesPage';
import PolicyEditorPage from './pages/PolicyEditorPage';
import AdminPage from './pages/AdminPage';

function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

function ProtectedRoute() {
  const { authenticated, authMode, loading, apiError, refresh } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-[var(--tx-3)] text-sm">Loading...</div>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm font-medium">Cannot connect to BOA Studio API</p>
          <p className="text-[var(--tx-3)] text-xs">Check that the API is reachable and try again.</p>
          <button
            onClick={refresh}
            className="mt-2 px-4 py-1.5 text-xs bg-gray-800 text-[var(--tx-2)] rounded hover:bg-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!authenticated && authMode !== 'none') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/database" element={<DatabasePage />} />
              <Route path="/database/sql" element={<SqlEditorPage />} />
              <Route path="/database/:table" element={<DatabaseTablePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/storage" element={<StoragePage />} />
              <Route path="/functions" element={<FunctionsPage />} />
              <Route path="/functions/:name" element={<FunctionDetailPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
              <Route path="/policies/:filename" element={<PolicyEditorPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}
