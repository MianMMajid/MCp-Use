# Backend A: Platform / Infra

Owner: Backend/platform engineer.

Scope:
- Kubernetes manifests
- OpenClaw hosting and network topology
- Firewall ingress/egress policies
- Secrets and deployment environments

Scaffold folders:
- `k8s/`
- `openclaw/`
- `network-policy/`
- `deploy/`

Current status:
- `k8s/` includes local kind manifests and kustomize config for multi-workload laptop debugging.

Helper scripts:
- `scripts/k8s-local-up.sh`
- `scripts/k8s-local-dev.sh`
- `scripts/k8s-local-all.sh`
- `scripts/k8s-local-port-forward.sh`
- `scripts/k8s-local-status.sh`
- `scripts/k8s-local-down.sh`
