import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import StorageAlert from "../StorageAlert";
import ConflictDialog from "../Sync/ConflictDialog";
import SyncStatus from "../Sync/SyncStatus";
import Header from "./Header";
import Sidebar from "./Sidebar";

const THEME_STORAGE_KEY = "clareza-theme";

const PAGE_INFORMATION = {
  "/": {
    eyebrow: "Visão geral",
    title: "Suas finanças, com clareza.",
    description: "Acompanhe seu saldo, suas contas e os principais alertas.",
  },
  "/dashboard": {
    eyebrow: "Visão geral",
    title: "Suas finanças, com clareza.",
    description: "Acompanhe seu saldo, suas contas e os principais alertas.",
  },
  "/lancamentos": {
    eyebrow: "Movimentações",
    title: "Lançamentos",
    description:
      "Cadastre, filtre e acompanhe suas receitas e despesas financeiras.",
  },
  "/transferencias": {
    eyebrow: "Movimentações",
    title: "Transferências",
    description:
      "Registre e acompanhe transferências realizadas entre suas contas.",
  },
  "/recorrencias": {
    eyebrow: "Automação",
    title: "Recorrências",
    description:
      "Gerencie lançamentos que se repetem automaticamente ao longo do tempo.",
  },
  "/faturas": {
    eyebrow: "Cartões",
    title: "Faturas",
    description:
      "Acompanhe vencimentos, pagamentos e lançamentos dos seus cartões.",
  },
  "/analises": {
    eyebrow: "Inteligência financeira",
    title: "Análises",
    description:
      "Visualize a evolução financeira e planeje os próximos períodos.",
  },
  "/configuracoes": {
    eyebrow: "Sistema",
    title: "Configurações",
    description:
      "Gerencie contas, backups, diagnósticos e ferramentas de integridade.",
  },
};

function getCurrentTheme() {
  const currentTheme = document.documentElement.dataset.theme;

  return currentTheme === "dark" ? "dark" : "light";
}

function getPageInformation(pathname) {
  if (PAGE_INFORMATION[pathname]) {
    return PAGE_INFORMATION[pathname];
  }

  const matchingPath = Object.keys(PAGE_INFORMATION)
    .filter((path) => path !== "/")
    .find((path) => pathname.startsWith(`${path}/`));

  return (
    PAGE_INFORMATION[matchingPath] || {
      eyebrow: "Clareza",
      title: "Página não encontrada",
      description: "O endereço acessado não corresponde a uma página válida.",
    }
  );
}

export default function AppLayout() {
  const location = useLocation();

  const [theme, setTheme] = useState(getCurrentTheme);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const pageInformation = getPageInformation(location.pathname);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // O tema continua funcionando durante a sessão caso o navegador
      // não permita salvar preferências no armazenamento local.
    }
  }, [theme]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isSidebarOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSidebarOpen]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  const openSidebar = () => {
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="application-layout">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {isSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu de navegação"
          onClick={closeSidebar}
        />
      )}

      <div className="application-content">
        <div className="app-shell">
          <Header
            theme={theme}
            eyebrow={pageInformation.eyebrow}
            title={pageInformation.title}
            description={pageInformation.description}
            onToggleTheme={toggleTheme}
            onOpenMenu={openSidebar}
          />

          <StorageAlert />
          <SyncStatus />
          <ConflictDialog />

          <main className="page-main">
            <Outlet />
          </main>

          <footer className="application-footer">
            <p>Clareza — organização financeira para decisões melhores.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
