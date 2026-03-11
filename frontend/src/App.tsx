import { ConnectionPanel } from "./components/ConnectionPanel";
import { ContextTabs } from "./components/ContextTabs";
import { Header } from "./components/Header";
import { NamespaceConsole, namespaceHasProblems } from "./components/NamespaceConsole";
import { PodInspector } from "./components/PodInspector";
import { useDashboardState } from "./hooks/useDashboardState";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { NamespaceInventory, PodInventory } from "./types";

type PodSelection = {
  namespace: string;
  pod: PodInventory;
};

function podMatchesSearch(namespace: NamespaceInventory, pod: PodInventory, search: string): boolean {
  const query = search.toLowerCase();
  if (query === "") {
    return true;
  }

  return [namespace.name, pod.name, pod.reason, pod.nodeName, pod.ownerName, pod.ownerKind]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function podMatchesStatus(pod: PodInventory, status: string): boolean {
  switch (status) {
    case "healthy":
      return pod.readyContainers === pod.containerCount && pod.phase === "Running";
    case "issues":
      return !(pod.readyContainers === pod.containerCount && pod.phase === "Running");
    case "pending":
      return pod.phase === "Pending";
    case "restarting":
      return pod.restartCount > 0;
    default:
      return true;
  }
}

export function App() {
  const state = useDashboardState();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set());
  const [selectedPod, setSelectedPod] = useState<PodSelection | undefined>(undefined);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const firstTenant = state.tenants[0];
    if (!firstTenant) {
      return;
    }
    if (selectedTenantId === "" || !state.tenants.some((tenant) => tenant.id === selectedTenantId)) {
      setSelectedTenantId(firstTenant.id);
    }
  }, [selectedTenantId, state.tenants]);

  const currentInventory = selectedTenantId ? state.inventory[selectedTenantId] : undefined;
  const filteredInventory = useMemo(() => {
    if (!currentInventory) {
      return undefined;
    }

    const showEmptyNamespaces = deferredSearch === "" && statusFilter === "all";
    return {
      ...currentInventory,
      namespaces: currentInventory.namespaces
        .map((namespace) => ({
          ...namespace,
          pods: namespace.pods.filter(
            (pod) => podMatchesSearch(namespace, pod, deferredSearch) && podMatchesStatus(pod, statusFilter),
          ),
        }))
        .filter((namespace) => namespace.pods.length > 0 || showEmptyNamespaces),
    };
  }, [currentInventory, deferredSearch, statusFilter]);

  useEffect(() => {
    if (!filteredInventory) {
      return;
    }
    const nextExpanded = new Set<string>();
    for (const namespace of filteredInventory.namespaces) {
      if (namespaceHasProblems(namespace)) {
        nextExpanded.add(namespace.name);
      }
    }
    setExpandedNamespaces(nextExpanded);
  }, [selectedTenantId]);

  return (
    <div className="app-shell">
      <main className="dashboard-layout">
        <section className="workspace">
          <div className="sticky-stack">
            <Header transportPanel={<ConnectionPanel state={state} compact />} />

          <ContextTabs
            tenants={state.tenants}
            inventory={state.inventory}
            snapshots={state.snapshots}
            selectedTenantId={selectedTenantId}
            onSelect={(tenantId) => {
              setSelectedTenantId(tenantId);
              setSelectedPod(undefined);
            }}
          />

          <section className="toolbar panel">
            <div className="toolbar__group toolbar__group--wide">
              <label className="toolbar__label" htmlFor="search-input">Search</label>
              <input
                id="search-input"
                className="toolbar__control"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="pod, namespace, reason, node"
              />
            </div>

            <div className="toolbar__group">
              <label className="toolbar__label" htmlFor="status-filter">Filter</label>
              <select
                id="status-filter"
                className="toolbar__control"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="healthy">Healthy</option>
                <option value="issues">Issues</option>
                <option value="pending">Pending</option>
                <option value="restarting">Restarting</option>
              </select>
            </div>
          </section>
          </div>

          <div className="workspace__body">
            <NamespaceConsole
              inventory={filteredInventory}
              expandedNamespaces={expandedNamespaces}
              onToggleNamespace={(namespace) =>
                setExpandedNamespaces((current) => {
                  const next = new Set(current);
                  if (next.has(namespace)) {
                    next.delete(namespace);
                  } else {
                    next.add(namespace);
                  }
                  return next;
                })
              }
              onSelectPod={(namespace, pod) => setSelectedPod({ namespace, pod })}
              selectedPodKey={selectedPod ? `${selectedPod.namespace}/${selectedPod.pod.name}` : undefined}
            />

            <PodInspector namespace={selectedPod?.namespace} pod={selectedPod?.pod} />
          </div>
        </section>
      </main>
    </div>
  );
}
