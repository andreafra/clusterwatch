import { StatusPill } from "./StatusPill";
import type { ClusterSnapshot, Tenant } from "../types";

type TenantOverviewCardProps = {
  tenant: Tenant;
  snapshot: ClusterSnapshot | undefined;
};

function countValue(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "--";
}

export function TenantOverviewCard({ tenant, snapshot }: TenantOverviewCardProps) {
  const namespaces = tenant.namespaces ?? [];

  return (
    <article className="tenant-card">
      <div className="tenant-card__header">
        <div>
          <p className="tenant-card__eyebrow">Kubeconfig Context</p>
          <h2>{tenant.name}</h2>
        </div>
        <StatusPill state={snapshot?.connection ?? "pending"} />
      </div>

      <dl className="tenant-card__meta">
        <div>
          <dt>AWS profile</dt>
          <dd>{tenant.awsProfile ?? "Inherited from kubeconfig"}</dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>{tenant.context}</dd>
        </div>
        <div>
          <dt>Namespaces</dt>
          <dd>{namespaces.length > 0 ? namespaces.join(", ") : "All visible"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{snapshot?.message ?? "Awaiting snapshot"}</dd>
        </div>
      </dl>

      <div className="tenant-card__stats">
        <div>
          <span>Namespaces</span>
          <strong>{countValue(snapshot?.resourceCounts.namespaces)}</strong>
        </div>
        <div>
          <span>Nodes</span>
          <strong>{countValue(snapshot?.resourceCounts.nodes)}</strong>
        </div>
        <div>
          <span>Pods</span>
          <strong>{countValue(snapshot?.resourceCounts.pods)}</strong>
        </div>
        <div>
          <span>Deployments</span>
          <strong>{countValue(snapshot?.resourceCounts.deployments)}</strong>
        </div>
      </div>

      <footer className="tenant-card__footer">
        <span>Observed {snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString() : "never"}</span>
        <span>{snapshot?.context ?? tenant.context}</span>
      </footer>
    </article>
  );
}
