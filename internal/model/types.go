package model

import "time"

type TenantInfo struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Context    string   `json:"context"`
	AWSProfile string   `json:"awsProfile"`
	Namespaces []string `json:"namespaces"`
}

type ResourceCounts struct {
	Namespaces  int `json:"namespaces"`
	Nodes       int `json:"nodes"`
	Pods        int `json:"pods"`
	Deployments int `json:"deployments"`
}

type ClusterSnapshot struct {
	TenantID       string         `json:"tenantId"`
	TenantName     string         `json:"tenantName"`
	Context        string         `json:"context"`
	AWSProfile     string         `json:"awsProfile"`
	Connection     string         `json:"connection"`
	Message        string         `json:"message"`
	ResourceCounts ResourceCounts `json:"resourceCounts"`
	UpdatedAt      time.Time      `json:"updatedAt"`
}

type Event struct {
	Type      string    `json:"type"`
	TenantID  string    `json:"tenantId,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Payload   any       `json:"payload"`
}
