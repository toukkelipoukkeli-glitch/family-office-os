import { ConvexReactClient } from "convex/react";

/**
 * The Convex deployment URL, injected at build time from `VITE_CONVEX_URL`
 * (written to `.env.local` by `convex dev`). May be undefined in environments
 * that build without a configured deployment (e.g. CI), which is why
 * {@link convexClient} can be `null` and the provider degrades gracefully.
 */
export const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL;

/**
 * A singleton {@link ConvexReactClient}, or `null` when no deployment URL is
 * configured. Consumers should treat `null` as "backend not wired up" rather
 * than throwing, so the read-only UI still renders from local fixtures.
 */
export const convexClient: ConvexReactClient | null = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;
