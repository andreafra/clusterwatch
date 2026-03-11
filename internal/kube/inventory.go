package kube

import (
	"fmt"
	"slices"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/example/clusterwatch-local/internal/model"
)

func buildInventory(tenant Tenant, namespaceItems []any, podItems []any, updatedAt time.Time) model.ClusterInventory {
	namespaces := make([]model.NamespaceInventory, 0, len(namespaceItems))
	knownNamespaces := make(map[string]*model.NamespaceInventory)

	for _, item := range namespaceItems {
		namespace, ok := item.(*corev1.Namespace)
		if !ok {
			continue
		}

		if len(tenant.Namespaces) > 0 && !containsNamespace(tenant.Namespaces, namespace.Name) {
			continue
		}

		entry := model.NamespaceInventory{
			Name:  namespace.Name,
			Phase: string(namespace.Status.Phase),
			Age:   humanAge(namespace.CreationTimestamp.Time, updatedAt),
			Pods:  []model.PodInventory{},
		}
		namespaces = append(namespaces, entry)
		knownNamespaces[namespace.Name] = &namespaces[len(namespaces)-1]
	}

	for _, item := range podItems {
		pod, ok := item.(*corev1.Pod)
		if !ok {
			continue
		}

		if len(tenant.Namespaces) > 0 && !containsNamespace(tenant.Namespaces, pod.Namespace) {
			continue
		}

		namespace, ok := knownNamespaces[pod.Namespace]
		if !ok {
			namespaces = append(namespaces, model.NamespaceInventory{
				Name:  pod.Namespace,
				Phase: "Active",
				Age:   "",
				Pods:  []model.PodInventory{},
			})
			namespace = &namespaces[len(namespaces)-1]
			knownNamespaces[pod.Namespace] = namespace
		}

		podEntry := buildPodInventory(pod, updatedAt)
		namespace.Pods = append(namespace.Pods, podEntry)
		namespace.PodCount++
		namespace.RestartCount += podEntry.RestartCount
		if podEntry.ReadyContainers == podEntry.ContainerCount && podEntry.ContainerCount > 0 && podEntry.Phase == string(corev1.PodRunning) {
			namespace.ReadyPods++
		} else {
			namespace.ProblemPods++
		}
	}

	for i := range namespaces {
		namespace := &namespaces[i]
		slices.SortFunc(namespace.Pods, comparePods)
	}
	slices.SortFunc(namespaces, compareNamespaces)

	return model.ClusterInventory{
		TenantID:   tenant.ID,
		TenantName: tenant.Name,
		Context:    tenant.Context,
		AWSProfile: tenant.AWSProfile,
		Namespaces: namespaces,
		UpdatedAt:  updatedAt,
	}
}

func buildPodInventory(pod *corev1.Pod, now time.Time) model.PodInventory {
	readyCount := 0
	restartCount := 0
	containers := make([]model.ContainerInventory, 0, len(pod.Spec.Containers))

	statusByName := make(map[string]corev1.ContainerStatus, len(pod.Status.ContainerStatuses))
	for _, status := range pod.Status.ContainerStatuses {
		statusByName[status.Name] = status
		restartCount += int(status.RestartCount)
		if status.Ready {
			readyCount++
		}
	}

	for _, container := range pod.Spec.Containers {
		status := statusByName[container.Name]
		containers = append(containers, model.ContainerInventory{
			Name:           container.Name,
			Image:          container.Image,
			Ready:          status.Ready,
			RestartCount:   status.RestartCount,
			State:          containerState(status.State),
			StateReason:    containerStateReason(status.State),
			LastExitCode:   lastExitCode(status.LastTerminationState),
			RequestsCPU:    container.Resources.Requests.Cpu().String(),
			RequestsMemory: container.Resources.Requests.Memory().String(),
			LimitsCPU:      container.Resources.Limits.Cpu().String(),
			LimitsMemory:   container.Resources.Limits.Memory().String(),
		})
	}

	ownerKind, ownerName := ownerReference(pod.OwnerReferences)
	reason, message := podReason(pod)

	return model.PodInventory{
		Name:            pod.Name,
		Phase:           string(pod.Status.Phase),
		Reason:          reason,
		Message:         message,
		ReadyContainers: readyCount,
		ContainerCount:  len(pod.Spec.Containers),
		RestartCount:    restartCount,
		Age:             humanAge(pod.CreationTimestamp.Time, now),
		NodeName:        pod.Spec.NodeName,
		PodIP:           pod.Status.PodIP,
		OwnerKind:       ownerKind,
		OwnerName:       ownerName,
		QOSClass:        string(pod.Status.QOSClass),
		Containers:      containers,
	}
}

func compareNamespaces(a, b model.NamespaceInventory) int {
	if a.ProblemPods != b.ProblemPods {
		if a.ProblemPods > b.ProblemPods {
			return -1
		}
		return 1
	}
	if a.PodCount != b.PodCount {
		if a.PodCount > b.PodCount {
			return -1
		}
		return 1
	}
	return compareStrings(a.Name, b.Name)
}

func comparePods(a, b model.PodInventory) int {
	aHealthy := a.ReadyContainers == a.ContainerCount && a.ContainerCount > 0 && a.Phase == string(corev1.PodRunning)
	bHealthy := b.ReadyContainers == b.ContainerCount && b.ContainerCount > 0 && b.Phase == string(corev1.PodRunning)
	if aHealthy != bHealthy {
		if !aHealthy {
			return -1
		}
		return 1
	}
	if a.RestartCount != b.RestartCount {
		if a.RestartCount > b.RestartCount {
			return -1
		}
		return 1
	}
	return compareStrings(a.Name, b.Name)
}

func compareStrings(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}

func containsNamespace(namespaces []string, value string) bool {
	return slices.Contains(namespaces, value)
}

func humanAge(from, to time.Time) string {
	if from.IsZero() {
		return ""
	}
	diff := to.Sub(from)
	switch {
	case diff < time.Minute:
		return fmt.Sprintf("%ds", int(diff.Seconds()))
	case diff < time.Hour:
		return fmt.Sprintf("%dm", int(diff.Minutes()))
	case diff < 24*time.Hour:
		return fmt.Sprintf("%dh", int(diff.Hours()))
	default:
		return fmt.Sprintf("%dd", int(diff.Hours()/24))
	}
}

func podReason(pod *corev1.Pod) (string, string) {
	for _, status := range pod.Status.ContainerStatuses {
		if status.State.Waiting != nil {
			return status.State.Waiting.Reason, status.State.Waiting.Message
		}
		if status.State.Terminated != nil && status.State.Terminated.ExitCode != 0 {
			return status.State.Terminated.Reason, status.State.Terminated.Message
		}
	}
	if pod.Status.Reason != "" {
		return pod.Status.Reason, pod.Status.Message
	}
	return string(pod.Status.Phase), ""
}

func ownerReference(refs []metav1.OwnerReference) (string, string) {
	if len(refs) == 0 {
		return "", ""
	}
	for _, ref := range refs {
		if ref.Controller != nil && *ref.Controller {
			return ref.Kind, ref.Name
		}
	}
	ref := refs[0]
	return ref.Kind, ref.Name
}

func containerState(state corev1.ContainerState) string {
	switch {
	case state.Running != nil:
		return "Running"
	case state.Waiting != nil:
		return "Waiting"
	case state.Terminated != nil:
		return "Terminated"
	default:
		return "Unknown"
	}
}

func containerStateReason(state corev1.ContainerState) string {
	switch {
	case state.Running != nil:
		return state.Running.StartedAt.Time.Format(time.RFC3339)
	case state.Waiting != nil:
		return state.Waiting.Reason
	case state.Terminated != nil:
		return state.Terminated.Reason
	default:
		return ""
	}
}

func lastExitCode(state corev1.ContainerState) int32 {
	if state.Terminated == nil {
		return 0
	}
	return state.Terminated.ExitCode
}
