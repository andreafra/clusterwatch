import { useEffect, useReducer } from "react";
import { fetchInventory, fetchRuntime, fetchSnapshots, fetchTenants, openDashboardStream } from "../api";
import type {
  ClusterInventory,
  ClusterSnapshot,
  DashboardState,
  NamespaceInventory,
  RuntimeSnapshot,
  StreamEnvelope,
  Tenant,
  TransportEvent,
} from "../types";

type Action =
  | {
      type: "bootstrapSuccess";
      tenants: Tenant[];
      snapshots: ClusterSnapshot[];
      inventory: ClusterInventory[];
      runtime: RuntimeSnapshot;
    }
  | { type: "inventoryLoaded"; inventory: ClusterInventory[] }
  | { type: "runtimeLoaded"; runtime: RuntimeSnapshot }
  | { type: "bootstrapFailure"; message: string }
  | { type: "streamConnected" }
  | { type: "streamDisconnected" }
  | { type: "streamMessage"; message: StreamEnvelope }
  | { type: "streamFailure"; message: string };

const initialState: DashboardState = {
  tenants: [],
  snapshots: {},
  inventory: {},
  runtime: undefined,
  events: [],
  streamConnected: false,
  lastMessageAt: undefined,
  inventoryRefreshAt: undefined,
  bootstrapError: undefined,
};

function upsertSnapshot(
  snapshots: Record<string, ClusterSnapshot>,
  nextSnapshot: ClusterSnapshot,
): Record<string, ClusterSnapshot> {
  return {
    ...snapshots,
    [nextSnapshot.tenantId]: nextSnapshot,
  };
}

function prependEvent(events: TransportEvent[], event: TransportEvent): TransportEvent[] {
  return [event, ...events].slice(0, 50);
}

function normalizeTenant(tenant: Tenant): Tenant {
  return {
    ...tenant,
    namespaces: tenant.namespaces ?? [],
  };
}

function inventoryByTenant(items: ClusterInventory[]): Record<string, ClusterInventory> {
  return items.reduce<Record<string, ClusterInventory>>((acc, item) => {
    acc[item.tenantId] = normalizeInventory(item);
    return acc;
  }, {});
}

function normalizeNamespaceInventory(namespace: NamespaceInventory): NamespaceInventory {
  return {
    ...namespace,
    pods: namespace.pods ?? [],
    services: namespace.services ?? [],
    ingresses: namespace.ingresses ?? [],
    configMaps: namespace.configMaps ?? [],
    secrets: namespace.secrets ?? [],
    serviceCount: namespace.serviceCount ?? namespace.services?.length ?? 0,
    ingressCount: namespace.ingressCount ?? namespace.ingresses?.length ?? 0,
    configMapCount: namespace.configMapCount ?? namespace.configMaps?.length ?? 0,
    secretCount: namespace.secretCount ?? namespace.secrets?.length ?? 0,
  };
}

function normalizeInventory(inventory: ClusterInventory): ClusterInventory {
  return {
    ...inventory,
    namespaces: (inventory.namespaces ?? []).map(normalizeNamespaceInventory),
  };
}

function isSnapshotPayload(payload: unknown): payload is Partial<ClusterSnapshot> {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<ClusterSnapshot>;
  return typeof candidate.tenantId === "string" && typeof candidate.updatedAt === "string";
}

function isRuntimePayload(payload: unknown): payload is RuntimeSnapshot {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<RuntimeSnapshot>;
  return (
    typeof candidate.cpuPercent === "number" &&
    typeof candidate.heapAllocBytes === "number" &&
    typeof candidate.goroutines === "number" &&
    typeof candidate.gcCount === "number" &&
    typeof candidate.uptimeSeconds === "number" &&
    typeof candidate.collectedAt === "string"
  );
}

function normalizeSnapshot(snapshot: Partial<ClusterSnapshot>): ClusterSnapshot {
  const connection = snapshot.connection ?? snapshot.connectionState ?? "pending";
  const updatedAt = snapshot.updatedAt ?? snapshot.observedAt ?? new Date().toISOString();

  return {
    tenantId: snapshot.tenantId ?? "unknown",
    tenantName: snapshot.tenantName ?? snapshot.clusterName ?? "Unknown tenant",
    context: snapshot.context ?? snapshot.contextName ?? "unknown-context",
    awsProfile: snapshot.awsProfile,
    connection,
    message: snapshot.message ?? "Awaiting snapshot",
    resourceCounts: snapshot.resourceCounts ?? {
      namespaces: 0,
      nodes: 0,
      pods: 0,
      deployments: 0,
    },
    updatedAt,
    clusterName: snapshot.clusterName ?? snapshot.tenantName ?? "Unknown tenant",
    contextName: snapshot.contextName ?? snapshot.context ?? "unknown-context",
    region: snapshot.region,
    connectionState: connection,
    observedAt: updatedAt,
    latencyMs: snapshot.latencyMs,
    warnings: snapshot.warnings ?? [],
  };
}

function toTransportEvent(message: StreamEnvelope): TransportEvent {
  const snapshot = isSnapshotPayload(message.payload) ? normalizeSnapshot(message.payload) : undefined;
  const severity =
    snapshot?.connection === "degraded"
      ? "error"
      : message.type.startsWith("snapshot.")
        ? "warning"
        : "info";

  return {
    id: `${message.type}-${message.timestamp}-${message.tenantId ?? "system"}`,
    type: message.type,
    tenantId: message.tenantId,
    severity,
    label: snapshot?.tenantName ?? message.tenantId ?? "System",
    message: snapshot?.message ?? message.type,
    timestamp: message.timestamp,
  };
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "bootstrapSuccess": {
      const snapshots = action.snapshots.reduce<Record<string, ClusterSnapshot>>((acc, snapshot) => {
        const normalized = normalizeSnapshot(snapshot);
        acc[normalized.tenantId] = normalized;
        return acc;
      }, {});

      return {
        ...state,
        tenants: action.tenants.map(normalizeTenant),
        snapshots,
        inventory: inventoryByTenant(action.inventory),
        runtime: action.runtime,
        bootstrapError: undefined,
      };
    }
    case "inventoryLoaded":
      return {
        ...state,
        inventory: inventoryByTenant(action.inventory),
      };
    case "runtimeLoaded":
      return {
        ...state,
        runtime: action.runtime,
      };
    case "bootstrapFailure":
      return {
        ...state,
        bootstrapError: action.message,
      };
    case "streamConnected":
      return {
        ...state,
        streamConnected: true,
        bootstrapError: undefined,
      };
    case "streamDisconnected":
      return {
        ...state,
        streamConnected: false,
      };
    case "streamFailure":
      return {
        ...state,
        streamConnected: false,
        bootstrapError: action.message,
      };
    case "streamMessage":
      if (isRuntimePayload(action.message.payload)) {
        return {
          ...state,
          runtime: action.message.payload,
          events: prependEvent(state.events, toTransportEvent(action.message)),
          lastMessageAt: action.message.timestamp,
        };
      }

      if (isSnapshotPayload(action.message.payload)) {
        return {
          ...state,
          snapshots: upsertSnapshot(state.snapshots, normalizeSnapshot(action.message.payload)),
          events: prependEvent(state.events, toTransportEvent(action.message)),
          lastMessageAt: action.message.timestamp,
          inventoryRefreshAt: action.message.timestamp,
        };
      }

      return {
        ...state,
        events: prependEvent(state.events, toTransportEvent(action.message)),
        lastMessageAt: action.message.timestamp,
      };
    default:
      return state;
  }
}

export function useDashboardState(): DashboardState {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        const [tenants, snapshots, inventory, runtime] = await Promise.all([
          fetchTenants(controller.signal),
          fetchSnapshots(controller.signal),
          fetchInventory(controller.signal),
          fetchRuntime(controller.signal),
        ]);
        dispatch({ type: "bootstrapSuccess", tenants, snapshots, inventory, runtime });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        dispatch({
          type: "bootstrapFailure",
          message: error instanceof Error ? error.message : "Failed to load dashboard data.",
        });
      }
    }

    void bootstrap();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const close = openDashboardStream({
      onOpen: () => dispatch({ type: "streamConnected" }),
      onClose: () => dispatch({ type: "streamDisconnected" }),
      onError: (message) => dispatch({ type: "streamFailure", message }),
      onMessage: (message) => dispatch({ type: "streamMessage", message }),
    });

    return close;
  }, []);

  useEffect(() => {
    if (state.inventoryRefreshAt === undefined) {
      return;
    }

    const controller = new AbortController();
    void fetchInventory(controller.signal)
      .then((inventory) => dispatch({ type: "inventoryLoaded", inventory }))
      .catch(() => undefined);

    return () => controller.abort();
  }, [state.inventoryRefreshAt]);

  return state;
}
