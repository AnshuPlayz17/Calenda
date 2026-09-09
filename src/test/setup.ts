import '@testing-library/jest-dom/vitest'

/**
 * Everything below patches jsdom, so it has to stand aside in a test file that
 * asked for the node environment instead -- `edgeFunctions.test.ts` does,
 * because esbuild refuses to start under jsdom. Without this guard that file
 * fails at setup with "window is not defined", which points at the wrong thing
 * entirely.
 */
const hasDom = typeof window !== 'undefined'

// jsdom has no matchMedia, which the theme provider reads on mount.
if (hasDom && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

// jsdom has no IntersectionObserver, which Motion's `whileInView` constructs
// on mount. A no-op is enough: the content it reveals is in the DOM either
// way -- reveal only animates opacity -- and nothing here asserts on that.
if (!('IntersectionObserver' in globalThis)) {
  class NoopObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: number[] = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return [] }
  }
  globalThis.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver
}
