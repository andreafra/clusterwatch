import type { ClusterInventory, NamespaceInventory, PodInventory } from "../types";

type NamespaceConsoleProps = {
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

function keywordClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "running" || normalized === "active") {
    return "connected";
  }
  if (normalized === "pending" || normalized === "containercreating") {
    return "pending";
  }
  return "degraded";
}

export function NamespaceConsole({
  inventory,
  expandedNamespaces,
  onToggleNamespace,
  onSelectPod,
  selectedPodKey,
}: NamespaceConsoleProps) {
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
                <span className="namespace-row__caret">{expanded ? "-" : "+"}</span>
                <code>{namespace.name}</code>
              </div>
              <div className="namespace-row__stats">
                <span className="keyword keyword--connected">{namespace.readyPods}/{namespace.podCount} ready</span>
                <span className={namespace.problemPods > 0 ? "keyword keyword--degraded" : "keyword"}>
                  {namespace.problemPods} issues
                </span>
                <span className={namespace.restartCount > 0 ? "keyword keyword--pending" : "keyword"}>
                  {namespace.restartCount} restarts
                </span>
                <span>{namespace.age}</span>
              </div>
            </button>

            {expanded ? (
              namespace.pods.length === 0 ? (
                <div className="namespace-empty">No pods in this namespace.</div>
              ) : (
                <table className="pod-table">
                  <colgroup>
                    <col className="pod-table__col pod-table__col--name" />
                    <col className="pod-table__col pod-table__col--ready" />
                    <col className="pod-table__col pod-table__col--phase" />
                    <col className="pod-table__col pod-table__col--reason" />
                    <col className="pod-table__col pod-table__col--restart" />
                    <col className="pod-table__col pod-table__col--age" />
                    <col className="pod-table__col pod-table__col--node" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Pod</th>
                      <th>Ready</th>
                      <th>Phase</th>
                      <th>Reason</th>
                      <th>Restarts</th>
                      <th>Age</th>
                      <th>Node</th>
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
                          <td>
                            <span className={pod.readyContainers === pod.containerCount ? "keyword keyword--connected" : "keyword keyword--degraded"}>
                              {pod.readyContainers}/{pod.containerCount}
                            </span>
                          </td>
                          <td>
                            <span className={`keyword keyword--${keywordClass(pod.phase)}`}>{pod.phase}</span>
                          </td>
                          <td>
                            <span className={`keyword keyword--${keywordClass(pod.reason || pod.phase)}`}>
                              {pod.reason || "--"}
                            </span>
                          </td>
                          <td>
                            <span className={pod.restartCount > 0 ? "keyword keyword--pending" : "keyword"}>
                              {pod.restartCount}
                            </span>
                          </td>
                          <td>{pod.age}</td>
                          <td>{pod.nodeName || "--"}</td>
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

export function namespaceHasProblems(namespace: NamespaceInventory): boolean {
  return namespace.problemPods > 0;
}
