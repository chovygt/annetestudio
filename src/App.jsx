import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ClientDashboard from './pages/ClientDashboard.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RequireAdmin({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
    )
  }
  if (session?.user && !profile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando perfil…</div>
    )
  }
  if (profile?.role !== 'administrador') {
    return <Navigate to="/" replace />
  }
  return children
}

function HomeGate() {
  const { session, profile, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
    )
  }
  if (session?.user && !profile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando perfil…</div>
    )
  }
  if (profile?.role === 'administrador') {
    return <Navigate to="/admin" replace />
  }
  return <ClientDashboard />
}

function AppRoutes() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
          ) : session ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/registro"
        element={
          loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</div>
          ) : session ? (
            <Navigate to="/" replace />
          ) : (
            <RegisterPage />
          )
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomeGate />
          </RequireAuth>
        }
      />
      <Route
        path="/mi-tarjeta"
        element={
          <RequireAuth>
            <ClientDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App({ initialAuthLinkError = null }) {
  return (
    <AuthProvider initialAuthLinkError={initialAuthLinkError}>
      <AppRoutes />
    </AuthProvider>
  )
}
