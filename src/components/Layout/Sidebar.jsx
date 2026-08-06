import { NavLink } from "react-router-dom";
import { FEATURE_FLAGS, isFeatureEnabled } from "../../config/featureFlags.js";

const navigationItems = [
  { to: "/open-finance", label: "Open Finance", description: "Sincronização assistida", featureFlag: FEATURE_FLAGS.openFinanceAssistedSync, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4V10Zm2 2v6h12v-6H6Zm6-10 9 5v1H3V7l9-5Z" /></svg> },
  { to: "/reconciliacao", label: "Reconciliação", description: "Revisar correspondências", featureFlag: FEATURE_FLAGS.reconciliationReview, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7Zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2Z" /></svg> },
  {
    to: "/importacoes",
    label: "Importações",
    description: "Revisar OFX e CSV",
    featureFlag: FEATURE_FLAGS.ofxCsvImport,
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18-5 5h3v6h4V7h3l-5-5Z" /></svg>,
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Visão geral",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />
      </svg>
    ),
  },
  {
    to: "/lancamentos",
    label: "Lançamentos",
    description: "Receitas e despesas",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h10V4H7Zm2 3h6v2H9V7Zm0 4h6v2H9v-2Zm0 4h4v2H9v-2Z" />
      </svg>
    ),
  },
  {
    to: "/transferencias",
    label: "Transferências",
    description: "Entre contas",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m7.41 7.41 1.42 1.42L6.66 11H20v2H6.66l2.17 2.17-1.42 1.42L2.83 12l4.58-4.59ZM16.59 2.83 21.17 7.4l-4.58 4.59-1.42-1.42 2.17-2.17H4v-2h13.34l-2.17-2.17 1.42-1.4Z" />
      </svg>
    ),
  },
  {
    to: "/recorrencias",
    label: "Recorrências",
    description: "Lançamentos automáticos",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4a8 8 0 0 1 7.75 6h-2.08A6 6 0 0 0 7.76 7.76L10 10H4V4l2.34 2.34A7.96 7.96 0 0 1 12 4Zm0 16a8 8 0 0 1-7.75-6h2.08a6 6 0 0 0 9.91 2.24L14 14h6v6l-2.34-2.34A7.96 7.96 0 0 1 12 20Z" />
      </svg>
    ),
  },
  {
    to: "/faturas",
    label: "Faturas",
    description: "Cartões e vencimentos",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 0v2h14V5H5Zm0 6v8h14v-8H5Zm2 3h5v2H7v-2Z" />
      </svg>
    ),
  },
  {
    to: "/analises",
    label: "Análises",
    description: "Gráficos e planejamento",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 19h16v2H2V3h2v16Zm3-2H5v-6h2v6Zm4 0H9V7h2v10Zm4 0h-2V4h2v13Zm4 0h-2v-8h2v8Z" />
      </svg>
    ),
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    description: "Dados e sistema",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m19.43 12.98.04-.98-.04-.98 2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.5 7.5 0 0 0-1.69-.98L14.5 2.42A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42L9.13 5.07a7.5 7.5 0 0 0-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65-.04.98.04.98-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.37 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .5-.42l.37-2.65a7.5 7.5 0 0 0 1.69-.98l2.49 1a.5.5 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
      </svg>
    ),
  },
];

function SidebarLogo() {
  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M20 3C10.61 3 3 10.61 3 20s7.61 17 17 17 17-7.61 17-17S29.39 3 20 3Zm0 5a12 12 0 0 1 11.62 9H20V8Zm-3 1.38V20c0 .8.65 1.45 1.45 1.45h12.17A12 12 0 1 1 17 9.38Z" />
        </svg>
      </div>

      <div className="sidebar-brand-text">
        <strong>Clareza</strong>
        <span>Gestão financeira</span>
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen = false, onClose }) {
  const handleNavigation = () => {
    if (typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <aside
      id="application-sidebar"
      className={`application-sidebar${isOpen ? " is-open" : ""}`}
      aria-label="Navegação principal"
    >
      <div className="sidebar-header">
        <SidebarLogo />

        <button
          type="button"
          className="sidebar-close-button"
          aria-label="Fechar menu"
          onClick={handleNavigation}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6.7 5.3 5.3 5.29 5.3-5.3 1.4 1.42L13.42 12l5.3 5.3-1.42 1.4-5.3-5.28-5.3 5.3-1.4-1.42 5.28-5.3-5.3-5.3L6.7 5.3Z" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-navigation">
        <p className="sidebar-section-label">Menu principal</p>

        <ul className="sidebar-navigation-list">
          {navigationItems.filter((item) => !item.featureFlag || isFeatureEnabled(item.featureFlag)).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-navigation-link${isActive ? " is-active" : ""}`
                }
                onClick={handleNavigation}
              >
                <span className="sidebar-navigation-icon">{item.icon}</span>

                <span className="sidebar-navigation-content">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-content">
          <span className="sidebar-footer-status" aria-hidden="true" />

          <div>
            <strong>Dados locais</strong>
            <small>Suas informações ficam neste dispositivo.</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
