import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
    <div className="flex h-screen overflow-hidden bg-[#0f1117]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

function ProtectedRoute() {
  const { authenticated, authMode, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading...</div>
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
  );
}
