# ClusterWatch Local

ClusterWatch Local is a didactic reference implementation for monitoring multiple AWS EKS tenants from a single local dashboard.

## Architecture

- `backend`: Go HTTP server that loads one kubeconfig, creates one Kubernetes client per configured tenant, watches cluster resources through shared informers, and pushes live snapshots over WebSockets.
- `frontend`: React + TypeScript dashboard that renders tenant health, resource counts, and a live event feed.
- `config.example.yaml`: optional override file for server settings, kubeconfig path, or an explicit tenant list.

## Single kubeconfig + multiple AWS profiles

The cleanest integration is to keep a single `~/.kube/config` and define one context per EKS cluster. Each context should already work with `kubectl`, ideally through the standard `aws eks get-token` exec flow.

This backend now treats kubeconfig as the only source of tenant metadata:

- each tenant is a kubeconfig context ID
- if `tenants` is empty, the app loads every context from kubeconfig
- `AWS_PROFILE` is discovered from the context's exec auth environment when present

That keeps the app config minimal while preserving support for cross-account EKS access through normal kubeconfig exec auth.

## Recommended kubeconfig pattern

Example kubeconfig user entry:

```yaml
users:
  - name: sandbox-admin
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: aws
        args:
          - eks
          - get-token
          - --cluster-name
          - sandbox-core
          - --region
          - eu-west-1
        env:
          - name: AWS_PROFILE
            value: sandbox-admin
          - name: AWS_SDK_LOAD_CONFIG
            value: "1"
```

If your kubeconfig does not pin `AWS_PROFILE`, the dashboard will still connect as long as the exec auth flow already works for that context in `kubectl`.

## Backend flow

1. Load application config and kubeconfig.
2. Resolve the monitored tenant list from kubeconfig contexts.
3. For each tenant, create a Kubernetes client and shared informer factory.
4. Maintain an in-memory snapshot and publish snapshot updates to all connected WebSocket clients.

## Frontend flow

1. Fetch `/api/v1/tenants`.
2. Fetch `/api/v1/snapshots`.
3. Open a WebSocket to `/ws`.
4. Merge incoming snapshot events into local state and render updates immediately.

## Local development

Backend:

```powershell
go run .\cmd\server
```

By default the app starts without any config file, listens on `localhost:42069`, uses `~/.kube/config`, and monitors all kubeconfig contexts. Set `CLUSTERWATCH_CONFIG` only if you want to override that behavior.

Frontend:

```powershell
cd .\frontend
npm install
npm run dev
```

Single-file release-style build:

```powershell
cd C:\Localgit\clusterwatch-local\frontend
npm install
npm run build

cd C:\Localgit\clusterwatch-local
go build -tags release -o .\build\clusterwatch-local.exe .\cmd\server
```

The `release` build embeds the React dashboard into the executable, so `clusterwatch-local.exe` can run without a sibling `frontend\dist` directory.

Run the self-contained executable locally:

```powershell
.\build\clusterwatch-local.exe
```

Optional custom config:

```powershell
$env:CLUSTERWATCH_CONFIG="C:\Localgit\clusterwatch-local\config.example.yaml"
.\build\clusterwatch-local.exe
```

## Notes

- This repository is intentionally small and explicit so it can be used as a teaching example.
- The code favors standard library HTTP and clear boundaries over framework-heavy abstractions.
- Validation completed in this environment with `go test ./...` and `npm run build`.

## GitHub Actions release flow

The repository now includes a workflow at `.github/workflows/build-release.yml` that matches the app's deployment shape:

- every pull request and push to `main` runs `npm ci`, `npm run build`, and `go test ./...`
- tag pushes such as `v0.1.0` also build release archives for Windows and Linux
- each release archive contains the self-contained server binary, `config.example.yaml`, and `README.md`

Release builds compile the Go server with `-tags release`, which embeds `frontend/dist` into the executable. Regular local development still serves the frontend from disk so `npm run dev` and iterative frontend work remain unchanged.

## Windows executable signing

Yes. The practical option is Authenticode signing during the Windows release job:

- store a Base64-encoded `.pfx` certificate in the `WINDOWS_CERTIFICATE_PFX_BASE64` secret
- store its password in `WINDOWS_CERTIFICATE_PASSWORD`
- optionally set `WINDOWS_SIGNTOOL_TIMESTAMP_URL`

The workflow will sign `clusterwatch-local.exe` when those secrets are present.

Important limits:

- this works well with a standard OV code-signing certificate exported as `.pfx`
- EV certificates often require a hardware token or cloud signing service, so they usually need a self-hosted runner or a provider such as Azure Trusted Signing rather than a plain GitHub secret
