// Types for the CSP plugin, so vite.config.ts stays checked. The plugin itself
// is plain JavaScript because it runs before anything is compiled.
export declare function cspPlugin(): {
  name: string
  apply: 'build'
  transformIndexHtml(html: string): string
}
