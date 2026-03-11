import { useEffect, useRef, useState } from "react";
import { copyTitle, copyToClipboard } from "../lib/copy";
import type {
  ClusterInventory,
  NamespaceInventory,
  PodInventory,
} from "../types";

type NamespaceTab = "pods" | "services" | "ingresses" | "configMaps" | "secrets";

type NamespaceConsoleProps = {
  inventory: ClusterInventory | undefined;
  expandedNamespaces: Set<string>;
  selectedNamespaceName: string | undefined;
  onToggleNamespace: (namespace: string) => void;
  onSelectNamespace: (namespace: NamespaceInventory) => void;
  onSelectPod: (namespace: string, pod: PodInventory) => void;
  selectedPodKey: string | undefined;
};

function podKey(namespace: string, podName: string): string {
  return `${namespace}/${podName}`;
}

function titleOrUndefined(value: string): string | undefined {
  return value === "" || value === "--" ? undefined : value;
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
  selectedNamespaceName,
  onToggleNamespace,
  onSelectNamespace,
  onSelectPod,
  selectedPodKey,
}: NamespaceConsoleProps) {
  const [namespaceTabs, setNamespaceTabs] = useState<Record<string, NamespaceTab>>({});
  const [flashingRows, setFlashingRows] = useState<Record<string, boolean>>({});
  const previousSignaturesRef = useRef<Record<string, string>>({});
  const flashTimeoutsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!inventory) {
      setNamespaceTabs({});
      return;
    }

    setNamespaceTabs((current) => {
      const next: Record<string, NamespaceTab> = {};
      for (const namespace of inventory.namespaces) {
        next[namespace.name] = current[namespace.name] ?? "pods";
      }
      return next;
    });
  }, [inventory]);

  useEffect(() => {
    if (!inventory) {
      previousSignaturesRef.current = {};
      setFlashingRows({});
      return;
    }

    const nextSignatures = buildInventorySignatures(inventory);
    const previousSignatures = previousSignaturesRef.current;

    if (Object.keys(previousSignatures).length === 0) {
      previousSignaturesRef.current = nextSignatures;
      return;
    }

    for (const [rowKey, signature] of Object.entries(nextSignatures)) {
      if (!(rowKey in previousSignatures) || previousSignatures[rowKey] === signature) {
        continue;
      }

      if (flashTimeoutsRef.current[rowKey]) {
        window.clearTimeout(flashTimeoutsRef.current[rowKey]);
      }

      setFlashingRows((current) => ({ ...current, [rowKey]: true }));
      flashTimeoutsRef.current[rowKey] = window.setTimeout(() => {
        setFlashingRows((current) => {
          if (!current[rowKey]) {
            return current;
          }

          const next = { ...current };
          delete next[rowKey];
          return next;
        });

        delete flashTimeoutsRef.current[rowKey];
      }, 1200);
    }

    previousSignaturesRef.current = nextSignatures;
  }, [inventory]);

  useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(flashTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!inventory) {
    return <section className="explorer empty-block">No cluster inventory available yet.</section>;
  }

  return (
    <section className="explorer">
      {inventory.namespaces.map((namespace) => {
        const expanded = expandedNamespaces.has(namespace.name);
        const isSelected = selectedNamespaceName === namespace.name;
        const activeTab = namespaceTabs[namespace.name] ?? "pods";

        return (
          <article key={namespace.name} className="namespace-block">
            <button
              type="button"
              className={`namespace-row ${isSelected ? "namespace-row--selected" : ""}`}
              onClick={() => {
                onSelectNamespace(namespace);
                onToggleNamespace(namespace.name);
              }}
            >
              <div className="namespace-row__title">
                <span className="namespace-row__caret">{expanded ? "-" : "+"}</span>
                <span className="namespace-badge">Namespace</span>
                <code>{namespace.name}</code>
              </div>
              <div className="namespace-row__stats">
                <span className="keyword keyword--connected">{namespace.readyPods}/{namespace.podCount} ready</span>
                <span className={namespace.problemPods > 0 ? "keyword keyword--degraded" : "keyword"}>
                  {namespace.problemPods} issues
                </span>
                <span className="keyword">{namespace.serviceCount} SVC</span>
                <span className="keyword">{namespace.ingressCount} ING</span>
                <span className="keyword">{namespace.configMapCount} CM</span>
                <span className="keyword">{namespace.secretCount} SEC</span>
                <span className={namespace.restartCount > 0 ? "keyword keyword--pending" : "keyword"}>
                  {namespace.restartCount} restarts
                </span>
                <span>{namespace.age}</span>
              </div>
            </button>

            {expanded ? (
              <div className="namespace-content">
                <div className="namespace-tabs" role="tablist" aria-label={`${namespace.name} resources`}>
                  <button
                    type="button"
                    className={`namespace-tab ${activeTab === "pods" ? "namespace-tab--active" : ""}`}
                    onClick={() => setNamespaceTabs((current) => ({ ...current, [namespace.name]: "pods" }))}
                  >
                    Pods
                    <span>{namespace.podCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`namespace-tab ${activeTab === "services" ? "namespace-tab--active" : ""}`}
                    onClick={() => setNamespaceTabs((current) => ({ ...current, [namespace.name]: "services" }))}
                  >
                    SVC
                    <span>{namespace.serviceCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`namespace-tab ${activeTab === "ingresses" ? "namespace-tab--active" : ""}`}
                    onClick={() => setNamespaceTabs((current) => ({ ...current, [namespace.name]: "ingresses" }))}
                  >
                    ING
                    <span>{namespace.ingressCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`namespace-tab ${activeTab === "configMaps" ? "namespace-tab--active" : ""}`}
                    onClick={() => setNamespaceTabs((current) => ({ ...current, [namespace.name]: "configMaps" }))}
                  >
                    CM
                    <span>{namespace.configMapCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`namespace-tab ${activeTab === "secrets" ? "namespace-tab--active" : ""}`}
                    onClick={() => setNamespaceTabs((current) => ({ ...current, [namespace.name]: "secrets" }))}
                  >
                    Secrets
                    <span>{namespace.secretCount}</span>
                  </button>
                </div>

                <NamespaceTabPanel
                  namespace={namespace}
                  activeTab={activeTab}
                  flashingRows={flashingRows}
                  selectedPodKey={selectedPodKey}
                  onSelectPod={onSelectPod}
                />
              </div>
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

function NamespaceTabPanel({
  namespace,
  activeTab,
  flashingRows,
  selectedPodKey,
  onSelectPod,
}: {
  namespace: NamespaceInventory;
  activeTab: NamespaceTab;
  flashingRows: Record<string, boolean>;
  selectedPodKey: string | undefined;
  onSelectPod: (namespace: string, pod: PodInventory) => void;
}) {
  switch (activeTab) {
    case "pods":
      return renderPods(namespace, flashingRows, selectedPodKey, onSelectPod);
    case "services":
      return renderServices(namespace, flashingRows);
    case "ingresses":
      return renderIngresses(namespace, flashingRows);
    case "configMaps":
      return renderConfigMaps(namespace, flashingRows);
    case "secrets":
      return renderSecrets(namespace, flashingRows);
  }
}

function renderPods(
  namespace: NamespaceInventory,
  flashingRows: Record<string, boolean>,
  selectedPodKey: string | undefined,
  onSelectPod: (namespace: string, pod: PodInventory) => void,
) {
  return (
    <section className="namespace-section">
      {namespace.pods.length === 0 ? (
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
                  className={`pod-row ${isSelected ? "pod-row--selected" : ""} ${
                    flashingRows[podRowKey(namespace.name, pod.name)] ? "row-flash" : ""
                  }`}
                  onClick={() => onSelectPod(namespace.name, pod)}
                >
                  <td className="copyable" title={copyTitle(pod.name)} onClick={() => copyToClipboard(pod.name)}>
                    <div className="pod-name">
                      <span className={`status-dot status-dot--${podStatusClass(pod)}`} />
                      <code>{pod.name}</code>
                    </div>
                  </td>
                  <td
                    className="copyable"
                    title={copyTitle(`${pod.readyContainers}/${pod.containerCount}`)}
                    onClick={() => copyToClipboard(`${pod.readyContainers}/${pod.containerCount}`)}
                  >
                    <span
                      className={
                        pod.readyContainers === pod.containerCount
                          ? "keyword keyword--connected"
                          : "keyword keyword--degraded"
                      }
                    >
                      {pod.readyContainers}/{pod.containerCount}
                    </span>
                  </td>
                  <td className="copyable" title={copyTitle(pod.phase)} onClick={() => copyToClipboard(pod.phase)}>
                    <span className={`keyword keyword--${keywordClass(pod.phase)}`}>{pod.phase}</span>
                  </td>
                  <td
                    className="copyable"
                    title={copyTitle(pod.reason || "--")}
                    onClick={() => copyToClipboard(pod.reason || "--")}
                  >
                    <span className={`keyword keyword--${keywordClass(pod.reason || pod.phase)}`}>
                      {pod.reason || "--"}
                    </span>
                  </td>
                  <td
                    className="copyable"
                    title={copyTitle(String(pod.restartCount))}
                    onClick={() => copyToClipboard(String(pod.restartCount))}
                  >
                    <span className={pod.restartCount > 0 ? "keyword keyword--pending" : "keyword"}>
                      {pod.restartCount}
                    </span>
                  </td>
                  <td className="copyable" title={copyTitle(pod.age)} onClick={() => copyToClipboard(pod.age)}>{pod.age}</td>
                  <td
                    className="copyable"
                    title={copyTitle(pod.nodeName || "--")}
                    onClick={() => copyToClipboard(pod.nodeName || "--")}
                  >
                    {pod.nodeName || "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function renderServices(namespace: NamespaceInventory, flashingRows: Record<string, boolean>) {
  return (
    <section className="namespace-section">
      {namespace.services.length === 0 ? (
        <div className="namespace-empty">No services in this namespace.</div>
      ) : (
        <table className="resource-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Cluster IP</th>
              <th>External</th>
              <th>Ports</th>
              <th>Selector</th>
            </tr>
          </thead>
          <tbody>
            {namespace.services.map((service) => (
              <tr
                key={service.name}
                className={flashingRows[serviceRowKey(namespace.name, service.name)] ? "row-flash" : ""}
              >
                <td className="copyable" title={copyTitle(service.name)} onClick={() => copyToClipboard(service.name)}><code>{service.name}</code></td>
                <td className="copyable" title={copyTitle(service.type)} onClick={() => copyToClipboard(service.type)}><span className="keyword keyword--connected">{service.type}</span></td>
                <td className="copyable" title={copyTitle(valueOrDash(service.clusterIp))} onClick={() => copyToClipboard(valueOrDash(service.clusterIp))}>{valueOrDash(service.clusterIp)}</td>
                <td className="copyable" title={copyTitle(valueOrDash(service.externalIp))} onClick={() => copyToClipboard(valueOrDash(service.externalIp))}>{valueOrDash(service.externalIp)}</td>
                <td className="copyable" title={copyTitle(listOrDash(service.ports))} onClick={() => copyToClipboard(listOrDash(service.ports))}>{listOrDash(service.ports)}</td>
                <td className="copyable" title={copyTitle(service.selector ? "yes" : "no")} onClick={() => copyToClipboard(service.selector ? "yes" : "no")}>{service.selector ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function renderIngresses(namespace: NamespaceInventory, flashingRows: Record<string, boolean>) {
  return (
    <section className="namespace-section">
      {namespace.ingresses.length === 0 ? (
        <div className="namespace-empty">No ingresses in this namespace.</div>
      ) : (
        <table className="resource-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Hosts</th>
              <th>Address</th>
              <th>Targets</th>
              <th>Class</th>
              <th>TLS</th>
            </tr>
          </thead>
          <tbody>
            {namespace.ingresses.map((ingress) => (
              <tr
                key={ingress.name}
                className={flashingRows[ingressRowKey(namespace.name, ingress.name)] ? "row-flash" : ""}
              >
                <td className="copyable" title={copyTitle(ingress.name)} onClick={() => copyToClipboard(ingress.name)}><code>{ingress.name}</code></td>
                <td className="copyable" title={copyTitle(listOrDash(ingress.hosts))} onClick={() => copyToClipboard(listOrDash(ingress.hosts))}>{listOrDash(ingress.hosts)}</td>
                <td className="copyable" title={copyTitle(valueOrDash(ingress.address))} onClick={() => copyToClipboard(valueOrDash(ingress.address))}>{valueOrDash(ingress.address)}</td>
                <td className="copyable" title={copyTitle(listOrDash(ingress.targets))} onClick={() => copyToClipboard(listOrDash(ingress.targets))}>{listOrDash(ingress.targets)}</td>
                <td className="copyable" title={copyTitle(valueOrDash(ingress.className))} onClick={() => copyToClipboard(valueOrDash(ingress.className))}>{valueOrDash(ingress.className)}</td>
                <td className="copyable" title={copyTitle(ingress.tlsEnabled ? "TLS" : "Plain")} onClick={() => copyToClipboard(ingress.tlsEnabled ? "TLS" : "Plain")}>
                  <span className={ingress.tlsEnabled ? "keyword keyword--connected" : "keyword"}>
                    {ingress.tlsEnabled ? "TLS" : "Plain"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function renderConfigMaps(namespace: NamespaceInventory, flashingRows: Record<string, boolean>) {
  return (
    <section className="namespace-section">
      {namespace.configMaps.length === 0 ? (
        <div className="namespace-empty">No config maps in this namespace.</div>
      ) : (
        <table className="resource-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Data Keys</th>
              <th>Binary Keys</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {namespace.configMaps.map((configMap) => (
              <tr
                key={configMap.name}
                className={flashingRows[configMapRowKey(namespace.name, configMap.name)] ? "row-flash" : ""}
              >
                <td className="copyable" title={copyTitle(configMap.name)} onClick={() => copyToClipboard(configMap.name)}><code>{configMap.name}</code></td>
                <td className="copyable" title={copyTitle(String(configMap.dataKeys))} onClick={() => copyToClipboard(String(configMap.dataKeys))}>{configMap.dataKeys}</td>
                <td className="copyable" title={copyTitle(String(configMap.binaryKeys))} onClick={() => copyToClipboard(String(configMap.binaryKeys))}>{configMap.binaryKeys}</td>
                <td className="copyable" title={copyTitle(configMap.age)} onClick={() => copyToClipboard(configMap.age)}>{configMap.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function renderSecrets(namespace: NamespaceInventory, flashingRows: Record<string, boolean>) {
  return (
    <section className="namespace-section">
      {namespace.secrets.length === 0 ? (
        <div className="namespace-empty">No secrets in this namespace.</div>
      ) : (
        <table className="resource-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Data Keys</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {namespace.secrets.map((secret) => (
              <tr
                key={secret.name}
                className={flashingRows[secretRowKey(namespace.name, secret.name)] ? "row-flash" : ""}
              >
                <td className="copyable" title={copyTitle(secret.name)} onClick={() => copyToClipboard(secret.name)}><code>{secret.name}</code></td>
                <td className="copyable" title={copyTitle(secret.type)} onClick={() => copyToClipboard(secret.type)}><span className="keyword keyword--pending">{secret.type}</span></td>
                <td className="copyable" title={copyTitle(String(secret.dataKeys))} onClick={() => copyToClipboard(String(secret.dataKeys))}>{secret.dataKeys}</td>
                <td className="copyable" title={copyTitle(secret.age)} onClick={() => copyToClipboard(secret.age)}>{secret.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function listOrDash(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "--";
}

function valueOrDash(value: string | undefined): string {
  return value && value !== "" ? value : "--";
}

function buildInventorySignatures(inventory: ClusterInventory): Record<string, string> {
  const signatures: Record<string, string> = {};

  for (const namespace of inventory.namespaces) {
    for (const pod of namespace.pods) {
      signatures[podRowKey(namespace.name, pod.name)] = JSON.stringify({
        readyContainers: pod.readyContainers,
        containerCount: pod.containerCount,
        phase: pod.phase,
        reason: pod.reason,
        restartCount: pod.restartCount,
        nodeName: pod.nodeName,
      });
    }

    for (const service of namespace.services) {
      signatures[serviceRowKey(namespace.name, service.name)] = JSON.stringify({
        type: service.type,
        clusterIp: service.clusterIp,
        externalIp: service.externalIp,
        ports: service.ports,
        selector: service.selector,
      });
    }

    for (const ingress of namespace.ingresses) {
      signatures[ingressRowKey(namespace.name, ingress.name)] = JSON.stringify({
        hosts: ingress.hosts,
        address: ingress.address,
        targets: ingress.targets,
        className: ingress.className,
        tlsEnabled: ingress.tlsEnabled,
      });
    }

    for (const configMap of namespace.configMaps) {
      signatures[configMapRowKey(namespace.name, configMap.name)] = JSON.stringify({
        dataKeys: configMap.dataKeys,
        binaryKeys: configMap.binaryKeys,
      });
    }

    for (const secret of namespace.secrets) {
      signatures[secretRowKey(namespace.name, secret.name)] = JSON.stringify({
        type: secret.type,
        dataKeys: secret.dataKeys,
      });
    }
  }

  return signatures;
}

function podRowKey(namespace: string, podName: string): string {
  return `${namespace}/pods/${podName}`;
}

function serviceRowKey(namespace: string, serviceName: string): string {
  return `${namespace}/services/${serviceName}`;
}

function ingressRowKey(namespace: string, ingressName: string): string {
  return `${namespace}/ingresses/${ingressName}`;
}

function configMapRowKey(namespace: string, configMapName: string): string {
  return `${namespace}/configMaps/${configMapName}`;
}

function secretRowKey(namespace: string, secretName: string): string {
  return `${namespace}/secrets/${secretName}`;
}
