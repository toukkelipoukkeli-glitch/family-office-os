/// <reference types="vite/client" />

/**
 * Typed Vite environment variables exposed to the client at build time. Only
 * `VITE_`-prefixed vars are inlined by Vite; these are the ones this app reads.
 */
interface ImportMetaEnv {
  /** Convex deployment client URL, written to `.env.local` by `convex dev`. */
  readonly VITE_CONVEX_URL?: string;
  /** Convex HTTP actions URL, written to `.env.local` by `convex dev`. */
  readonly VITE_CONVEX_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
