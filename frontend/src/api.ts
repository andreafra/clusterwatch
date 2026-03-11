import type { ClusterInventory, ClusterSnapshot, StreamEnvelope, Tenant } from "./types";

const backendHttpOrigin = "http://localhost:42069";
const backendWsOrigin = "ws://localhost:42069";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchTenants(signal?: AbortSignal): Promise<Tenant[]> {
  const response = await fetch(`${backendHttpOrigin}/api/v1/tenants`, signal ? { signal } : {});
  return parseJson<Tenant[]>(response);
}

export async function fetchSnapshots(signal?: AbortSignal): Promise<ClusterSnapshot[]> {
  const response = await fetch(`${backendHttpOrigin}/api/v1/snapshots`, signal ? { signal } : {});
  return parseJson<ClusterSnapshot[]>(response);
}

export async function fetchInventory(signal?: AbortSignal): Promise<ClusterInventory[]> {
  const response = await fetch(`${backendHttpOrigin}/api/v1/inventory`, signal ? { signal } : {});
  return parseJson<ClusterInventory[]>(response);
}

export function openDashboardStream(
  handlers: {
    onMessage: (message: StreamEnvelope) => void;
    onOpen: () => void;
    onClose: () => void;
    onError: (message: string) => void;
  },
): () => void {
  const socket = new WebSocket(`${backendWsOrigin}/ws`);

  socket.addEventListener("open", handlers.onOpen);
  socket.addEventListener("close", handlers.onClose);
  socket.addEventListener("error", () => handlers.onError("The realtime stream failed."));
  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data) as StreamEnvelope;
      handlers.onMessage(parsed);
    } catch (error) {
      handlers.onError(
        error instanceof Error ? error.message : "The realtime payload was invalid.",
      );
    }
  });

  return () => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  };
}
