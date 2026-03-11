import type { PodInventory } from "../types";

type PodInspectorProps = {
  namespace: string | undefined;
  pod: PodInventory | undefined;
};

function valueOrFallback(value: string | number | undefined): string {
  if (value === undefined || value === "") {
    return "--";
  }
  return String(value);
}

export function PodInspector({ namespace, pod }: PodInspectorProps) {
  return (
    <aside className="panel pod-inspector">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Pod</p>
          <h2>Inspector</h2>
        </div>
      </div>

      {!pod || !namespace ? (
        <p className="empty-block">Select a pod to inspect its containers and core status.</p>
      ) : (
        <>
          <div className="inspector-header">
            <code>{pod.name}</code>
            <span>{namespace}</span>
          </div>

          <dl className="connection-grid">
            <div>
              <dt>Ready</dt>
              <dd>{pod.readyContainers}/{pod.containerCount}</dd>
            </div>
            <div>
              <dt>Phase</dt>
              <dd>{pod.phase}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{valueOrFallback(pod.reason)}</dd>
            </div>
            <div>
              <dt>Restarts</dt>
              <dd>{pod.restartCount}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{valueOrFallback(pod.nodeName)}</dd>
            </div>
            <div>
              <dt>Pod IP</dt>
              <dd>{valueOrFallback(pod.podIp)}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{pod.ownerKind && pod.ownerName ? `${pod.ownerKind}/${pod.ownerName}` : "--"}</dd>
            </div>
            <div>
              <dt>QoS</dt>
              <dd>{valueOrFallback(pod.qosClass)}</dd>
            </div>
          </dl>

          {pod.message ? <p className="panel-error">{pod.message}</p> : null}

          <div className="container-list">
            {pod.containers.map((container) => (
              <section key={container.name} className="container-card">
                <div className="container-card__header">
                  <code>{container.name}</code>
                  <span>{container.state}</span>
                </div>
                <p className="container-image">{container.image}</p>
                <dl className="container-metrics">
                  <div>
                    <dt>Ready</dt>
                    <dd>{container.ready ? "yes" : "no"}</dd>
                  </div>
                  <div>
                    <dt>Restarts</dt>
                    <dd>{container.restartCount}</dd>
                  </div>
                  <div>
                    <dt>State reason</dt>
                    <dd>{valueOrFallback(container.stateReason)}</dd>
                  </div>
                  <div>
                    <dt>Last exit</dt>
                    <dd>{container.lastExitCode || "--"}</dd>
                  </div>
                  <div>
                    <dt>Req CPU</dt>
                    <dd>{valueOrFallback(container.requestsCpu)}</dd>
                  </div>
                  <div>
                    <dt>Req Mem</dt>
                    <dd>{valueOrFallback(container.requestsMemory)}</dd>
                  </div>
                  <div>
                    <dt>Lim CPU</dt>
                    <dd>{valueOrFallback(container.limitsCpu)}</dd>
                  </div>
                  <div>
                    <dt>Lim Mem</dt>
                    <dd>{valueOrFallback(container.limitsMemory)}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
