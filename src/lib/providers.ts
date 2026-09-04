import type { Provider } from '@supabase/supabase-js'

export type AuthProviderConfig = {
  id: Provider
  label: string
  /**
   * Whether this provider has credentials configured in the Supabase
   * dashboard. A provider that is listed but not configured fails with an
   * opaque error the moment it is clicked, which is worse than not offering
   * it -- so only configured ones are rendered.
   *
   * Turning one on is configuration, not a rebuild: add the client ID and
   * secret under Authentication -> Providers in Supabase, then flip this flag.
   */
  enabled: boolean
  /** Why it is off. Developer-facing only; never shown to a user. */
  note?: string
}

export const authProviders: AuthProviderConfig[] = [
  {
    id: 'google',
    label: 'Google',
    enabled: true,
  },
  {
    id: 'azure',
    label: 'Microsoft',
    enabled: false,
    note: 'Needs an Azure app registration and a client secret in Supabase. '
      + 'Free to create with a Microsoft account.',
  },
  {
    id: 'github',
    label: 'GitHub',
    enabled: false,
    note: 'Needs a GitHub OAuth app and its client secret in Supabase. Free.',
  },
  {
    id: 'discord',
    label: 'Discord',
    enabled: false,
    note: 'Needs a Discord application and its client secret in Supabase. Free.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    enabled: false,
    note: 'Needs a Meta app with Facebook Login configured. Free, but Meta '
      + 'requires a privacy policy URL and app review before public use.',
  },
  {
    id: 'apple',
    label: 'Apple',
    enabled: false,
    note: 'Requires an Apple Developer Program membership at $99 USD/year to '
      + 'create the Service ID and signing key. Not free.',
  },
]

export const enabledProviders = authProviders.filter((p) => p.enabled)
