import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { PreviewProvider, usePreview } from '@/lib/preview'

/**
 * The public entry points load eagerly; the signed-in app does not.
 *
 * Everything used to arrive in one chunk, so somebody who opened the landing
 * page to read about Calenda and never signed in still downloaded the rich-text
 * editor, the calendar grid, the admin screens and every route in the app
 * before the first headline could paint. That is the wrong way round: the
 * landing page is the one screen a stranger sees, and it needs the least code.
 *
 * Sign-in and the OAuth callback stay eager on purpose. They sit in the middle
 * of a redirect chain, and a loading spinner between "clicked Google" and
 * "signed in" reads as a failure.
 */
import { Landing } from '@/routes/Landing'
import { SignIn } from '@/routes/SignIn'
import { SignUp } from '@/routes/SignUp'
import { AuthCallback } from '@/routes/AuthCallback'

/* The founder page is a section of the landing page now, not a page of its own.
   The old URL is kept because it has been linked; it lands on the section. */

/** Named exports, so each needs unwrapping into the default `lazy` expects. */
const AppShell = lazy(() => import('./AppShell').then((m) => ({ default: m.AppShell })))
const Welcome = lazy(() => import('@/routes/Welcome').then((m) => ({ default: m.Welcome })))
const Dashboard = lazy(() => import('@/routes/Dashboard').then((m) => ({ default: m.Dashboard })))
const NotFound = lazy(() => import('@/routes/NotFound').then((m) => ({ default: m.NotFound })))
const NotificationsPage = lazy(() => import('@/routes/Notifications').then((m) => ({ default: m.NotificationsPage })))
const ClassesPage = lazy(() => import('@/routes/Classes').then((m) => ({ default: m.ClassesPage })))
const ClassWorkspace = lazy(() => import('@/routes/ClassWorkspace').then((m) => ({ default: m.ClassWorkspace })))
const SettingsPage = lazy(() => import('@/routes/Settings').then((m) => ({ default: m.SettingsPage })))
const SuggestionsPage = lazy(() => import('@/routes/Suggestions').then((m) => ({ default: m.SuggestionsPage })))
const AdminPage = lazy(() => import('@/routes/Admin').then((m) => ({ default: m.AdminPage })))
const CalendarPage = lazy(() => import('@/routes/Calendar').then((m) => ({ default: m.CalendarPage })))
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
            {/* One boundary for every split route. The fallback is the same
                full-page loader the auth check already uses, so a cold chunk
                and a slow session check look identical rather than like two
                different kinds of waiting. */}
            <Suspense fallback={<FullPageLoader />}>
            <Routes>
              {/* Public. The landing page redirects anyone already signed
                  in straight to their dashboard. */}
              <Route path="/" element={<Landing />} />
              {/* The same page, but it does not bounce a signed-in reader to
                  the dashboard -- this is the one the app links to. */}
              <Route path="/about" element={<Landing redirectSignedIn={false} />} />
              <Route path="/created-by" element={<Navigate to="/about#founder" replace />} />
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
            </Suspense>
            </SchoolYearProvider>
          </AuthProvider>
        </HashRouter>
      </QueryClientProvider>
      </PreviewProvider>
    </ThemeProvider>
  )
}
