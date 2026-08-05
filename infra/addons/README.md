# Workshop add-on profiles (US-GATEWAY-1 + US-ADDONS-1 + US-GITOPS-CHOICE-D)

Opt-in installers for the local kind lane. **`./workshop up` does not install
these** — pick a named profile when a lab day needs controllers.

| Profile | Composes | Labs |
| --- | --- | --- |
| `day-1` | `ingress-contour` | S08 |
| `day-2` | `gateway-envoy`, `metrics-server` | S09, S16 |
| `day-3` | `argocd` (default) **or** `flux`, plus `cert-manager`, `kube-prometheus` | S21–S23 (heavyweight) |
| `gateway-envoy` (canonical routing) | Envoy Gateway + Gateway API CRDs | S09 |
| `ingress-contour` (optional routing) | Contour | S08 |
| `quiz-live` | — | **Deferred** — US-QUIZ-1 adopted no FOSS candidate |

```bash
./workshop profile day-1          # or: make profile-day-1
./workshop profile day-2
./workshop profile day-3          # default GitOps tool: argocd
./workshop profile day-3 --gitops flux   # Flux variant (same spelling as deck --gitops)
./workshop profile check day-3    # composition + preflight, no mutate
./workshop profile status
./workshop profile day-2 --teardown
./workshop profile transition gateway-envoy   # Contour ↔ Envoy
./workshop profile transition flux            # Argo CD ↔ Flux
```

- Routing profiles remain **mutually exclusive** (US-GATEWAY-1). Day profiles that
  include a routing component reuse `routing-preflight.sh` / `*-envoy|contour.sh`
  — they do not duplicate install logic.
- GitOps tools (`argocd` / `flux`) are **mutually exclusive** (US-GITOPS-CHOICE-D).
  Preflight refuses a dual install; use `transition` for a safe switch. The day-3
  `--gitops` flag matches the deck launcher spelling (`argocd` default; `flux`
  selectable) so facilitator flags stay aligned across slides and infra.
- Each component: preflight/`check`, apply, bounded readiness wait, ownership
  marker, idempotent re-run, scoped teardown.
- Versions from `infra/versions.env`. Interactive `gum` choose is progressive
  enhancement; flags/non-TTY behave identically.
