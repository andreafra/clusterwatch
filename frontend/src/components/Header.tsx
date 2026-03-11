import type { ReactNode } from "react";

type HeaderProps = {
  transportPanel: ReactNode;
};

export function Header({ transportPanel }: HeaderProps) {
  return (
    <header className="hero">
      <div className="hero__intro">
        <p className="eyebrow">Local multi-context EKS monitor</p>
        <h1>clusterwatch</h1>
        <p className="hero-copy">Minimal live view over kubeconfig contexts, namespaces, and pod state.</p>
      </div>

      <div className="hero__side">{transportPanel}</div>
    </header>
  );
}
