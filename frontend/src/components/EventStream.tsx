import type { TransportEvent } from "../types";

type EventStreamProps = {
  events: TransportEvent[];
};

export function EventStream({ events }: EventStreamProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Watch activity</p>
          <h2>Realtime event stream</h2>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="empty-state">The backend has not emitted any cluster events yet.</p>
      ) : (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id} className={`event-list__item event-list__item--${event.severity}`}>
              <div>
                <strong>{event.label}</strong>
                <p>{event.message}</p>
              </div>
              <div className="event-list__meta">
                <span>{event.type}</span>
                <time dateTime={event.timestamp}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
