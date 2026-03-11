import { useEffect, useReducer } from "react";
import { fetchSnapshots, fetchTenants, openDashboardStream } from "../api";
import type {
  ClusterSnapshot,
  DashboardState,
  StreamEnvelope,
  Tenant,
  TransportEvent,
} from "../types";

type Action =
  | { type: "bootstrapSuccess"; tenants: Tenant[]; snapshots: ClusterSnapshot[] }
  | { type: "bootstrapFailure"; message: string }
  | { type: "streamConnected" }
  | { type: "streamDisconnected" }
  | { type: "streamMessage"; message: StreamEnvelope }
  | { type: "streamFailure"; message: string };

const initialState: DashboardState = {
  tenants: [],
  snapshots: {},
  events: [],
  streamConnected: false,
  lastMessageAt: undefined,
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

function isSnapshotPayload(payload: unknown): payload is Partial<ClusterSnapshot> {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<ClusterSnapshot>;
  return typeof candidate.tenantId === "string" && typeof candidate.updatedAt === "string";
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
        bootstrapError: undefined,
      };
    }
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
      if (isSnapshotPayload(action.message.payload)) {
        return {
          ...state,
          snapshots: upsertSnapshot(state.snapshots, normalizeSnapshot(action.message.payload)),
          events: prependEvent(state.events, toTransportEvent(action.message)),
          lastMessageAt: action.message.timestamp,
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
        const [tenants, snapshots] = await Promise.all([
          fetchTenants(controller.signal),
          fetchSnapshots(controller.signal),
        ]);
        dispatch({ type: "bootstrapSuccess", tenants, snapshots });
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

  return state;
}
