package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	clusterwatchlocal "github.com/example/clusterwatch-local"
	"github.com/example/clusterwatch-local/internal/api"
	"github.com/example/clusterwatch-local/internal/config"
	"github.com/example/clusterwatch-local/internal/kube"
	"github.com/example/clusterwatch-local/internal/stream"
	"github.com/example/clusterwatch-local/internal/system"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfgPath := os.Getenv("CLUSTERWATCH_CONFIG")
	cfg, err := config.Load(cfgPath)
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	hub := stream.NewHub(logger)
	sampler := system.NewSampler(hub, logger)
	manager, err := kube.NewManager(cfg, hub, logger)
	if err != nil {
		logger.Error("create manager", "error", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	sampler.Start(ctx)

	if err := manager.Start(ctx); err != nil {
		logger.Error("start manager", "error", err)
		os.Exit(1)
	}

	dashboardFS, embeddedDashboard, err := clusterwatchlocal.EmbeddedFrontend()
	if err != nil {
		logger.Error("load embedded frontend", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              cfg.Server.Address,
		Handler:           api.NewRouter(cfg, manager, hub, sampler, logger, dashboardFS),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	logger.Info("server listening", "address", cfg.Server.Address, "tenants", len(manager.Tenants()))
	logger.Info("dashboard asset mode", "embedded", embeddedDashboard)
	logger.Info("Open the following URL in your browser to access the dashboard", "url", "http://"+cfg.Server.Address+"/dashboard")
	logger.Info("Press Ctrl-C to exit")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("http server failed", "error", err)
		os.Exit(1)
	}
}
