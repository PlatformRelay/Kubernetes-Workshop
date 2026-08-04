# Workshop add-on profiles (US-GATEWAY-1 + US-ADDONS-1)

Opt-in installers for the local kind lane. **`./workshop up` does not install
these** — pick a named profile when a lab day needs controllers.

| Profile | Composes | Labs |
| --- | --- | --- |
| `day-1` | `ingress-contour` | S08 |
| `day-2` | `gateway-envoy`, `metrics-server` | S09, S16 |
| `day-3` | `argocd`, `cert-manager`, `kube-prometheus` | S21–S23 (heavyweight) |
| `gateway-envoy` (canonical routing) | Envoy Gateway + Gateway API CRDs | S09 |
| `ingress-contour` (optional routing) | Contour | S08 |
| `quiz-live` | — | **Deferred** — US-QUIZ-1 adopted no FOSS candidate |

```bash
./workshop profile day-1          # or: make profile-day-1
./workshop profile day-2
./workshop profile check day-3    # composition + preflight, no mutate
./workshop profile status
./workshop profile day-2 --teardown
./workshop profile transition gateway-envoy   # Contour ↔ Envoy only
```

- Routing profiles remain **mutually exclusive** (US-GATEWAY-1). Day profiles that
  include a routing component reuse `routing-preflight.sh` / `*-envoy|contour.sh`
  — they do not duplicate install logic.
- Each component: preflight/`check`, apply, bounded readiness wait, ownership
  marker, idempotent re-run, scoped teardown.
- Versions from `infra/versions.env`. Interactive `gum` choose is progressive
  enhancement; flags/non-TTY behave identically.
