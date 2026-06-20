import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { AppConvexProvider } from "./lib/ConvexProvider.tsx";
import {
  applyTheme,
  getStoredPreference,
  resolveTheme,
} from "./lib/theme/theme.ts";
import "./index.css";

// Apply the persisted theme before the first paint so there is no flash of the
// wrong color scheme while React mounts the shell.
applyTheme(resolveTheme(getStoredPreference()), document.documentElement);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppConvexProvider>
      <App />
    </AppConvexProvider>
  </StrictMode>,
);
