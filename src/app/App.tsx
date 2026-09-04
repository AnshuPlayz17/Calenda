import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { PreviewProvider, usePreview } from '@/lib/preview'
import { AppShell } from './AppShell'
import { Landing } from '@/routes/Landing'
import { SignIn } from '@/routes/SignIn'
import { SignUp } from '@/routes/SignUp'
import { Welcome } from '@/routes/Welcome'
import { AuthCallback } from '@/routes/AuthCallback'
import { Dashboard } from '@/routes/Dashboard'
import { NotFound } from '@/routes/NotFound'
import { NotificationsPage } from '@/routes/Notifications'
import { ClassesPage } from '@/routes/Classes'
import { ClassWorkspace } from '@/routes/ClassWorkspace'
import { SettingsPage } from '@/routes/Settings'
import { SuggestionsPage } from '@/routes/Suggestions'
import { AdminPage } from '@/routes/Admin'
import { CalendarPage } from '@/routes/Calendar'
import { SchoolYearProvider } from '@/features/schoolYear/SchoolYearProvider'

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
  const preview = usePreview()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  // Preview is only ever available when Supabase is unconfigured, so this can
  // never act as a bypass in a real deployment.
  if (!session && !preview.active) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }
  return <>{children}</>
}

/** Admin routes are gated here and, authoritatively, by RLS in the database. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  const preview = usePreview()
  if (loading) return <FullPageLoader />
  // Preview runs entirely on sample data with no real database behind it, so
  // showing the admin screens there reveals nothing. RLS is still the
  // authority for a real session.
  if (!isAdmin && !preview.active) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function App() {
  return (
    <ThemeProvider>
      <PreviewProvider>
      <QueryClientProvider client={queryClient}>
        {/* Hash routing: GitHub Pages has no server to rewrite deep links, and
            the PKCE flow returns its code as a query param, so the two do not
            collide. */}
        <HashRouter>
          <AuthProvider>
            <SchoolYearProvider>
            <Routes>
              {/* Public. The landing page redirects anyone already signed
                  in straight to their dashboard. */}
              <Route path="/" element={<Landing />} />
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/sign-up" element={<SignUp />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="classes" element={<ClassesPage />} />
                <Route path="classes/:classId" element={<ClassWorkspace />} />
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
            </SchoolYearProvider>
          </AuthProvider>
        </HashRouter>
      </QueryClientProvider>
      </PreviewProvider>
    </ThemeProvider>
  )
}
