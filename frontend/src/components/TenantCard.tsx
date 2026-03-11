import { StatusPill } from "./StatusPill";
import type { ClusterSnapshot, Tenant } from "../types";

type TenantCardProps = {
  tenant: Tenant;
  snapshot?: ClusterSnapshot;
};

function countValue(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export function TenantCard({ tenant, snapshot }: TenantCardProps) {
  return (
    <article className="tenant-card">
      <div className="tenant-card__header">
        <div>
          <p className="tenant-card__eyebrow">{tenant.accountId ?? "Unspecified account"}</p>
          <h2>{tenant.name}</h2>
        </div>
        <StatusPill state={snapshot?.connectionState ?? "connecting"} />
      </div>

      <dl className="tenant-card__meta">
        <div>
          <dt>AWS profile</dt>
          <dd>{tenant.awsProfile ?? "Inherited from kubeconfig"}</dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>{tenant.contextName}</dd>
        </div>
        <div>
          <dt>Cluster</dt>
          <dd>{snapshot?.clusterName ?? "Awaiting snapshot"}</dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>{snapshot?.region ?? tenant.region ?? "Unknown"}</dd>
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
        <span>Observed {snapshot ? new Date(snapshot.observedAt).toLocaleTimeString() : "never"}</span>
        <span>{snapshot?.latencyMs ? `${snapshot.latencyMs} ms API latency` : "No latency data yet"}</span>
      </footer>

      {snapshot && snapshot.warnings.length > 0 ? (
        <ul className="tenant-card__warnings">
          {snapshot.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
