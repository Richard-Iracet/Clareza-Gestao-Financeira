import { lazy, Suspense, useMemo } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/Layout/AppLayout";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import { FinanceProvider } from "./context/FinanceContext";
import { SyncProvider } from "./context/SyncContext";
import { useAuth } from "./context/AuthContext";
import { activateUserSession } from "./infrastructure/storage/localFinanceRepository";
import { getBrowserStorage } from "./utils/storage";
import AnalyticsPage from "./pages/AnalyticsPage";
import DashboardPage from "./pages/DashboardPage";
import InvoicesPage from "./pages/InvoicesPage";
import RecurrencesPage from "./pages/RecurrencesPage";
import SettingsPage from "./pages/SettingsPage";
import TransactionsPage from "./pages/TransactionsPage";
import TransfersPage from "./pages/TransfersPage";
import LoginPage from "./pages/LoginPage";
import FeatureFlagGuard from "./components/Imports/FeatureFlagGuard";

const ImportsPage = lazy(() => import("./pages/ImportsPage"));

function AuthenticatedApplication() {
  const auth = useAuth();
  const activation = useMemo(() => activateUserSession(getBrowserStorage(), auth.user.id), [auth.user.id]);
  if (!activation.success) return <main className="auth-screen"><section className="auth-card" role="alert"><h1>Cache local indisponível</h1><p>{activation.message}</p></section></main>;
  return <FinanceProvider hasLocalState={activation.hasLocalState}><SyncProvider><AppLayout /></SyncProvider></FinanceProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
       <Route element={<AuthenticatedApplication />}>
        <Route index element={<DashboardPage />} />

        <Route path="dashboard" element={<DashboardPage />} />

        <Route path="lancamentos" element={<TransactionsPage />} />

        <Route path="transferencias" element={<TransfersPage />} />

        <Route path="recorrencias" element={<RecurrencesPage />} />

        <Route path="faturas" element={<InvoicesPage />} />

        <Route path="analises" element={<AnalyticsPage />} />

        <Route path="configuracoes" element={<SettingsPage />} />

        <Route path="importacoes" element={<FeatureFlagGuard><Suspense fallback={<main className="page-loading-state">Carregando importação…</main>}><ImportsPage /></Suspense></FeatureFlagGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
       </Route>
      </Route>
    </Routes>
  );
}
