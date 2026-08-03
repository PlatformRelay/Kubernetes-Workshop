# Clean-environment lab validation matrix

A single, tracked table mapping **every** lab (`labs/day-{1,2,3}/NN-*.md`) to the
environment(s) it supports, the cluster-wide add-ons it needs, the tool/image versions it
pins, and its **honest current validation state**. It is the human-readable counterpart to
the future automated nightly lab smoke (**US-ENV-4**) and doubles as rehearsal tracking for
the manual clean-environment rehearsal (**US-BETA-6**). It exists *before* the automation
lands so there is a documented validation procedure and a live tracker of what still owes a
rehearsal.

Source of truth for this matrix: the labs themselves, [`infra/versions.env`](../infra/versions.env)
(the canonical pin file, ADR 0007), [`docs/syllabus.md`](./syllabus.md) (section map), and
[`docs/facilitator-guide.md`](./facilitator-guide.md) (add-on pre-install checklist). Nothing
here is invented — every version/URL is cited from the repo as it ships today.

## How to read this matrix

- **Environment** uses the labs' own badge grammar (see
  [`labs/README.md`](../labs/README.md#your-environment)): `namespace ✓ / kind ✓` (runs in
  both), `kind ✓ / namespace: read-only` (full path needs cluster-admin; a read-only
  namespace alternative ships), `kind-only` (no shared-cluster path), and
  `local — no cluster` (container labs, no Kubernetes).
- **Add-ons** are the cluster-wide prerequisites a lab installs (on kind) or that a
  facilitator pre-installs (on a shared cluster). "None" means the lab runs in a plain
  namespace with only the default StorageClass where noted.
- **Pinned versions / URLs** lists the reproducibility-critical pins the lab references.
  Where a lab pulls a **floating** reference (`…/latest/…`, a `stable` branch, or an
  unversioned `helm install`), that is recorded honestly as *unpinned* — it is a finding,
  not a blank.

### Validation-state legend

| State | Meaning |
| --- | --- |
| `server-dry-run` | The lab's apply-able manifests are documented as **server-dry-run-clean** against a live cluster per the repo's status notes (roadmap M4/M5 progress + AR-05). **Not** re-verified in a clean rehearsal here, and **no** add-on install or behaviour/timing was executed. |
| `kind-smoke` | Reserved for the future automated nightly smoke (**US-ENV-4**): the lab ran end-to-end on a clean kind cluster. **No lab is in this state yet.** |
| `unrun` | No dry-run applies (local/read-only labs with no apply step), **or** the apply-able part exists but the cluster-wide add-on install / full behaviour has not been executed end-to-end in a clean environment. |
| `deferred` | The section is not schedulable because its paired slides and lab have not met the authoring contract. |

> **Honesty rule (US-BETA-3 / AR-05).** No lab is marked `validated`, and none is
> `kind-smoke`. Builds and dry-runs prove **syntax**, not behaviour. Per roadmap
> [M7 rehearsal debt](./facilitator-guide.md#rehearsal-debt-read-before-you-teach),
> the workshop has **not** had a full clean-environment rehearsal: the `kind` add-on
> installs, controller/CRD timings, and the verbatim `describe`/error strings in spoilers
> have **not** been run end-to-end. Timings and behaviour are **not** claimed here until
> rehearsed under US-BETA-6. Authored labs are therefore `server-dry-run` or `unrun`;
> the unauthored S24 stub is `deferred`, which
> reconciles with M7.

**Traceability (N1).** Every row's validation-state assignment is auditable against a
named source: `server-dry-run` rows trace to the roadmap M4/M5 per-section progress notes
(which record the exact cluster version each manifest was dry-run against) plus AR-05;
`unrun` and `kind-smoke` rows trace to the honesty rule above.

## Participant host validation

Host support is a separate claim from manifest or lab validation.
`contract-tested` means scripted detection/message tests passed with stubs;
`live-smoke` means the recorded real-host checklist passed. Only `live-smoke`
permits an official support claim.

| Host path | Automated coverage | Live validation procedure | State |
| --- | --- | --- | --- |
| macOS / Linux + supported engine | Bootstrap and doctor Bats suites | Fresh-host `./workshop up` and `./workshop doctor` | `unrun` |
| Windows 11 23H2+ + WSL 2.1.5+ + Ubuntu 24.04 + Docker Desktop 4.44+ | WSL1/WSL2 kernel distinction, native-shell rejection, missing-engine guidance, `/mnt/c`, sourced-helper CRLF, executable-bit, and normal-Linux non-regression tests | [WSL2 acceptance checklist](./windows-wsl2.md#reproducible-validation-checklist): Lab 00, networking, storage, one add-on, cleanup | `contract-tested` / `live-smoke pending` — **PARTIAL**, no official support claim |
| Managed device + assigned cloud namespace | Documentation contract only | Facilitator-issued kubeconfig, namespace-path rehearsal without Docker/kind | `unrun` |

Native PowerShell and WSL1 are explicitly unsupported. Browser-only
participation remains future work (US-ENV-6), not a validated environment.

## Canonical version pins (`infra/versions.env`)

These are the only versions the repo pins centrally (ADR 0007). Every cluster lab runs
against this Kubernetes release; the add-on versions further down are pinned **inline in the
labs**, not here.

| Key | Value |
| --- | --- |
| `KIND_VERSION` | `v0.32.0` |
| `KIND_NODE_IMAGE` | `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5` (Kubernetes v1.36.1) |
| `KUBECTL_VERSION` | `v1.36.1` |
| `WORKSHOP_SMOKE_IMAGE` | `registry.k8s.io/e2e-test-images/agnhost:2.66.0@sha256:e518c9d629672720031c601b9aaa83e218ecf5821aff5cc16ac972e109096540` |

## The matrix

| Lab | Section | Environment | Add-ons | Pinned versions / URLs | State |
| --- | --- | --- | --- | --- | --- |
| [`day-1/00-setup.md`](../labs/day-1/00-setup.md) | S00 Welcome & setup | namespace ✓ / kind ✓ | None | kind/kubectl per `versions.env` | `unrun` |
| [`day-1/01-containers.md`](../labs/day-1/01-containers.md) | S01 Containers | local — no cluster | None | local `demo:1` build from `golang:1.24` / `alpine:3.20` | `unrun` |
| [`day-1/02-container-security.md`](../labs/day-1/02-container-security.md) | S02 Container security | local — no cluster | None (scanner on laptop: Trivy; optional cosign) | Trivy / cosign (laptop tools, unpinned) | `unrun` |
| [`day-1/03-cluster-tour.md`](../labs/day-1/03-cluster-tour.md) | S03 Mental model | namespace ✓ (read-only alt) / kind ✓ | None | none (read-only tour) | `unrun` |
| [`day-1/04-kubectl.md`](../labs/day-1/04-kubectl.md) | S04 kubectl | namespace ✓ / kind ✓ | None | none (generates YAML, never applies) | `unrun` |
| [`day-1/05-pod.md`](../labs/day-1/05-pod.md) | S05 Pod *(red line 1/5)* | namespace ✓ / kind ✓ | None | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (debug/stretch) | `unrun` |
| [`day-1/06-deployment.md`](../labs/day-1/06-deployment.md) | S06 Deployment *(red line 2/5)* | namespace ✓ / kind ✓ | None | images `ghcr.io/platformrelay/workshop-web:v1` / `:v2` (`:v9.99-nope` for the stall) | `unrun` |
| [`day-1/07-service.md`](../labs/day-1/07-service.md) | S07 Service *(red line 3/5)* | namespace ✓ / kind ✓ | None | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.36` (DNS client) | `unrun` |
| [`day-1/08-ingress.md`](../labs/day-1/08-ingress.md) | S08 Ingress *(red line 4/5)* | namespace ✓ / kind ✓ *(controller required; install step kind-only)* | **Ingress controller (Contour)** | Contour [`contour.yaml` v1.33.5](https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml); image `ghcr.io/platformrelay/workshop-web:v1` — **defect D1 resolved-by-US-NGX** | `unrun` |
| [`day-2/09-gateway-api.md`](../labs/day-2/09-gateway-api.md) | S09 Gateway API *(red line 5/5)* | namespace ✓ / kind ✓ *(CRDs + controller required; install kind-only)* | **Gateway API standard CRDs + Envoy Gateway** | Gateway API [`standard-install.yaml` v1.5.1](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml); Envoy Gateway [`install.yaml` v1.8.2](https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml) (GatewayClass `eg`); image `ghcr.io/platformrelay/workshop-web:v1` | `unrun` |
| [`day-2/10-config.md`](../labs/day-2/10-config.md) | S10 ConfigMap & Secret | namespace ✓ / kind ✓ | None | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox/fetch) | `unrun` |
| [`day-2/11-storage.md`](../labs/day-2/11-storage.md) | S11 Storage | namespace ✓ / kind ✓ *(default StorageClass assumed)* | None (default StorageClass) | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox) | `unrun` |
| [`day-2/12-statefulset.md`](../labs/day-2/12-statefulset.md) | S12 StatefulSet | namespace ✓ / kind ✓ *(default StorageClass assumed)* | None (default StorageClass) | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox) — re-dry-run owed after US-NGX | `server-dry-run` |
| [`day-2/13-resources.md`](../labs/day-2/13-resources.md) | S13 Resources & limits | namespace ✓ / kind ✓ *(ResourceQuota/LimitRange in own NS)* | None | image `polinux/stress` (OOM demo) | `server-dry-run` |
| [`day-2/14-probes.md`](../labs/day-2/14-probes.md) | S14 Health probes | namespace ✓ / kind ✓ | None | images `ghcr.io/platformrelay/workshop-web:v1` (native `/ready`+`/healthz`+`POST /fail` probes), `curlimages/curl`, `busybox:1.37` (slow starter) | `unrun` |
| [`day-2/15-jobs.md`](../labs/day-2/15-jobs.md) | S15 Jobs & CronJobs | namespace ✓ / kind ✓ | None | busybox-class images (Job payloads) | `server-dry-run` |
| [`day-2/16-hpa.md`](../labs/day-2/16-hpa.md) | S16 Autoscaling (HPA) | kind ✓ (installs metrics-server) / namespace: read-only alt | **metrics-server** (+ kind `--kubelet-insecure-tls` patch) | metrics-server [`components.yaml` — **unpinned (`/latest/`)**](https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml); image `registry.k8s.io/hpa-example` (unpinned tag) — **see defect D2** | `unrun` |
| [`day-3/17-pod-security.md`](../labs/day-3/17-pod-security.md) | S17 Pod security | namespace ✓ / kind ✓ *(`restricted` label pre-applied on NS path)* | None (PSA is built into the API server) | images `ghcr.io/platformrelay/workshop-web:v1` (restricted-clean), `busybox:1.37` (writer break) | `unrun` |
| [`day-3/18-networkpolicy.md`](../labs/day-3/18-networkpolicy.md) | S18 NetworkPolicy | kind ✓ (enforcement self-test) / namespace: read-only | **Policy-capable CNI** (kindnet enforces; **Calico fallback**) | Calico [`calico.yaml` v3.28.2](https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml) (fallback only); images `curlimages/curl`, `ghcr.io/platformrelay/workshop-web:v1` | `unrun` |
| [`day-3/19-rbac.md`](../labs/day-3/19-rbac.md) | S19 RBAC | namespace ✓ / kind ✓ | None | image `ghcr.io/platformrelay/workshop-web:v1` (reader-target workload) | `unrun` |
| [`day-3/20-helm.md`](../labs/day-3/20-helm.md) | S20 Helm | namespace ✓ / kind ✓ | None (Helm CLI v3.8+ on laptop) | Helm CLI ≥ v3.8 (laptop tool); chart renders the Day-1 `web` app | `server-dry-run` |
| [`day-3/21-gitops.md`](../labs/day-3/21-gitops.md) | S21 GitOps (Argo CD) | kind ✓ (installs Argo CD) / shared NS: read-only | **Argo CD** | Argo CD [`install.yaml` — **unpinned (`stable` branch)**](https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml); app repo [`argoproj/argocd-example-apps` guestbook](https://github.com/argoproj/argocd-example-apps.git) — **see defect D3** | `unrun` |
| [`day-3/22-operator-concept.md`](../labs/day-3/22-operator-concept.md) | S22 Operator pattern | kind ✓ (self-install) / namespace: read-only | **cert-manager** | cert-manager [`cert-manager.yaml` v1.21.0](https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml); images `quay.io/jetstack/*` | `unrun` |
| [`day-3/23-prometheus.md`](../labs/day-3/23-prometheus.md) | S23 Prometheus Operator | kind ✓ (self-install stack) / namespace: read-only | **kube-prometheus-stack** (Prometheus Operator + Prometheus + Grafana) | [`prometheus-community` Helm repo](https://prometheus-community.github.io/helm-charts); **chart version unpinned** (`helm install`, no `--version`); app image `quay.io/brancz/prometheus-example-app:v0.6.0` — **see defect D4** | `unrun` |
| [`day-3/24-kubebuilder.md`](../labs/day-3/24-kubebuilder.md) | S24 Operator dev (kubebuilder) † | kind-only · advanced | **kubebuilder toolchain** (Go + kubebuilder) — *aspirational* | none pinned (**deferred stub**, unauthored) | `deferred` |
| [`day-3/25-pod-escape.md`](../labs/day-3/25-pod-escape.md) | S25 Security & pod escape | **kind-only · strictly defensive** (no shared path) | **None** — throwaway kind cluster + `context-check.sh` guard | none pinned (uses in-cluster tools) | `unrun` |
| [`day-3/26-capstone.md`](../labs/day-3/26-capstone.md) | S26 Best practices (capstone) | namespace ✓ / kind ✓ | None | image pinned by digest (checklist fix); reuses `web` manifests | `unrun` |

† **S24 is a deferred stub** (roadmap: milestone-gated, needs a Go + kubebuilder toolchain).
It reserves the lab ID and is not schedulable as a hands-on lab yet.

## Add-on-heavy labs: canonical kind install + expected failure/diagnostic beat

The seven add-on-heavy labs named in US-BETA-3 (**S08, S09, S16, S18, S21, S23, S25**) each
list the canonical kind add-on install and the break→fix / diagnostic beat that seeds the
rehearsal. **S22 (cert-manager)** is included too — it is equally add-on-heavy and follows the
same shape.

| Lab | Canonical kind add-on install | Expected failure / diagnostic beat |
| --- | --- | --- |
| **S08** Ingress | `kubectl apply -f` the Contour **v1.33.5** pinned quickstart (`…/projectcontour/contour/v1.33.5/examples/render/contour.yaml`); kind needs the ingress-ready 80/443 port maps the repo cluster config already has. | An `Ingress` with **no controller** does nothing — routing only works once the controller Pods are `Running`; a wrong `Host`/path returns 404 from the controller (proving it, not the app, routes). |
| **S09** Gateway API | `kubectl apply -f` Gateway API `standard-install.yaml` **v1.5.1**, then Envoy Gateway `install.yaml` **v1.8.2** (provides the `eg` GatewayClass). | Break `gatewayClassName` → read `status.conditions`: `Accepted` flips **False** (no controller owns that class). Add a header match to prove role-separated routing. |
| **S16** Autoscaling (HPA) | `kubectl apply -f` metrics-server `components.yaml` **+ kind `--kubelet-insecure-tls` patch** (kind's kubelet serves a self-signed cert). | Remove the Pod's `requests.cpu` → HPA `TARGETS` goes **`<unknown>`** and replicas freeze. Distinguish this from **metrics-server-down** (also `<unknown>`, different root cause). |
| **S18** NetworkPolicy | On kind, current **kindnet** enforces (kube-network-policies); **Step 2 is an enforcement self-test** with a **Calico v3.28.2 fallback** if the CNI doesn't enforce. | A `default-deny` ingress makes traffic **hang and time out** (`curl` exit **28**), *not* "connection refused" — and DNS/egress stay up (exit 28 ≠ exit 6), proving ingress-only scope. |
| **S21** GitOps (Argo CD) | `kubectl create namespace argocd` then `kubectl apply -n argocd --server-side -f` Argo CD `stable` `install.yaml`; apply the public `guestbook` `Application`. | Hand-scale a managed resource (drift) → Argo CD **self-heals** it back to Git. Set `selfHeal: false` → the app stays **OutOfSync**, proving detection ≠ correction. |
| **S22** Operator pattern | `kubectl apply -f` cert-manager `cert-manager.yaml` **v1.21.0** (CRDs + controller + webhook). | Declare a `Certificate` → controller reconciles it into a `Secret`; **delete that Secret** → the controller **puts it back** (the reconcile loop over a CRD it invented). |
| **S23** Prometheus Operator | `helm repo add prometheus-community …` then `helm install monitoring prometheus-community/kube-prometheus-stack` into a `monitoring` namespace. | Break the `ServiceMonitor` with a **mismatched label selector** → the target never appears on Prometheus `/targets`; fix the selector → target goes **UP**; finish with one PromQL query. |
| **S25** Security & pod escape | **No cluster add-on.** Canonical path = a throwaway **kind** cluster the learner owns; every offensive step is gated by **`context-check.sh`** (exits non-zero unless the context is `kind-…`). | A privileged/hostPath Pod performs a single **benign read** (`cat /host/etc/os-release`) to prove host filesystem access — the "escape" — then the lab hardens the Pod so the same read fails. |

## Defect rows (pinned URL / version spot-check)

Best-effort spot-check of the pinned URLs/versions each lab references, done at authoring
time of this matrix (2026-07-13) with a fetch of each source. A broken or **archived/retired**
source is recorded here as a defect, **not** silently passed.

| ID | Lab | Reference | Finding | Recommended action |
| --- | --- | --- | --- | --- |
| **D1** | S08 Ingress | ingress-nginx `controller-v1.11.2` kind deploy manifest + the `kubernetes/ingress-nginx` repo | **Source repo archived (read-only) on 2026-03-24 and retiring** — best-effort maintenance ended, no further releases/bugfixes/security fixes; upstream advises new users adopt a Gateway API implementation instead. The pinned raw manifest URL still returned HTTP 200 at spot-check, but the lab depended on a **retired, unmaintained** source. | **Resolved-by-US-NGX** (roadmap M8 / AR-02): S08 now installs **Contour v1.33.5** and teaches the ingress-nginx retirement as a history beat; the demo image moved to `workshop-web`. Row kept for history. |
| **D2** | S16 HPA | metrics-server `.../releases/latest/download/components.yaml` | **Not pinned** — resolves to whatever the *latest* metrics-server release is at fetch time. URL is live and non-archived, but reproducibility is not guaranteed (a future release could change behaviour/flags). | Pin metrics-server to a specific release tag (and ideally add it to `infra/versions.env`) before rehearsal (US-BETA-6). |
| **D3** | S21 GitOps | Argo CD `.../argo-cd/stable/manifests/install.yaml` | **Not pinned** — the `stable` branch floats. URL is live and non-archived, but the installed Argo CD version is whatever `stable` points at on the day. | Pin Argo CD to a release tag before rehearsal; record the tag in the matrix. |
| **D4** | S23 Prometheus | `kube-prometheus-stack` via `helm install` with no `--version` | **Chart version not pinned** — `helm install` takes the newest chart in the repo index. Repo URL is live and non-archived. | Pin the chart version (`--version`) before rehearsal so the operator/Prometheus versions are reproducible. |

**Verified live and non-archived** at the original spot-check (no defect): cert-manager
v1.21.0, Calico v3.28.2, and the `prometheus-community` Helm repo. The
`ghcr.io/platformrelay/workshop-web:v1` (multi-arch; `:v2`/`:v3` siblings) /
`quay.io/brancz/prometheus-example-app:v0.6.0` / `quay.io/jetstack/*` images are the versions
the labs ship; registry availability was not exhaustively pulled here. The post-US-NGX pins
(Contour v1.33.5, Gateway API v1.5.1, Envoy Gateway v1.8.2) enter the rehearsal scope below.

## A note on the controller changes (US-NGX) — landed

US-BETA-3 lists the required add-ons as *"Ingress-**Contour**, Gateway/**Envoy**, …"*. That
target has **landed** (roadmap M8 / **US-NGX**): S08 installs **Contour v1.33.5** (teaching
the ingress-nginx retirement as history), S09 installs **Gateway API v1.5.1 + Envoy Gateway
v1.8.2** (GatewayClass `eg`), and every demo web image is the purpose-built
`ghcr.io/platformrelay/workshop-web` (`:v1`/`:v2`/`:v3`, port **8080**, non-root, distroless,
PSA `restricted`-clean, with native `/healthz`, `/ready`, `POST /fail|/recover` probe
endpoints). The S08/S09 rows above reflect the new stack; defect **D1** is retained as
resolved history. All rows stay `unrun`/`server-dry-run` until the US-BETA-6 rehearsal /
US-ENV-4 smoke re-runs them against the new stack.

## What this matrix feeds

- **US-ENV-4** — the CI test infra whose **nightly chainsaw lab smoke** will move labs from
  `unrun` / `server-dry-run` to `kind-smoke` automatically (Days 1–2 first).
- **US-BETA-6** — the manual full clean-environment rehearsal that measures real timings and
  behaviour. This matrix is its checklist; filling the `kind-smoke`/rehearsed states is that
  human rehearsal pass, not a code lane.
