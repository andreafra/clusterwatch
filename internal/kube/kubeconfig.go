package kube

import (
	"fmt"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func buildRESTConfig(kubeconfigPath string, tenant Tenant) (*rest.Config, error) {
	rawConfig, err := loadRawConfig(kubeconfigPath)
	if err != nil {
		return nil, err
	}

	contextEntry, ok := rawConfig.Contexts[tenant.Context]
	if !ok {
		return nil, fmt.Errorf("context %q not found in kubeconfig", tenant.Context)
	}

	if tenant.AWSProfile != "" {
		authInfo, ok := rawConfig.AuthInfos[contextEntry.AuthInfo]
		if !ok {
			return nil, fmt.Errorf("authinfo %q not found in kubeconfig", contextEntry.AuthInfo)
		}
		authInfo.Exec = ensureExecEnv(authInfo.Exec, tenant.AWSProfile)
		rawConfig.AuthInfos[contextEntry.AuthInfo] = authInfo
	}

	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: tenant.Context,
	}

	clientConfig := clientcmd.NewDefaultClientConfig(*rawConfig, overrides)
	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build client config: %w", err)
	}

	restConfig.UserAgent = "clusterwatch-local/0.1"
	return restConfig, nil
}

func ensureExecEnv(exec *clientcmdapi.ExecConfig, awsProfile string) *clientcmdapi.ExecConfig {
	if exec == nil {
		return nil
	}

	cloned := exec.DeepCopy()
	foundProfile := false
	foundLoadConfig := false

	for i := range cloned.Env {
		switch cloned.Env[i].Name {
		case "AWS_PROFILE":
			cloned.Env[i].Value = awsProfile
			foundProfile = true
		case "AWS_SDK_LOAD_CONFIG":
			cloned.Env[i].Value = "1"
			foundLoadConfig = true
		}
	}

	if !foundProfile {
		cloned.Env = append(cloned.Env, clientcmdapi.ExecEnvVar{
			Name:  "AWS_PROFILE",
			Value: awsProfile,
		})
	}
	if !foundLoadConfig {
		cloned.Env = append(cloned.Env, clientcmdapi.ExecEnvVar{
			Name:  "AWS_SDK_LOAD_CONFIG",
			Value: "1",
		})
	}

	return cloned
}
