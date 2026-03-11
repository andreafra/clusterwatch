package stream

import (
	"context"
	"log/slog"
	"sync"

	"github.com/example/clusterwatch-local/internal/model"
)

type Hub struct {
	logger  *slog.Logger
	mu      sync.RWMutex
	clients map[chan model.Event]struct{}
}

func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		logger:  logger,
		clients: make(map[chan model.Event]struct{}),
	}
}

func (h *Hub) Subscribe(ctx context.Context) <-chan model.Event {
	ch := make(chan model.Event, 64)

	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()

	go func() {
		<-ctx.Done()
		h.mu.Lock()
		delete(h.clients, ch)
		close(ch)
		h.mu.Unlock()
	}()

	return ch
}

func (h *Hub) Publish(event model.Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.clients {
		select {
		case ch <- event:
		default:
			h.logger.Warn("dropping websocket event", "type", event.Type)
		}
	}
}
