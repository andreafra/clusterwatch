import type { ConnectionState } from "../types";

const labelByState: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting",
  pending: "Pending",
  degraded: "Degraded",
  disconnected: "Disconnected",
};

export function StatusPill({ state }: { state: ConnectionState }) {
  return <span className={`status-pill status-pill--${state}`}>{labelByState[state]}</span>;
}
