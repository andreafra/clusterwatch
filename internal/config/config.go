package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig `yaml:"server"`
	Kubeconfig string       `yaml:"kubeconfig"`
	Tenants    []string     `yaml:"tenants"`
}

type ServerConfig struct {
	Address       string `yaml:"address"`
	AllowedOrigin string `yaml:"allowedOrigin"`
}

func Load(path string) (Config, error) {
	cfg := defaultConfig()
	if path == "" {
		return cfg, nil
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read %s: %w", path, err)
	}

	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse %s: %w", path, err)
	}

	return normalizeConfig(cfg), nil
}

func defaultConfig() Config {
	return normalizeConfig(Config{})
}

func normalizeConfig(cfg Config) Config {
	if cfg.Server.Address == "" {
		cfg.Server.Address = "localhost:42069"
	}
	if cfg.Server.AllowedOrigin == "" {
		cfg.Server.AllowedOrigin = "http://localhost:5173"
	}
	if cfg.Kubeconfig == "" {
		cfg.Kubeconfig = filepath.Join(homeDir(), ".kube", "config")
	}
	cfg.Kubeconfig = expandHome(cfg.Kubeconfig)

	return cfg
}

func expandHome(value string) string {
	if !strings.HasPrefix(value, "~") {
		return value
	}
	trimmed := strings.TrimPrefix(value, "~")
	trimmed = strings.TrimPrefix(trimmed, "\\")
	trimmed = strings.TrimPrefix(trimmed, "/")
	return filepath.Join(homeDir(), trimmed)
}

func homeDir() string {
	if home := os.Getenv("USERPROFILE"); home != "" {
		return home
	}
	home, _ := os.UserHomeDir()
	return home
}
