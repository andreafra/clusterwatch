export type Tenant = {
  id: string;
  name: string;
  context: string;
  awsProfile?: string;
  namespaces: string[] | null | undefined;
  contextName?: string;
  accountId?: string;
  region?: string;
};

export type ConnectionState =
  | "pending"
  | "connecting"
  | "connected"
  | "degraded"
  | "disconnected";

export type ResourceCounts = {
  namespaces: number;
  nodes: number;
  pods: number;
  deployments: number;
};

export type ClusterSnapshot = {
  tenantId: string;
  tenantName: string;
  context: string;
  awsProfile: string | undefined;
  connection: ConnectionState;
  message: string;
  resourceCounts: ResourceCounts;
  updatedAt: string;
  clusterName: string;
  contextName: string;
  region: string | undefined;
  connectionState: ConnectionState;
  observedAt: string;
  latencyMs: number | undefined;
  warnings: string[];
};

export type TransportEvent = {
  id: string;
  type: string;
  tenantId: string | undefined;
  severity: "info" | "warning" | "error";
  label: string;
  message: string;
  timestamp: string;
};

export type StreamEnvelope = {
  type: string;
  tenantId?: string;
  timestamp: string;
  payload: unknown;
};

export type DashboardState = {
  tenants: Tenant[];
  snapshots: Record<string, ClusterSnapshot>;
  events: TransportEvent[];
  streamConnected: boolean;
  lastMessageAt: string | undefined;
  bootstrapError: string | undefined;
};
