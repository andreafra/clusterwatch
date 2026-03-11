import {
  Activity,
  Clock3,
  Cpu,
  HardDrive,
  Layers3,
  MemoryStick,
  Radio,
  Server,
  Waves,
} from "lucide-react";
import type { DashboardState } from "../types";

export function ConnectionPanel({
  state,
  compact = false,
}: {
  state: DashboardState;
  compact?: boolean;
}) {
  return (
    <section className={`panel${compact ? " panel--compact" : ""}`}>
      <div className="panel__header panel__header--tight">
        <div>
          <p className="eyebrow">Local process</p>
        </div>
      </div>

      <dl className="connection-grid">
        <div>
          <dt><Radio size={13} strokeWidth={1.8} /> REST bootstrap</dt>
          <dd>{state.bootstrapError ? "Attention required" : "Ready"}</dd>
        </div>
        <div>
          <dt><Waves size={13} strokeWidth={1.8} /> WebSocket</dt>
          <dd>{state.streamConnected ? "Open" : "Closed"}</dd>
        </div>
        <div>
          <dt><Clock3 size={13} strokeWidth={1.8} /> Last message</dt>
          <dd>{state.lastMessageAt ? new Date(state.lastMessageAt).toLocaleTimeString() : "Pending"}</dd>
        </div>
        <div>
          <dt><Server size={13} strokeWidth={1.8} /> Known clusters</dt>
          <dd>{Object.keys(state.snapshots).length}</dd>
        </div>
        <div>
          <dt><Cpu size={13} strokeWidth={1.8} /> CPU</dt>
          <dd>{state.runtime ? `${state.runtime.cpuPercent.toFixed(1)}%` : "--"}</dd>
        </div>
        <div>
          <dt title="Resident Set Size: the physical RAM currently occupied by this Go process.">
            <MemoryStick size={13} strokeWidth={1.8} /> RSS
          </dt>
          <dd>{state.runtime ? formatBytes(state.runtime.rssBytes) : "--"}</dd>
        </div>
        <div>
          <dt><HardDrive size={13} strokeWidth={1.8} /> Heap</dt>
          <dd>{state.runtime ? formatBytes(state.runtime.heapAllocBytes) : "--"}</dd>
        </div>
        <div>
          <dt><Layers3 size={13} strokeWidth={1.8} /> Goroutines</dt>
          <dd>{state.runtime ? state.runtime.goroutines : "--"}</dd>
        </div>
        <div>
          <dt><Activity size={13} strokeWidth={1.8} /> GC</dt>
          <dd>{state.runtime ? state.runtime.gcCount : "--"}</dd>
        </div>
        <div>
          <dt><Clock3 size={13} strokeWidth={1.8} /> Uptime</dt>
          <dd>{state.runtime ? formatUptime(state.runtime.uptimeSeconds) : "--"}</dd>
        </div>
      </dl>

      {state.bootstrapError ? <p className="panel-error">{state.bootstrapError}</p> : null}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
