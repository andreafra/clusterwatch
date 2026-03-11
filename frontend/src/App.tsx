import { ConnectionPanel } from "./components/ConnectionPanel";
import { ContextTabs } from "./components/ContextTabs";
import { Header } from "./components/Header";
import { NamespaceConsole, namespaceHasProblems } from "./components/NamespaceConsole";
import { PodInspector } from "./components/PodInspector";
import { useDashboardState } from "./hooks/useDashboardState";
import { onCopyEvent } from "./lib/copy";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { NamespaceInventory, PodInventory } from "./types";

type PodSelection = {
  namespace: string;
  pod: PodInventory;
};

const SELECTED_TENANT_STORAGE_KEY = "clusterwatch:selected-tenant";

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
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY) ?? "";
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set());
  const [selectedNamespaceName, setSelectedNamespaceName] = useState<string | undefined>(undefined);
  const [selectedPod, setSelectedPod] = useState<PodSelection | undefined>(undefined);
  const [copyToast, setCopyToast] = useState<string | undefined>(undefined);
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedTenantId === "") {
      window.localStorage.removeItem(SELECTED_TENANT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, selectedTenantId);
  }, [selectedTenantId]);

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

  const selectedNamespace = useMemo(() => {
    if (!filteredInventory || !selectedNamespaceName) {
      return undefined;
    }

    return filteredInventory.namespaces.find((namespace) => namespace.name === selectedNamespaceName);
  }, [filteredInventory, selectedNamespaceName]);

  const allNamespacesExpanded = useMemo(() => {
    if (!filteredInventory || filteredInventory.namespaces.length === 0) {
      return false;
    }

    return filteredInventory.namespaces.every((namespace) => expandedNamespaces.has(namespace.name));
  }, [expandedNamespaces, filteredInventory]);

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

  useEffect(() => {
    if (!filteredInventory) {
      setSelectedNamespaceName(undefined);
      setSelectedPod(undefined);
      return;
    }

    if (
      selectedNamespaceName &&
      filteredInventory.namespaces.some((namespace) => namespace.name === selectedNamespaceName)
    ) {
      return;
    }

    const firstNamespace = filteredInventory.namespaces[0];
    setSelectedNamespaceName(firstNamespace?.name);
    setSelectedPod(undefined);
  }, [filteredInventory, selectedNamespaceName]);

  useEffect(() => {
    const unsubscribe = onCopyEvent((value) => {
      setCopyToast(value.length > 48 ? `${value.slice(0, 45)}... copied` : `${value} copied`);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!copyToast) {
      return;
    }

    const timeout = window.setTimeout(() => setCopyToast(undefined), 1600);
    return () => window.clearTimeout(timeout);
  }, [copyToast]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Header transportPanel={<ConnectionPanel state={state} compact />} />

        <ContextTabs
          tenants={state.tenants}
          inventory={state.inventory}
          snapshots={state.snapshots}
          selectedTenantId={selectedTenantId}
          onSelect={(tenantId) => {
            setSelectedTenantId(tenantId);
            setSelectedNamespaceName(undefined);
            setSelectedPod(undefined);
          }}
        />

        <section className="toolbar panel">
          <div className="toolbar__group toolbar__group--action">
            <span className="toolbar__label">View</span>
            <button
              type="button"
              className="toolbar__button"
              onClick={() =>
                setExpandedNamespaces(
                  allNamespacesExpanded
                    ? new Set()
                    : new Set((filteredInventory?.namespaces ?? []).map((namespace) => namespace.name)),
                )
              }
            >
              {allNamespacesExpanded ? "Collapse All" : "Expand All"}
            </button>
          </div>

          <div className="toolbar__group toolbar__group--wide">
            <label className="toolbar__label" htmlFor="search-input">
              Search
            </label>
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
            <label className="toolbar__label" htmlFor="status-filter">
              Filter
            </label>
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
      </header>

      <main className="app-content">
        <NamespaceConsole
          inventory={filteredInventory}
          expandedNamespaces={expandedNamespaces}
          selectedNamespaceName={selectedNamespaceName}
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
          onSelectNamespace={(namespace) => {
            setSelectedNamespaceName(namespace.name);
            setSelectedPod(undefined);
          }}
          onSelectPod={(namespace, pod) => {
            setSelectedNamespaceName(namespace);
            setSelectedPod({ namespace, pod });
          }}
          selectedPodKey={selectedPod ? `${selectedPod.namespace}/${selectedPod.pod.name}` : undefined}
        />
      </main>

      <aside className="app-sidebar">
        <PodInspector
          namespace={selectedPod?.namespace}
          namespaceInfo={selectedNamespace}
          pod={selectedPod?.pod}
        />
      </aside>

      {copyToast ? <div className="copy-toast">{copyToast}</div> : null}
    </div>
  );
}
