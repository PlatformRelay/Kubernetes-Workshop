# US-GITOPS-CHOICE-C Flux lab live kind smoke receipt

- **When (UTC):** 2026-08-05T23:14:40Z → 2026-08-05T23:16:10Z (successful end-to-end pass)
- **Host:** macOS + Colima (Docker 29.x; `kind` + `kubectl` local)
- **Architecture:** `aarch64` (Apple Virtualization.Framework)
- **Lab:** [`labs/day-3/21-gitops-flux.md`](../../labs/day-3/21-gitops-flux.md)
- **Cluster:** throwaway `kind` cluster `gitops` (`kindest/node:v1.36.1`); **destroyed after**
- **Flux:** `kubectl apply --server-side` of
  `https://github.com/fluxcd/flux2/releases/latest/download/install.yaml`
  (resolved to **v2.9.3** at fetch time); optional image-* / source-watcher scaled to 0
- **App source:** `https://github.com/argoproj/argocd-example-apps.git` path `./guestbook`
  (revision observed: `master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5`)
- **Result:** **passed**

## Beats exercised

| Beat | Result |
| --- | --- |
| Install Flux (dev install) + wait named controllers | pass |
| `GitRepository` + `Kustomization` dry-run + apply → Ready=True | pass (~5s) |
| Guestbook `deploy/svc` land in `default` | pass |
| Hand-scale to 5 → reconcile back to 1 | pass (~30s) |
| `spec.suspend: true` → scale to 5 **stays** | pass (45s observe) |
| `spec.suspend: false` → back to 1 | pass (~5s) |
| Delete Kustomization → prune removes guestbook | pass |

## Honesty

Maintainer-recorded disposable-cluster run for the Flux lab variant. Promotes the
`day-3/21-gitops-flux.md` matrix row to `kind-smoke`. Does **not** claim pedagogical
room timing (US-BETA-6). Sibling Argo CD lab row remains unchanged.
