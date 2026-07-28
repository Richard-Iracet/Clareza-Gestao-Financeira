import { lazy, Suspense } from "react";

const BackupManager = lazy(
  () => import("../components/Settings/BackupManager"),
);

const AccountsManager = lazy(
  () => import("../components/Settings/AccountsManager"),
);

const DataDiagnostics = lazy(
  () => import("../components/Settings/DataDiagnostics"),
);

const OrphanInvoicesManager = lazy(
  () => import("../components/Settings/OrphanInvoicesManager"),
);

const InstallmentMigrationReview = lazy(
  () => import("../components/Settings/InstallmentMigrationReview"),
);

const DuplicateReview = lazy(
  () => import("../components/Settings/DuplicateReview"),
);

const InstallmentValueReview = lazy(
  () => import("../components/Settings/InstallmentValueReview"),
);

const InvoiceDateMigrationReview = lazy(
  () => import("../components/Settings/InvoiceDateMigrationReview"),
);

function SettingsLoading() {
  return (
    <div className="page-loading-state" role="status" aria-live="polite">
      <span className="page-state-icon" aria-hidden="true">
        ◌
      </span>

      <p>Carregando configurações…</p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="page settings-page">
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Segurança e privacidade</p>

            <h2>Configurações</h2>
          </div>
        </div>

        <Suspense fallback={<SettingsLoading />}>
          <div className="settings-grid">
            <BackupManager />
            <DataDiagnostics />
          </div>

          <div className="settings-grid accounts-settings-grid">
            <AccountsManager />
          </div>

          <div className="settings-grid">
            <OrphanInvoicesManager />
            <InstallmentMigrationReview />
          </div>

          <div className="settings-grid">
            <DuplicateReview />
          </div>

          <div className="settings-grid">
            <InstallmentValueReview />
          </div>

          <div className="settings-grid">
            <InvoiceDateMigrationReview />
          </div>
        </Suspense>
      </section>
    </div>
  );
}
