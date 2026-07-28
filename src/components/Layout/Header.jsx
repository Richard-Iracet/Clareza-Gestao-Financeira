export default function Header({
  theme = "light",
  eyebrow = "Visão geral",
  title = "Suas finanças, com clareza.",
  description = "",
  onToggleTheme,
  onOpenMenu,
}) {
  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const isDark = theme === "dark";
  const nextThemeLabel = isDark ? "Ativar modo claro" : "Ativar modo escuro";

  const handleToggleTheme = () => {
    if (typeof onToggleTheme === "function") {
      onToggleTheme();
    }
  };

  const handleOpenMenu = () => {
    if (typeof onOpenMenu === "function") {
      onOpenMenu();
    }
  };

  return (
    <header className="header">
      <div className="header-leading">
        {typeof onOpenMenu === "function" && (
          <button
            type="button"
            className="header-menu-button"
            aria-label="Abrir menu de navegação"
            aria-controls="application-sidebar"
            onClick={handleOpenMenu}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" />
            </svg>
          </button>
        )}

        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>

          <span>Clareza</span>
        </div>
      </div>

      <div className="header-copy">
        <p className="eyebrow">{eyebrow}</p>

        <h1>{title}</h1>

        {description ? (
          <p className="muted header-description">{description}</p>
        ) : (
          <p className="muted capitalize">{today}</p>
        )}
      </div>

      <div className="header-actions">
        <div className="header-date" aria-label={`Data atual: ${today}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 7H5v10h14V9ZM5 6v1h14V6H5Z" />
          </svg>

          <span className="capitalize">{today}</span>
        </div>

        <button
          type="button"
          className="theme-toggle"
          aria-label={nextThemeLabel}
          title={nextThemeLabel}
          aria-pressed={isDark}
          onClick={handleToggleTheme}
          disabled={typeof onToggleTheme !== "function"}
        >
          <span className="theme-toggle-track" aria-hidden="true">
            <span className="theme-toggle-icon theme-toggle-sun">☀</span>

            <span className="theme-toggle-icon theme-toggle-moon">☾</span>

            <span className="theme-toggle-thumb">{isDark ? "☾" : "☀"}</span>
          </span>

          <span className="theme-toggle-label">
            {isDark ? "Escuro" : "Claro"}
          </span>
        </button>
      </div>
    </header>
  );
}
