import { StatusPill } from "./StatusPill";
import type { ClusterInventory, ClusterSnapshot, Tenant } from "../types";

type ContextTabsProps = {
  tenants: Tenant[];
  inventory: Record<string, ClusterInventory>;
  snapshots: Record<string, ClusterSnapshot>;
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
};

export function ContextTabs({
  tenants,
  inventory,
  snapshots,
  selectedTenantId,
  onSelect,
}: ContextTabsProps) {
  return (
    <section className="context-tabs panel">
      {tenants.map((tenant) => {
        const snapshot = snapshots[tenant.id];
        const clusterInventory = inventory[tenant.id];
        const podCount = clusterInventory?.namespaces.reduce((sum, namespace) => sum + namespace.podCount, 0) ?? 0;
        const problemPods =
          clusterInventory?.namespaces.reduce((sum, namespace) => sum + namespace.problemPods, 0) ?? 0;
        const namespaceCount = clusterInventory?.namespaces.length ?? 0;

        return (
          <button
            key={tenant.id}
            type="button"
            className={`context-tab ${selectedTenantId === tenant.id ? "context-tab--active" : ""}`}
            onClick={() => onSelect(tenant.id)}
          >
            <div className="context-tab__identity">
              <code className="context-tab__name">{tenant.name}</code>
              <StatusPill state={snapshot?.connection ?? "pending"} />
            </div>
            <div className="context-tab__meta">
              <span>{namespaceCount} ns</span>
              <span>{podCount} pods</span>
              <span className={problemPods > 0 ? "keyword keyword--degraded" : "keyword keyword--connected"}>
                {problemPods} issues
              </span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
