# US-GITOPS-CHOICE-D live kind smoke receipt

- **When (UTC):** 2026-08-05T23:22:10Z → 2026-08-05T23:26:51Z
- **Host:** macOS arm64 (Colima/Docker; mise-pinned kind/kubectl)
- **Cluster:** `workshop` (created via `./workshop up`, destroyed after)
- **Pins:** `ARGOCD_VERSION=v2.14.11`, `FLUX_VERSION=v2.9.3` (`infra/versions.env`)
- **Result:** **passed** (exit 0); wall-clock ~4m 40s

## Coverage

| Step | Command / check | Result |
| --- | --- | --- |
| Install Argo (day-3 default path) | `./workshop profile day-3 --gitops argocd` | OK — detect=`argocd` |
| Refuse dual | `flux.sh install` while Argo owned | FAIL closed + transition remediation |
| Transition Argo→Flux | `./workshop profile transition flux` | OK — detect=`flux`; `argocd` ns gone |
| Refuse dual | `argocd.sh install` while Flux owned | FAIL closed + transition remediation |
| Transition Flux→Argo | `./workshop profile transition argocd` | OK — detect=`argocd` |
| Idempotent re-run | `argocd.sh install` | OK — workshop-owned / idempotent |
| Scoped teardown | `./workshop profile day-3 --gitops argocd --teardown` | OK — detect=`none` |
| Flux alone + idempotent + teardown | `flux.sh install` ×2, `uninstall` | OK — detect=`none` |

## Honesty

Real disposable-cluster run on kind. No `docker system prune`. Other kind clusters (if any) were not touched; only `workshop` was created and destroyed. This receipt does **not** promote lab rows in `docs/validation-matrix.md`.
