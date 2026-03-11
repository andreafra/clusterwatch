import { copyTitle, copyToClipboard } from "../lib/copy";
import type { NamespaceInventory, PodInventory } from "../types";

type PodInspectorProps = {
  namespace: string | undefined;
  namespaceInfo: NamespaceInventory | undefined;
  pod: PodInventory | undefined;
};

function valueOrFallback(value: string | number | undefined): string {
  if (value === undefined || value === "") {
    return "--";
  }
  return String(value);
}

function CopyValue({ value }: { value: string }) {
  return (
    <span className="copyable" title={copyTitle(value)} onClick={() => copyToClipboard(value)}>
      {value}
    </span>
  );
}

export function PodInspector({ namespace, namespaceInfo, pod }: PodInspectorProps) {
  return (
    <aside className="panel pod-inspector">
      {!pod && !namespaceInfo ? (
        <p className="empty-block">Select a namespace or pod to inspect its current state.</p>
      ) : !pod || !namespace ? (
        <>
          <div className="inspector-header">
            <div className="inspector-header__identity">
              <span className="inspector-header__label">Namespace</span>
              <code className="copyable" title={copyTitle(namespaceInfo?.name ?? "")} onClick={() => copyToClipboard(namespaceInfo?.name ?? "")}>
                {namespaceInfo?.name}
              </code>
            </div>
          </div>

          <dl className="inspector-metrics">
            <div>
              <dt>Phase</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.phase)} /></dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.age)} /></dd>
            </div>
            <div>
              <dt>Pods</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.podCount)} /></dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo ? `${namespaceInfo.readyPods}/${namespaceInfo.podCount}` : undefined)} /></dd>
            </div>
            <div>
              <dt>Issues</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.problemPods)} /></dd>
            </div>
            <div>
              <dt>Restarts</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.restartCount)} /></dd>
            </div>
            <div>
              <dt>Services</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.serviceCount)} /></dd>
            </div>
            <div>
              <dt>Ingresses</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.ingressCount)} /></dd>
            </div>
            <div>
              <dt>ConfigMaps</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.configMapCount)} /></dd>
            </div>
            <div>
              <dt>Secrets</dt>
              <dd><CopyValue value={valueOrFallback(namespaceInfo?.secretCount)} /></dd>
            </div>
          </dl>

          <p className="inspector-note">Expand the namespace row to inspect services, ingresses, config maps, and secrets inline.</p>
        </>
      ) : (
        <>
          <div className="inspector-header">
            <div className="inspector-header__identity">
              <span className="inspector-header__label">Pod</span>
              <code className="copyable" title={copyTitle(pod.name)} onClick={() => copyToClipboard(pod.name)}>{pod.name}</code>
              <div className="inspector-header__meta">
                <span className="inspector-header__label">Namespace</span>
                <span className="copyable" title={copyTitle(namespace)} onClick={() => copyToClipboard(namespace)}>{namespace}</span>
              </div>
            </div>
          </div>

          <dl className="inspector-metrics">
            <div>
              <dt>Ready</dt>
              <dd><CopyValue value={`${pod.readyContainers}/${pod.containerCount}`} /></dd>
            </div>
            <div>
              <dt>Phase</dt>
              <dd><CopyValue value={pod.phase} /></dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd><CopyValue value={valueOrFallback(pod.reason)} /></dd>
            </div>
            <div>
              <dt>Restarts</dt>
              <dd><CopyValue value={String(pod.restartCount)} /></dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd><CopyValue value={valueOrFallback(pod.nodeName)} /></dd>
            </div>
            <div>
              <dt>Pod IP</dt>
              <dd><CopyValue value={valueOrFallback(pod.podIp)} /></dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd><CopyValue value={pod.ownerKind && pod.ownerName ? `${pod.ownerKind}/${pod.ownerName}` : "--"} /></dd>
            </div>
            <div>
              <dt>QoS</dt>
              <dd><CopyValue value={valueOrFallback(pod.qosClass)} /></dd>
            </div>
          </dl>

          {pod.message ? <p className="panel-error">{pod.message}</p> : null}

          <div className="container-list">
            {pod.containers.map((container) => (
              <section key={container.name} className="container-card">
                <div className="container-card__header">
                  <code className="copyable" title={copyTitle(container.name)} onClick={() => copyToClipboard(container.name)}>{container.name}</code>
                  <span className="copyable" title={copyTitle(container.state)} onClick={() => copyToClipboard(container.state)}>{container.state}</span>
                </div>
                <p className="container-image copyable" title={copyTitle(container.image)} onClick={() => copyToClipboard(container.image)}>{container.image}</p>
                <dl className="container-metrics inspector-metrics">
                  <div>
                    <dt>Ready</dt>
                    <dd><CopyValue value={container.ready ? "yes" : "no"} /></dd>
                  </div>
                  <div>
                    <dt>Restarts</dt>
                    <dd><CopyValue value={String(container.restartCount)} /></dd>
                  </div>
                  <div>
                    <dt>State reason</dt>
                    <dd><CopyValue value={valueOrFallback(container.stateReason)} /></dd>
                  </div>
                  <div>
                    <dt>Last exit</dt>
                    <dd><CopyValue value={container.lastExitCode ? String(container.lastExitCode) : "--"} /></dd>
                  </div>
                  <div>
                    <dt>Req CPU</dt>
                    <dd><CopyValue value={valueOrFallback(container.requestsCpu)} /></dd>
                  </div>
                  <div>
                    <dt>Req Mem</dt>
                    <dd><CopyValue value={valueOrFallback(container.requestsMemory)} /></dd>
                  </div>
                  <div>
                    <dt>Lim CPU</dt>
                    <dd><CopyValue value={valueOrFallback(container.limitsCpu)} /></dd>
                  </div>
                  <div>
                    <dt>Lim Mem</dt>
                    <dd><CopyValue value={valueOrFallback(container.limitsMemory)} /></dd>
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
