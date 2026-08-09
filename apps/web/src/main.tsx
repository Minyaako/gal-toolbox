import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { queryClient } from "./query-client";
import { TrailProvider } from "./trail";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TrailProvider>
          <App />
        </TrailProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

