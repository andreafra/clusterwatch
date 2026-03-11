package system

import (
	"context"
	"log/slog"
	"runtime"
	"sync"
	"time"

	"github.com/example/clusterwatch-local/internal/model"
	"github.com/example/clusterwatch-local/internal/stream"
)

const sampleInterval = 2 * time.Second

type Sampler struct {
	hub      *stream.Hub
	logger   *slog.Logger
	started  time.Time
	mu       sync.RWMutex
	current  model.RuntimeSnapshot
	lastProc processSample
	lastWall time.Time
}

func NewSampler(hub *stream.Hub, logger *slog.Logger) *Sampler {
	return &Sampler{
		hub:     hub,
		logger:  logger,
		started: time.Now(),
	}
}

func (s *Sampler) Start(ctx context.Context) {
	s.collectAndPublish()

	ticker := time.NewTicker(sampleInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.collectAndPublish()
			}
		}
	}()
}

func (s *Sampler) Snapshot() model.RuntimeSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

func (s *Sampler) collectAndPublish() {
	now := time.Now()

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	proc, err := readProcessSample()
	if err != nil {
		s.logger.Debug("runtime process sample unavailable", "error", err)
	}

	snapshot := model.RuntimeSnapshot{
		CPUPercent:     s.computeCPUPercent(proc, now),
		RSSBytes:       proc.rssBytes,
		HeapAllocBytes: mem.HeapAlloc,
		Goroutines:     runtime.NumGoroutine(),
		GCCount:        mem.NumGC,
		UptimeSeconds:  int64(time.Since(s.started).Seconds()),
		CollectedAt:    now.UTC(),
	}

	s.mu.Lock()
	s.current = snapshot
	s.mu.Unlock()

	s.hub.Publish(model.Event{
		Type:      "system.runtime",
		Timestamp: snapshot.CollectedAt,
		Payload:   snapshot,
	})
}

func (s *Sampler) computeCPUPercent(proc processSample, now time.Time) float64 {
	if s.lastWall.IsZero() || proc.cpuTime <= 0 || s.lastProc.cpuTime <= 0 {
		s.lastProc = proc
		s.lastWall = now
		return 0
	}

	wallDelta := now.Sub(s.lastWall)
	cpuDelta := proc.cpuTime - s.lastProc.cpuTime

	s.lastProc = proc
	s.lastWall = now

	if wallDelta <= 0 || cpuDelta <= 0 {
		return 0
	}

	cpuPercent := float64(cpuDelta) / float64(wallDelta) * 100 / float64(runtime.NumCPU())
	if cpuPercent < 0 {
		return 0
	}
	return cpuPercent
}
