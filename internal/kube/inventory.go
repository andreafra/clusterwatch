package kube

import (
	"fmt"
	"slices"
	"time"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/example/clusterwatch-local/internal/model"
)

func buildInventory(
	tenant Tenant,
	namespaceItems []any,
	podItems []any,
	serviceItems []any,
	ingressItems []any,
	configMapItems []any,
	secretItems []any,
	updatedAt time.Time,
) model.ClusterInventory {
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
			Name:       namespace.Name,
			Phase:      string(namespace.Status.Phase),
			Age:        humanAge(namespace.CreationTimestamp.Time, updatedAt),
			Pods:       []model.PodInventory{},
			Services:   []model.ServiceInventory{},
			Ingresses:  []model.IngressInventory{},
			ConfigMaps: []model.ConfigMapInventory{},
			Secrets:    []model.SecretInventory{},
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
			namespace = ensureNamespace(&namespaces, knownNamespaces, pod.Namespace)
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

	for _, item := range serviceItems {
		service, ok := item.(*corev1.Service)
		if !ok || !allowNamespace(tenant.Namespaces, service.Namespace) {
			continue
		}

		namespace := ensureNamespace(&namespaces, knownNamespaces, service.Namespace)
		namespace.Services = append(namespace.Services, buildServiceInventory(service, updatedAt))
		namespace.ServiceCount++
	}

	for _, item := range ingressItems {
		ingress, ok := item.(*networkingv1.Ingress)
		if !ok || !allowNamespace(tenant.Namespaces, ingress.Namespace) {
			continue
		}

		namespace := ensureNamespace(&namespaces, knownNamespaces, ingress.Namespace)
		namespace.Ingresses = append(namespace.Ingresses, buildIngressInventory(ingress, updatedAt))
		namespace.IngressCount++
	}

	for _, item := range configMapItems {
		configMap, ok := item.(*corev1.ConfigMap)
		if !ok || !allowNamespace(tenant.Namespaces, configMap.Namespace) {
			continue
		}

		namespace := ensureNamespace(&namespaces, knownNamespaces, configMap.Namespace)
		namespace.ConfigMaps = append(namespace.ConfigMaps, buildConfigMapInventory(configMap, updatedAt))
		namespace.ConfigMapCount++
	}

	for _, item := range secretItems {
		secret, ok := item.(*corev1.Secret)
		if !ok || !allowNamespace(tenant.Namespaces, secret.Namespace) {
			continue
		}

		namespace := ensureNamespace(&namespaces, knownNamespaces, secret.Namespace)
		namespace.Secrets = append(namespace.Secrets, buildSecretInventory(secret, updatedAt))
		namespace.SecretCount++
	}

	for i := range namespaces {
		namespace := &namespaces[i]
		slices.SortFunc(namespace.Pods, comparePods)
		slices.SortFunc(namespace.Services, compareServices)
		slices.SortFunc(namespace.Ingresses, compareIngresses)
		slices.SortFunc(namespace.ConfigMaps, compareConfigMaps)
		slices.SortFunc(namespace.Secrets, compareSecrets)
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

func ensureNamespace(
	namespaces *[]model.NamespaceInventory,
	knownNamespaces map[string]*model.NamespaceInventory,
	name string,
) *model.NamespaceInventory {
	if namespace, ok := knownNamespaces[name]; ok {
		return namespace
	}

	*namespaces = append(*namespaces, model.NamespaceInventory{
		Name:       name,
		Phase:      "Active",
		Pods:       []model.PodInventory{},
		Services:   []model.ServiceInventory{},
		Ingresses:  []model.IngressInventory{},
		ConfigMaps: []model.ConfigMapInventory{},
		Secrets:    []model.SecretInventory{},
	})
	namespace := &(*namespaces)[len(*namespaces)-1]
	knownNamespaces[name] = namespace
	return namespace
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

func buildServiceInventory(service *corev1.Service, now time.Time) model.ServiceInventory {
	ports := make([]string, 0, len(service.Spec.Ports))
	for _, port := range service.Spec.Ports {
		target := fmt.Sprintf("%d", port.Port)
		if port.TargetPort.String() != "" {
			target = fmt.Sprintf("%s->%d", port.TargetPort.String(), port.Port)
		}
		if port.Name != "" {
			target = fmt.Sprintf("%s:%s", port.Name, target)
		}
		ports = append(ports, fmt.Sprintf("%s/%s", target, port.Protocol))
	}

	externalIP := ""
	if len(service.Status.LoadBalancer.Ingress) > 0 {
		ingress := service.Status.LoadBalancer.Ingress[0]
		externalIP = firstNonEmpty(ingress.IP, ingress.Hostname)
	} else if len(service.Spec.ExternalIPs) > 0 {
		externalIP = service.Spec.ExternalIPs[0]
	}

	return model.ServiceInventory{
		Name:       service.Name,
		Type:       string(service.Spec.Type),
		ClusterIP:  service.Spec.ClusterIP,
		ExternalIP: externalIP,
		Ports:      ports,
		Selector:   len(service.Spec.Selector) > 0,
		Age:        humanAge(service.CreationTimestamp.Time, now),
	}
}

func buildIngressInventory(ingress *networkingv1.Ingress, now time.Time) model.IngressInventory {
	hosts := make([]string, 0, len(ingress.Spec.Rules))
	paths := []string{}
	targets := []string{}
	for _, rule := range ingress.Spec.Rules {
		if rule.Host != "" {
			hosts = append(hosts, rule.Host)
		}
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			if path.Path != "" {
				paths = append(paths, path.Path)
			}
			if path.Backend.Service != nil {
				targets = append(targets, fmt.Sprintf("%s:%d", path.Backend.Service.Name, path.Backend.Service.Port.Number))
			}
		}
	}

	addresses := make([]string, 0, len(ingress.Status.LoadBalancer.Ingress))
	for _, item := range ingress.Status.LoadBalancer.Ingress {
		if value := firstNonEmpty(item.IP, item.Hostname); value != "" {
			addresses = append(addresses, value)
		}
	}

	className := ""
	if ingress.Spec.IngressClassName != nil {
		className = *ingress.Spec.IngressClassName
	}

	return model.IngressInventory{
		Name:       ingress.Name,
		ClassName:  className,
		Hosts:      dedupeAndSort(hosts),
		Paths:      dedupeAndSort(paths),
		Targets:    dedupeAndSort(targets),
		Address:    firstJoined(addresses),
		TLSEnabled: len(ingress.Spec.TLS) > 0,
		Age:        humanAge(ingress.CreationTimestamp.Time, now),
	}
}

func buildConfigMapInventory(configMap *corev1.ConfigMap, now time.Time) model.ConfigMapInventory {
	return model.ConfigMapInventory{
		Name:       configMap.Name,
		DataKeys:   len(configMap.Data),
		BinaryKeys: len(configMap.BinaryData),
		Age:        humanAge(configMap.CreationTimestamp.Time, now),
	}
}

func buildSecretInventory(secret *corev1.Secret, now time.Time) model.SecretInventory {
	return model.SecretInventory{
		Name:     secret.Name,
		Type:     string(secret.Type),
		DataKeys: len(secret.Data),
		Age:      humanAge(secret.CreationTimestamp.Time, now),
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

func compareServices(a, b model.ServiceInventory) int {
	return compareStrings(a.Name, b.Name)
}

func compareIngresses(a, b model.IngressInventory) int {
	return compareStrings(a.Name, b.Name)
}

func compareConfigMaps(a, b model.ConfigMapInventory) int {
	return compareStrings(a.Name, b.Name)
}

func compareSecrets(a, b model.SecretInventory) int {
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

func allowNamespace(namespaces []string, value string) bool {
	return len(namespaces) == 0 || containsNamespace(namespaces, value)
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

func dedupeAndSort(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}

	slices.Sort(values)
	return slices.Compact(values)
}

func firstJoined(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
