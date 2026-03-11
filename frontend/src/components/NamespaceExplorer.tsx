import type { ClusterInventory, NamespaceInventory, PodInventory } from "../types";

type NamespaceExplorerProps = {
  inventory: ClusterInventory | undefined;
  expandedNamespaces: Set<string>;
  onToggleNamespace: (namespace: string) => void;
  onSelectPod: (namespace: string, pod: PodInventory) => void;
  selectedPodKey: string | undefined;
};

function podKey(namespace: string, podName: string): string {
  return `${namespace}/${podName}`;
}

function podStatusClass(pod: PodInventory): string {
  if (pod.readyContainers === pod.containerCount && pod.phase === "Running") {
    return "connected";
  }
  if (pod.phase === "Pending") {
    return "pending";
  }
  return "degraded";
}

export function NamespaceExplorer({
  inventory,
  expandedNamespaces,
  onToggleNamespace,
  onSelectPod,
  selectedPodKey,
}: NamespaceExplorerProps) {
  if (!inventory) {
    return <section className="explorer empty-block">No cluster inventory available yet.</section>;
  }

  return (
    <section className="explorer">
      {inventory.namespaces.map((namespace) => {
        const expanded = expandedNamespaces.has(namespace.name);

        return (
          <article key={namespace.name} className="namespace-block">
            <button
              type="button"
              className="namespace-row"
              onClick={() => onToggleNamespace(namespace.name)}
            >
              <div className="namespace-row__title">
                <span className="namespace-row__caret">{expanded ? "−" : "+"}</span>
                <code>{namespace.name}</code>
              </div>
              <div className="namespace-row__stats">
                <span>{namespace.readyPods}/{namespace.podCount} ready</span>
                <span>{namespace.problemPods} issue</span>
                <span>{namespace.restartCount} restart</span>
                <span>{namespace.age}</span>
              </div>
            </button>

            {expanded ? (
              namespace.pods.length === 0 ? (
                <div className="namespace-empty">No pods in this namespace.</div>
              ) : (
                <table className="pod-table">
                  <thead>
                    <tr>
                      <th>Pod</th>
                      <th>Ready</th>
                      <th>Phase</th>
                      <th>Reason</th>
                      <th>Restarts</th>
                      <th>Age</th>
                      <th>Node</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {namespace.pods.map((pod) => {
                      const isSelected = selectedPodKey === podKey(namespace.name, pod.name);
                      return (
                        <tr
                          key={pod.name}
                          className={`pod-row ${isSelected ? "pod-row--selected" : ""}`}
                          onClick={() => onSelectPod(namespace.name, pod)}
                        >
                          <td>
                            <div className="pod-name">
                              <span className={`status-dot status-dot--${podStatusClass(pod)}`} />
                              <code>{pod.name}</code>
                            </div>
                          </td>
                          <td>{pod.readyContainers}/{pod.containerCount}</td>
                          <td>{pod.phase}</td>
                          <td>{pod.reason}</td>
                          <td>{pod.restartCount}</td>
                          <td>{pod.age}</td>
                          <td>{pod.nodeName || "--"}</td>
                          <td>{pod.ownerKind && pod.ownerName ? `${pod.ownerKind}/${pod.ownerName}` : "--"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

export function namespaceHasIssues(namespace: NamespaceInventory): boolean {
  return namespace.problemPods > 0;
}
