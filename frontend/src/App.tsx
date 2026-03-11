import { ConnectionPanel } from "./components/ConnectionPanel";
import { Header } from "./components/Header";
import { TenantOverviewCard } from "./components/TenantOverviewCard";
import { useDashboardState } from "./hooks/useDashboardState";

export function App() {
  const state = useDashboardState();

  return (
    <div className="app-shell">
      <Header
        tenants={state.tenants}
        snapshots={state.snapshots}
        transportPanel={<ConnectionPanel state={state} compact />}
        streamConnected={state.streamConnected}
      />

      <main className="dashboard-layout">
        <section className="tenant-grid">
          {state.tenants.map((tenant) => (
            <TenantOverviewCard
              key={tenant.id}
              tenant={tenant}
              snapshot={state.snapshots[tenant.id]}
            />
          ))}
        </section>
      </main>
    </div>
  );
}
