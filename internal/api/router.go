package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/example/clusterwatch-local/internal/config"
	"github.com/example/clusterwatch-local/internal/kube"
	"github.com/example/clusterwatch-local/internal/model"
	"github.com/example/clusterwatch-local/internal/stream"
	"github.com/example/clusterwatch-local/internal/system"
)

type Router struct {
	cfg      config.Config
	manager  *kube.Manager
	hub      *stream.Hub
	sampler  *system.Sampler
	logger   *slog.Logger
	upgrader websocket.Upgrader
}

func NewRouter(cfg config.Config, manager *kube.Manager, hub *stream.Hub, sampler *system.Sampler, logger *slog.Logger, dashboardFS fs.FS) http.Handler {
	router := &Router{
		cfg:     cfg,
		manager: manager,
		hub:     hub,
		sampler: sampler,
		logger:  logger,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return isAllowedWebSocketOrigin(r, cfg.Server.AllowedOrigin) },
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", router.handleHealth)
	mux.HandleFunc("/api/v1/tenants", router.handleTenants)
	mux.HandleFunc("/api/v1/snapshots", router.handleSnapshots)
	mux.HandleFunc("/api/v1/inventory", router.handleInventory)
	mux.HandleFunc("/api/v1/runtime", router.handleRuntime)
	mux.HandleFunc("/ws", router.handleWS)
	registerDashboardRoutes(mux, logger, dashboardFS)

	return withCORS(cfg.Server.AllowedOrigin, mux)
}

func (r *Router) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *Router) handleTenants(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.manager.Tenants())
}

func (r *Router) handleSnapshots(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.manager.Snapshots())
}

func (r *Router) handleInventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.manager.Inventory())
}

func (r *Router) handleRuntime(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.sampler.Snapshot())
}

func (r *Router) handleWS(w http.ResponseWriter, req *http.Request) {
	conn, err := r.upgrader.Upgrade(w, req, nil)
	if err != nil {
		r.logger.Warn("upgrade websocket", "error", err)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()

	events := r.hub.Subscribe(ctx)
	if err := conn.WriteJSON(model.Event{
		Type:      "system.connected",
		Timestamp: time.Now().UTC(),
		Payload: map[string]string{
			"status": "connected",
		},
	}); err != nil {
		return
	}
	for _, snapshot := range r.manager.Snapshots() {
		if err := conn.WriteJSON(model.Event{
			Type:      "snapshot.bootstrap",
			TenantID:  snapshot.TenantID,
			Timestamp: time.Now().UTC(),
			Payload:   snapshot,
		}); err != nil {
			return
		}
	}
	if err := conn.WriteJSON(model.Event{
		Type:      "system.runtime",
		Timestamp: time.Now().UTC(),
		Payload:   r.sampler.Snapshot(),
	}); err != nil {
		return
	}

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := conn.WriteJSON(event); err != nil {
				return
			}
		}
	}
}

func withCORS(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func isAllowedWebSocketOrigin(r *http.Request, allowedOrigin string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if origin == allowedOrigin {
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if originURL.Host == r.Host {
		return true
	}

	hostname := strings.ToLower(originURL.Hostname())
	return hostname == "localhost" || hostname == "127.0.0.1"
}

func registerDashboardRoutes(mux *http.ServeMux, logger *slog.Logger, dashboardFS fs.FS) {
	distFS, source, err := resolveDashboardFS(dashboardFS)
	if err != nil {
		logger.Warn("frontend dist is unavailable; /dashboard will return 404 until the frontend is built", "source", source, "error", err)
		return
	}

	fileServer := http.FileServer(http.FS(distFS))
	mux.Handle("/assets/", fileServer)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/dashboard", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("/dashboard", serveDashboardIndex(distFS))
	mux.HandleFunc("/dashboard/", serveDashboardIndex(distFS))
}

func serveDashboardIndex(distFS fs.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		data, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			http.Error(w, "dashboard is unavailable", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(data)
	}
}

func resolveDashboardFS(dashboardFS fs.FS) (fs.FS, string, error) {
	if dashboardFS != nil {
		if _, err := fs.Stat(dashboardFS, "index.html"); err != nil {
			return nil, "embedded frontend", err
		}
		return dashboardFS, "embedded frontend", nil
	}

	distDir := filepath.Join("frontend", "dist")
	distFS := os.DirFS(distDir)
	if _, err := fs.Stat(distFS, "index.html"); err != nil {
		return nil, distDir, fmt.Errorf("missing built frontend at %s: %w", distDir, err)
	}

	return distFS, distDir, nil
}
