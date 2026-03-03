import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import usePlayersStore from './store/playersStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MatchSetupPage from './pages/MatchSetupPage';
import MatchPage from './pages/MatchPage';
import HistoryPage from './pages/HistoryPage';
import MatchDetailPage from './pages/MatchDetailPage';
import ScheduledMatchDetailPage from './pages/ScheduledMatchDetailPage';
import PlayersPage from './pages/PlayersPage';
import AdminPage from './pages/AdminPage';
import StagioniPage from './pages/StagioniPage';
import StatsPage from './pages/StatsPage';
import Layout from './components/Layout';
import Spinner from './components/Spinner';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <Spinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, role, loading } = useAuthStore();
  if (loading) return <Spinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== 'admin' && role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const initAuth = useAuthStore(s => s.init);
  const initPlayers = usePlayersStore(s => s.init);
  const { user } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (user) {
      initPlayers();
      return () => usePlayersStore.getState().cleanup();
    }
  }, [user]);

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#2D3748',
            color: '#F7FAFC',
            border: '1px solid #4A5568',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.9rem',
          },
          success: { iconTheme: { primary: '#4FD1C5', secondary: '#1A202C' } },
          error:   { iconTheme: { primary: '#FC8181', secondary: '#1A202C' } },
        }}
      />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="match/setup" element={<MatchSetupPage />} />
          <Route path="match/:id" element={<MatchPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/scheduled/:id" element={<ScheduledMatchDetailPage />} />
          <Route path="history/:id" element={<MatchDetailPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="stagioni" element={<StagioniPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
