import type { Provider } from '@supabase/supabase-js'

export type AuthProviderConfig = {
  id: Provider
  label: string
  /**
   * Disabled providers still ship their button, callback route and linking
   * logic -- enabling one is configuration, not a rebuild. Nothing disabled
   * is rendered.
   */
  enabled: boolean
  /** Why it is off, shown only in developer docs, never to a user. */
  note?: string
}

export const authProviders: AuthProviderConfig[] = [
  { id: 'google', label: 'Google', enabled: true },
  { id: 'azure', label: 'Microsoft', enabled: true },
  { id: 'github', label: 'GitHub', enabled: true },
  { id: 'discord', label: 'Discord', enabled: true },
  { id: 'facebook', label: 'Facebook', enabled: true },
  {
    id: 'apple',
    label: 'Apple',
    enabled: false,
    note: 'Requires an Apple Developer Program membership at $99 USD/year to '
      + 'create the Service ID and signing key. Flip enabled to true once the '
      + 'credentials exist in Supabase.',
  },
]

export const enabledProviders = authProviders.filter((p) => p.enabled)
