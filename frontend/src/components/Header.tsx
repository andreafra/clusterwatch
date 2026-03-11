import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";
import type { ClusterSnapshot, Tenant } from "../types";

type HeaderProps = {
  tenants: Tenant[];
  snapshots: Record<string, ClusterSnapshot>;
  transportPanel: ReactNode;
  streamConnected: boolean;
};

export function Header({ tenants, snapshots, transportPanel, streamConnected }: HeaderProps) {
  return (
    <header className="hero">
      <div className="hero__intro">
        <p className="eyebrow">Local multi-context EKS monitor</p>
        <h1>clusterwatch</h1>
        <p className="hero-copy">Minimal live view over kubeconfig contexts and connection state.</p>
      </div>

      <div className="hero__side">
        <section className="link-panel">
          <div className="link-panel__header">
            <span className="metric-label">Links</span>
            <StatusPill state={streamConnected ? "connected" : "degraded"} />
          </div>
          <ul className="link-list">
            {tenants.map((tenant) => (
              <li key={tenant.id} className="link-list__item">
                <code>{tenant.name}</code>
                <StatusPill state={snapshots[tenant.id]?.connection ?? "pending"} />
              </li>
            ))}
          </ul>
        </section>

        {transportPanel}
      </div>
    </header>
  );
}
