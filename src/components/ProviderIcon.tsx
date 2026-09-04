import type { Provider } from '@supabase/supabase-js'

/**
 * Brand glyphs drawn inline. Each provider's mark is served from our own
 * bundle rather than a third-party CDN, so no sign-in button leaks a request
 * to another domain before the user has chosen one.
 */
export function ProviderIcon({ provider }: { provider: Provider }) {
  const common = { width: 17, height: 17, 'aria-hidden': true } as const

  switch (provider) {
    case 'google':
      return (
        <svg {...common} viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z"/>
          <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
      )
    case 'azure':
      return (
        <svg {...common} viewBox="0 0 23 23">
          <path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M12 1h10v10H12z"/>
          <path fill="#00A4EF" d="M1 12h10v10H1z"/><path fill="#FFB900" d="M12 12h10v10H12z"/>
        </svg>
      )
    case 'github':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/>
        </svg>
      )
    case 'discord':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="#5865F2">
          <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.1 1.7a13.9 13.9 0 0 0-9.2-.7l-1-.3A14 14 0 0 0 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.7 8.8-.1 13.1.3 17.3a19.9 19.9 0 0 0 6 3l1.2-2c-.7-.2-1.3-.6-1.9-1l.5-.3a14.2 14.2 0 0 0 12 0l.5.3c-.6.4-1.2.8-1.9 1l1.2 2a19.9 19.9 0 0 0 6-3c.5-4.9-.8-9.1-3.6-12.9zM8.1 14.8c-1.2 0-2.1-1.1-2.1-2.4S6.9 10 8.1 10s2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4zm7.8 0c-1.2 0-2.1-1.1-2.1-2.4S14.7 10 15.9 10 18 11.1 18 12.4s-.9 2.4-2.1 2.4z"/>
        </svg>
      )
    case 'facebook':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/>
        </svg>
      )
    case 'apple':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.6 12.7c0-2.6 2.1-3.9 2.2-4a5 5 0 0 0-3.9-2.1c-1.6-.2-3.2 1-4 1s-2.1-1-3.4-1A5.2 5.2 0 0 0 4 9.3c-1.9 3.3-.5 8.1 1.3 10.8.9 1.3 2 2.7 3.3 2.7s1.8-.9 3.4-.9 2 .9 3.4.8 2.3-1.3 3.2-2.6a11 11 0 0 0 1.4-3 4.7 4.7 0 0 1-2.4-4.4zM15 4.6A4.7 4.7 0 0 0 16.1 1a4.8 4.8 0 0 0-3.1 1.6A4.4 4.4 0 0 0 11.8 6 4 4 0 0 0 15 4.6z"/>
        </svg>
      )
    default:
      return <span {...common} />
  }
}
