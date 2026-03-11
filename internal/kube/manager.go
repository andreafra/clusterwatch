package kube

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"

	"github.com/example/clusterwatch-local/internal/config"
	"github.com/example/clusterwatch-local/internal/model"
	"github.com/example/clusterwatch-local/internal/stream"
)

type Manager struct {
	cfg       config.Config
	hub       *stream.Hub
	logger    *slog.Logger
	mu        sync.RWMutex
	tenants   []Tenant
	snapshots map[string]model.ClusterSnapshot
	inventory map[string]model.ClusterInventory
}

func NewManager(cfg config.Config, hub *stream.Hub, logger *slog.Logger) (*Manager, error) {
	tenants, err := DiscoverTenants(cfg.Kubeconfig, cfg.Tenants)
	if err != nil {
		return nil, err
	}

	snapshots := make(map[string]model.ClusterSnapshot, len(tenants))
	inventory := make(map[string]model.ClusterInventory, len(tenants))

	for _, tenant := range tenants {
		now := time.Now().UTC()
		snapshots[tenant.ID] = model.ClusterSnapshot{
			TenantID:   tenant.ID,
			TenantName: tenant.Name,
			Context:    tenant.Context,
			AWSProfile: tenant.AWSProfile,
			Connection: "pending",
			Message:    "waiting for informer sync",
			UpdatedAt:  now,
		}
		inventory[tenant.ID] = model.ClusterInventory{
			TenantID:   tenant.ID,
			TenantName: tenant.Name,
			Context:    tenant.Context,
			AWSProfile: tenant.AWSProfile,
			Namespaces: []model.NamespaceInventory{},
			UpdatedAt:  now,
		}
	}

	return &Manager{
		cfg:       cfg,
		hub:       hub,
		logger:    logger,
		tenants:   tenants,
		snapshots: snapshots,
		inventory: inventory,
	}, nil
}

func (m *Manager) Start(ctx context.Context) error {
	for _, tenant := range m.tenants {
		tenant := tenant
		go m.runTenant(ctx, tenant)
	}
	return nil
}

func (m *Manager) Tenants() []model.TenantInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]model.TenantInfo, 0, len(m.tenants))
	for _, tenant := range m.tenants {
		out = append(out, toTenantInfo(tenant))
	}
	return out
}

func (m *Manager) Snapshots() []model.ClusterSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]model.ClusterSnapshot, 0, len(m.snapshots))
	for _, snapshot := range m.snapshots {
		out = append(out, snapshot)
	}
	slices.SortFunc(out, func(a, b model.ClusterSnapshot) int {
		switch {
		case a.TenantName < b.TenantName:
			return -1
		case a.TenantName > b.TenantName:
			return 1
		default:
			return 0
		}
	})
	return out
}

func (m *Manager) Inventory() []model.ClusterInventory {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]model.ClusterInventory, 0, len(m.inventory))
	for _, inventory := range m.inventory {
		out = append(out, inventory)
	}
	slices.SortFunc(out, func(a, b model.ClusterInventory) int {
		return compareStrings(a.TenantName, b.TenantName)
	})
	return out
}

func (m *Manager) runTenant(ctx context.Context, tenant Tenant) {
	for {
		if ctx.Err() != nil {
			return
		}

		if err := m.watchTenant(ctx, tenant); err != nil {
			m.logger.Error("tenant monitor stopped", "tenant", tenant.ID, "error", err)
			now := time.Now().UTC()
			m.updateState(tenant, model.ResourceCounts{}, model.ClusterInventory{
				TenantID:   tenant.ID,
				TenantName: tenant.Name,
				Context:    tenant.Context,
				AWSProfile: tenant.AWSProfile,
				Namespaces: []model.NamespaceInventory{},
				UpdatedAt:  now,
			}, "degraded", err.Error(), now)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (m *Manager) watchTenant(ctx context.Context, tenant Tenant) error {
	restCfg, err := buildRESTConfig(m.cfg.Kubeconfig, tenant)
	if err != nil {
		return fmt.Errorf("build rest config: %w", err)
	}

	client, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		return fmt.Errorf("create client: %w", err)
	}

	factory := informers.NewSharedInformerFactory(client, 0)
	pods := factory.Core().V1().Pods().Informer()
	namespaces := factory.Core().V1().Namespaces().Informer()
	nodes := factory.Core().V1().Nodes().Informer()
	deployments := factory.Apps().V1().Deployments().Informer()

	publish := func(message string) {
		now := time.Now().UTC()
		counts := model.ResourceCounts{
			Namespaces:  countObjects(namespaces.GetStore().List(), tenant.Namespaces),
			Nodes:       countObjects(nodes.GetStore().List(), nil),
			Pods:        countObjects(pods.GetStore().List(), tenant.Namespaces),
			Deployments: countObjects(deployments.GetStore().List(), tenant.Namespaces),
		}
		inventory := buildInventory(tenant, namespaces.GetStore().List(), pods.GetStore().List(), now)
		m.updateState(tenant, counts, inventory, "connected", message, now)
	}

	handler := cache.ResourceEventHandlerFuncs{
		AddFunc: func(any) {
			publish("resource added")
		},
		UpdateFunc: func(any, any) {
			publish("resource updated")
		},
		DeleteFunc: func(any) {
			publish("resource deleted")
		},
	}

	if _, err := pods.AddEventHandler(handler); err != nil {
		return err
	}
	if _, err := namespaces.AddEventHandler(handler); err != nil {
		return err
	}
	if _, err := nodes.AddEventHandler(handler); err != nil {
		return err
	}
	if _, err := deployments.AddEventHandler(handler); err != nil {
		return err
	}

	stopCh := make(chan struct{})
	defer close(stopCh)
	factory.Start(stopCh)

	if !cache.WaitForCacheSync(ctx.Done(), pods.HasSynced, namespaces.HasSynced, nodes.HasSynced, deployments.HasSynced) {
		return fmt.Errorf("cache sync timed out")
	}

	publish("initial sync complete")
	<-ctx.Done()
	return nil
}

func (m *Manager) updateState(tenant Tenant, counts model.ResourceCounts, inventory model.ClusterInventory, connection, message string, updatedAt time.Time) {
	snapshot := model.ClusterSnapshot{
		TenantID:       tenant.ID,
		TenantName:     tenant.Name,
		Context:        tenant.Context,
		AWSProfile:     tenant.AWSProfile,
		Connection:     connection,
		Message:        message,
		ResourceCounts: counts,
		UpdatedAt:      updatedAt,
	}

	m.mu.Lock()
	m.snapshots[tenant.ID] = snapshot
	m.inventory[tenant.ID] = inventory
	m.mu.Unlock()

	m.hub.Publish(model.Event{
		Type:      "snapshot.updated",
		TenantID:  tenant.ID,
		Timestamp: snapshot.UpdatedAt,
		Payload:   snapshot,
	})
}

func countObjects(items []any, allowed []string) int {
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, item := range allowed {
		allowedSet[item] = struct{}{}
	}

	total := 0
	for _, item := range items {
		switch obj := item.(type) {
		case metav1.Object:
			if len(allowedSet) > 0 && obj.GetNamespace() != "" {
				if _, ok := allowedSet[obj.GetNamespace()]; !ok {
					continue
				}
			}
			total++
		}
	}
	return total
}
