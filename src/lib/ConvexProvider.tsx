import { type ReactNode } from "react";
import { ConvexProvider as ConvexReactProvider } from "convex/react";

import { convexClient } from "./convex";

/**
 * Wraps the app with the Convex client so descendants can use `useQuery` /
 * `useMutation`. If no deployment URL is configured (`convexClient === null`),
 * children are rendered without a provider — the read-only UI still works from
 * local fixtures, and any Convex hook used downstream would surface its own
 * "missing provider" error rather than crashing the whole tree at startup.
 */
export function AppConvexProvider({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return <>{children}</>;
  }
  return (
    <ConvexReactProvider client={convexClient}>{children}</ConvexReactProvider>
  );
}
