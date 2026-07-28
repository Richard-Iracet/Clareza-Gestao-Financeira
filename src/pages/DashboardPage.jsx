import AccountOverview from "../components/Dashboard/AccountOverview";
import InternalAlerts from "../components/Dashboard/InternalAlerts";
import SummaryCards from "../components/Dashboard/SummaryCards";

export default function DashboardPage() {
  return (
    <div className="page dashboard-page">
      <SummaryCards />

      <AccountOverview />

      <InternalAlerts />
    </div>
  );
}
