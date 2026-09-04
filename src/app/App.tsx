import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { AppShell } from './AppShell'
import { SignIn } from '@/routes/SignIn'
import { AuthCallback } from '@/routes/AuthCallback'
import { Dashboard } from '@/routes/Dashboard'
import { NotFound } from '@/routes/NotFound'
import {
  AdminPage, CalendarPage, ClassesPage, NotificationsPage, SettingsPage, SuggestionsPage,
} from '@/routes/sections'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
      <span className="sr-only" role="status">Loading</span>
    </div>
  )
}

/** Waits for the first session check so a signed-in user never sees sign-in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location }} />
  return <>{children}</>
}

/** Admin routes are gated here and, authoritatively, by RLS in the database. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* Hash routing: GitHub Pages has no server to rewrite deep links, and
            the PKCE flow returns its code as a query param, so the two do not
            collide. */}
        <HashRouter>
          <AuthProvider>
            <Routes>
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="classes" element={<ClassesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="suggestions" element={<SuggestionsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route
                  path="admin"
                  element={
                    <RequireAdmin>
                      <AdminPage />
                    </RequireAdmin>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AuthProvider>
        </HashRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
