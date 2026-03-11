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
      <div className="panel__header">
        <div>
          <p className="eyebrow">System</p>
          <h2>Transport</h2>
        </div>
      </div>

      <dl className="connection-grid">
        <div>
          <dt>REST bootstrap</dt>
          <dd>{state.bootstrapError ? "Attention required" : "Ready"}</dd>
        </div>
        <div>
          <dt>WebSocket</dt>
          <dd>{state.streamConnected ? "Open" : "Closed"}</dd>
        </div>
        <div>
          <dt>Last message</dt>
          <dd>{state.lastMessageAt ? new Date(state.lastMessageAt).toLocaleTimeString() : "Pending"}</dd>
        </div>
        <div>
          <dt>Known clusters</dt>
          <dd>{Object.keys(state.snapshots).length}</dd>
        </div>
      </dl>

      {state.bootstrapError ? <p className="panel-error">{state.bootstrapError}</p> : null}
    </section>
  );
}
