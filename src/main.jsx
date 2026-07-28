import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import AppErrorBoundary from "./components/Common/AppErrorBoundary";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";

import "./styles/global.css";
import "./styles/layout.css";
import "./styles/pages.css";
import "./styles/dashboard.css";
import "./styles/invoices.css";
import "./styles/accounts.css";
import "./styles/transfers.css";
import "./styles/recurrences.css";

const THEME_STORAGE_KEY = "clareza-theme";

function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch {
    // O aplicativo continua funcionando caso o armazenamento esteja indisponível.
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const initialTheme = getInitialTheme();

document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    'Não foi possível iniciar o aplicativo: elemento "#root" não encontrado.',
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <PwaUpdatePrompt />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
