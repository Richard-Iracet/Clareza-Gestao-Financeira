import { lazy, Suspense } from "react";

const Charts = lazy(() => import("../components/Dashboard/Charts"));

const MonthlyForecast = lazy(
  () => import("../components/Forecast/MonthlyForecast"),
);

function SectionLoading({ message }) {
  return (
    <div className="page-loading-state" role="status" aria-live="polite">
      <span className="page-state-icon" aria-hidden="true">
        ◌
      </span>

      <p>{message}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="page analytics-page">
      <section className="page-section">
        <Suspense
          fallback={
            <SectionLoading message="Carregando gráficos financeiros…" />
          }
        >
          <Charts />
        </Suspense>
      </section>

      <section className="page-section">
        <Suspense
          fallback={<SectionLoading message="Carregando previsão mensal…" />}
        >
          <MonthlyForecast />
        </Suspense>
      </section>
    </div>
  );
}
