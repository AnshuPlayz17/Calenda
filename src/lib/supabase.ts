import { createClient } from '@supabase/supabase-js'
import { env, isConfigured } from './env'

/**
 * Sessions persist in localStorage and refresh in the background. detectSession
 * InUrl is on so the OAuth redirect back into the SPA is consumed automatically.
 */
export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)

export { isConfigured }
