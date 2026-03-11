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

export type ClusterInventory = {
  tenantId: string;
  tenantName: string;
  context: string;
  awsProfile: string | undefined;
  namespaces: NamespaceInventory[];
  updatedAt: string;
};

export type NamespaceInventory = {
  name: string;
  phase: string;
  age: string;
  podCount: number;
  readyPods: number;
  problemPods: number;
  restartCount: number;
  pods: PodInventory[];
};

export type PodInventory = {
  name: string;
  phase: string;
  reason: string;
  message: string;
  readyContainers: number;
  containerCount: number;
  restartCount: number;
  age: string;
  nodeName: string;
  podIp: string;
  ownerKind: string;
  ownerName: string;
  qosClass: string;
  containers: ContainerInventory[];
};

export type ContainerInventory = {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
  stateReason: string;
  lastExitCode: number;
  requestsCpu: string;
  requestsMemory: string;
  limitsCpu: string;
  limitsMemory: string;
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
  inventory: Record<string, ClusterInventory>;
  events: TransportEvent[];
  streamConnected: boolean;
  lastMessageAt: string | undefined;
  bootstrapError: string | undefined;
};
