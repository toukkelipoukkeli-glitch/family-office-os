import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { AppConvexProvider } from "./lib/ConvexProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppConvexProvider>
      <App />
    </AppConvexProvider>
  </StrictMode>,
);
