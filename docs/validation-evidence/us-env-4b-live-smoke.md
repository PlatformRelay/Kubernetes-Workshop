# US-ENV-4B live disposable-cluster smoke receipt (Day-2 / Day-3 drivers)

- **When (UTC):** 2026-08-04T19:06:23Z (day-2) · 2026-08-04T19:20:26Z (day-3)
- **Host:** macOS arm64, Colima + Docker (`kind-workshop` context — **not** GKE)
- **Architecture:** `arm64`
- **Commands:** `infra/lab-smoke.sh schedule-day2` then `infra/lab-smoke.sh schedule-day3`
  (no `LAB_SMOKE_SKIP_*`; full bootstrap → doctor → idempotence → profile → labs → teardown)
- **Result:** **passed** (exit 0) on both shards
- **Cluster:** created, used, and **destroyed** (`./workshop down --yes`); no leftover
  `workshop` kind cluster
- **Kubernetes pin:** `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5`

## Commits exercised

| Shard | Commit | Profile |
| --- | --- | --- |
| `schedule-day2` | `69c3cfef0319b4ce75ef1a70614cc59dcdcb6394` | `day-2` (gateway-envoy + metrics-server) |
| `schedule-day3` | `452e3b5a9eb1b7caf8b72899c85b2e03ae7adfe8` (lane tip) | `day-3` (argocd + cert-manager + kube-prometheus) |

Day-2 receipt predates the final day-3 teardown-wait commits; day-2 driver code was
unchanged in those commits.

## Coverage

**Day-2** (asserted drivers): `09-gateway-api` … `16-hpa` — Gateway API via Envoy
(port-forward + `ResolvedRefs` + curl), ConfigMap, storage, StatefulSet, resources,
probes, Jobs, HPA.

**Day-3** (asserted drivers): `17-pod-security`, `18-networkpolicy` (deny + allow HTTP
200), `19-rbac`, `20-helm`, `21-gitops`, `22-operator-concept`, `23-prometheus`,
`25-pod-escape`, `26-capstone`. Lab `24-kubebuilder` remains scaffold-only by design.

## Wall-clock timings (measured)

### schedule-day2 — 672s total

| Phase | Seconds |
| --- | --- |
| bootstrap | 32 |
| doctor | 3 |
| idempotence bootstrap | 3 |
| profile day-2 | 48 |
| lab day-2/09-gateway-api | 22 |
| lab day-2/10-config | 6 |
| lab day-2/11-storage | 67 |
| lab day-2/12-statefulset | 77 |
| lab day-2/13-resources | 8 |
| lab day-2/14-probes | 7 |
| lab day-2/15-jobs | 9 |
| lab day-2/16-hpa | 390 |
| teardown | (included in wall-clock) |

### schedule-day3 — 374s total

| Phase | Seconds |
| --- | --- |
| bootstrap | 36 |
| doctor | 5 |
| idempotence bootstrap | 7 |
| profile day-3 | 140 |
| lab day-3/17-pod-security | 2 |
| lab day-3/18-networkpolicy | 85 |
| lab day-3/19-rbac | 7 |
| lab day-3/20-helm | 8 |
| lab day-3/21-gitops | 28 |
| lab day-3/22-operator-concept | 3 |
| lab day-3/23-prometheus | 48 |
| lab day-3/25-pod-escape | 2 |
| lab day-3/26-capstone | 1 |
| teardown | (included in wall-clock) |

Raw automation summaries: `/tmp/lab-smoke-live-r2/summary-schedule-day{2,3}.md` on the
host that ran the smoke.

## Honesty

This receipt documents **real** disposable-cluster automation with per-lab drivers —
not scaffold stubs and not runs with `LAB_SMOKE_SKIP_*` set. It does **not** change any
row in [`docs/validation-matrix.md`](../validation-matrix.md) to `kind-smoke` and does
**not** claim pedagogical validation (US-BETA-6).
