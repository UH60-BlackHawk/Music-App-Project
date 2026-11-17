/**
 * Live mode = the app is connected to a backend (Supabase, or the local test bridge).
 * Otherwise it runs on the built-in sample data, entirely in the browser.
 * Kept separate from store.ts and live.ts so both can read it without importing each other.
 */
const env = import.meta.env
export const LIVE = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) || !!env.VITE_TEST_BRIDGE

/** Server-side actions that live.ts provides for store actions to call in live mode. */
export const liveHooks: {
  setPhase?: (phase: 'nominations' | 'voting' | 'reveal') => Promise<void>
  resolveReport?: (id: string, remove: boolean) => Promise<void>
  signOut?: () => Promise<void>
} = {}
