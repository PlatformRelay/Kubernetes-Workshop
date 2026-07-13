# Syllabus — Kubernetes Practitioner Workshop

A modern, code-heavy, vendor-neutral Kubernetes workshop. It takes a learner from
"what is a container" through "what is a cluster" to confidently authoring, running,
and operating core Kubernetes workloads. Every concept block is paired with a hands-on
lab: roughly **50% presentation, 50% practice**.

This document is the public, self-contained schedule. A facilitator should be able to
reconstruct the whole workshop from this file alone. See also:

- [`labs/README.md`](../labs/README.md) — participant entry point (how the labs work, prerequisites).
- [`docs/facilitator-guide.md`](./facilitator-guide.md) — facilitator entry point (room/environment setup, pacing).
- [`docs/decisions/`](./decisions/) — architecture decision records (why the repo is shaped this way).

## Premise & audience

The workshop is built around a **red line of core resources** and then layers container,
operational, delivery, and security topics on top of that foundation.

**Level: beginner-to-intermediate**, not pure beginner. The arc runs from container
foundations up to operators, GitOps, and pod-escape hardening.

**Assumed prerequisites** (stated up front and reinforced in the labs):

- A shell you are comfortable in, and basic Git.
- Basic YAML, basic HTTP, and basic container vocabulary.
- One of two lab environments: an **assigned namespace** on a shared cluster, **or** a
  local **kind** cluster. See [`labs/README.md`](../labs/README.md) for the exact tools.

The two container sections (S01/S02) are offered as an **on-ramp** for anyone new to
containers — they run entirely locally and need no cluster.

## The red line

The spine of the workshop is a single application taken step by step through the five
core networking/workload resources:

> **Pod → Deployment → Service → Ingress → Gateway API** (sections S05–S09)

Each resource **extends the previous manifest** rather than starting over, so learners
watch one app grow from a bare Pod into a Deployment, gain a stable Service address,
get exposed north-south via Ingress, and finally route with the Gateway API. Every
later topic (config, storage, health, security, delivery, observability) hangs off this
same running app.

## Superset vs. the canonical 3-day cut

The section map below (**S00–S27**) is a **content superset** — it deliberately contains
**more material than fits in three days**. This lets the workshop be authored richly and
**boiled down per delivery** by toggling sections on or off. Nothing is wasted: each
section is a self-contained, individually toggleable unit.

- Every section carries a **Tier** — `core`, `recommended`, or `optional` — and a
  **Suggested day** for the canonical cut.
- The **canonical 3-day cut** (see [The 3-day cut](#the-canonical-3-day-cut)) is the
  subset that must land near **~390 min/day at ~50/50 slides:lab**. The superset as a
  whole does not, by design.
- The 3-day cut = all `core` sections + selected `recommended` sections; `optional`
  sections are cut first. A facilitator composes each delivery from authored sections
  rather than cutting material live.

> **Timing note.** The per-section timings below are the primitive. The day totals in
> the canonical cut are **planning estimates that have not yet been rehearsed
> end-to-end** — confirming the cut lands near ~390 min/day at ~50/50 is explicitly a
> pre-delivery rehearsal task that is still open. Treat the totals as targets to pace
> against, not measured facts.

## Section map (S00–S27)

**Tier:** `core` (always in the cut) · `recommended` (in the cut if time allows) ·
`optional` (cut first). **Day** is the suggested grouping for the canonical 3-day cut.

| ID | Section | Tier | Day | Track |
| --- | --- | --- | --- | --- |
| S00 | Welcome & setup | core | 1 | Foundations |
| S01 | Containers | recommended | 1 | Foundations |
| S02 | Container security & supply chain | recommended | 1 | Foundations |
| S03 | Kubernetes mental model | core | 1 | Foundations |
| S04 | kubectl | core | 1 | Foundations |
| S05 | Pod *(red line 1/5)* | core | 1 | Core |
| S06 | Deployment *(red line 2/5)* | core | 1 | Core |
| S07 | Service *(red line 3/5)* | core | 1 | Core |
| S08 | Ingress *(red line 4/5)* | core | 1 | Core |
| S09 | Gateway API *(red line 5/5)* | recommended | 2 | Core |
| S10 | ConfigMap & Secret | core | 2 | Core |
| S11 | Storage (PV/PVC/StorageClass) | core | 2 | Workloads |
| S12 | StatefulSet | recommended | 2 | Workloads |
| S13 | Resources & limits | core | 2 | Workloads |
| S14 | Health probes | core | 2 | Workloads |
| S15 | Jobs & CronJobs | recommended | 2 | Workloads |
| S16 | Autoscaling (HPA) | optional | 2 | Workloads |
| S17 | Pod security (securityContext + PSS) | core | 3 | Security |
| S18 | NetworkPolicy | recommended | 3 | Security |
| S19 | RBAC | optional | 3 | Security |
| S20 | Helm | core | 3 | Delivery |
| S21 | GitOps with Argo CD | recommended | 3 | Delivery |
| S22 | The operator pattern | recommended | 3 | Operators |
| S23 | Prometheus Operator | recommended | 3 | Operators |
| S24 | Operator dev 101 (kubebuilder) | optional | 3 | Operators |
| S25 | Security & pod escape | recommended | 3 | Security |
| S26 | Best practices (capstone) | core | 3 | Wrap |
| S27 | Wrap-up & next steps | core | 3 | Wrap |

> **Suggested day** is guidance, not a hard schedule. Toggle any `recommended` /
> `optional` section off to fit a shorter room.

## Per-section outcomes, timings, and labs

Each section pairs concept slides with a standalone lab under
[`labs/day-N/`](../labs/README.md). Timing is **slides + lab**.

### Day 1 — Foundations, containers, and the core red line

| ID | Outcome | Lab | Slides | Lab time |
| --- | --- | --- | --- | --- |
| S00 | Everyone can reach their environment and run kubectl. | [`labs/day-1/00-setup.md`](../labs/day-1/00-setup.md) | 20 | 15 |
| S01 | Explain what a container image *is* and build one. | [`labs/day-1/01-containers.md`](../labs/day-1/01-containers.md) | 30 | 25 |
| S02 | Build/choose images that are small, non-root, and scanned (build-time security). | [`labs/day-1/02-container-security.md`](../labs/day-1/02-container-security.md) | 30 | 25 |
| S03 | Describe the control plane, nodes, and reconciliation. | [`labs/day-1/03-cluster-tour.md`](../labs/day-1/03-cluster-tour.md) | 30 | 20 |
| S04 | Fluent discovery, inspection, and change with kubectl. | [`labs/day-1/04-kubectl.md`](../labs/day-1/04-kubectl.md) | 25 | 25 |
| S05 | Author, inspect, and delete a Pod; know its lifecycle. | [`labs/day-1/05-pod.md`](../labs/day-1/05-pod.md) | 30 | 25 |
| S06 | Run and update a Deployment; understand ReplicaSets and rollouts. | [`labs/day-1/06-deployment.md`](../labs/day-1/06-deployment.md) | 35 | 30 |
| S07 | Give Pods a stable address; debug selector→endpoint routing. | [`labs/day-1/07-service.md`](../labs/day-1/07-service.md) | 30 | 30 |
| S08 | Expose HTTP north-south through an Ingress controller. | [`labs/day-1/08-ingress.md`](../labs/day-1/08-ingress.md) | 25 | 25 |

### Day 2 — Modern routing and running workloads well

| ID | Outcome | Lab | Slides | Lab time |
| --- | --- | --- | --- | --- |
| S09 | Route with the Gateway API and explain why it succeeds Ingress. | [`labs/day-2/09-gateway-api.md`](../labs/day-2/09-gateway-api.md) | 30 | 25 |
| S10 | Inject configuration and secrets; know the caveats. | [`labs/day-2/10-config.md`](../labs/day-2/10-config.md) | 25 | 25 |
| S11 | Attach durable storage and reason about the storage stack. | [`labs/day-2/11-storage.md`](../labs/day-2/11-storage.md) | 30 | 30 |
| S12 | Run a stateful workload with stable identity and per-Pod storage. | [`labs/day-2/12-statefulset.md`](../labs/day-2/12-statefulset.md) | 30 | 30 |
| S13 | Set requests/limits and reason about scheduling and QoS. | [`labs/day-2/13-resources.md`](../labs/day-2/13-resources.md) | 30 | 30 |
| S14 | Configure liveness, readiness, and startup probes correctly. | [`labs/day-2/14-probes.md`](../labs/day-2/14-probes.md) | 30 | 30 |
| S15 | Run batch and scheduled workloads. | [`labs/day-2/15-jobs.md`](../labs/day-2/15-jobs.md) | 20 | 20 |
| S16 | Scale a workload on demand with an HPA. | [`labs/day-2/16-hpa.md`](../labs/day-2/16-hpa.md) | 20 | 20 |

### Day 3 — Security, delivery, operators, best practices

| ID | Outcome | Lab | Slides | Lab time |
| --- | --- | --- | --- | --- |
| S17 | Harden a Pod and understand Pod Security Standards. | [`labs/day-3/17-pod-security.md`](../labs/day-3/17-pod-security.md) | 30 | 25 |
| S18 | Isolate workloads at the network layer (default-deny + explicit allows). | [`labs/day-3/18-networkpolicy.md`](../labs/day-3/18-networkpolicy.md) | 25 | 25 |
| S19 | Grant least-privilege access with RBAC. | [`labs/day-3/19-rbac.md`](../labs/day-3/19-rbac.md) | 25 | 25 |
| S20 | Install and customize apps with Helm; upgrade and roll back. | [`labs/day-3/20-helm.md`](../labs/day-3/20-helm.md) | 30 | 30 |
| S21 | Drive desired state from Git; understand sync and drift. | [`labs/day-3/21-gitops.md`](../labs/day-3/21-gitops.md) | 30 | 25 |
| S22 | Explain what an operator is and why it matters. | [`labs/day-3/22-operator-concept.md`](../labs/day-3/22-operator-concept.md) | 25 | 15 |
| S23 | See an operator manage a real system; learn observability basics. | [`labs/day-3/23-prometheus.md`](../labs/day-3/23-prometheus.md) | 30 | 25 |
| S24 † | Scaffold a tiny operator and understand reconcile. | [`labs/day-3/24-kubebuilder.md`](../labs/day-3/24-kubebuilder.md) *(stub)* | 40 | 40 |
| S25 | Understand how weak Pod settings enable escape, and how to prevent it. | [`labs/day-3/25-pod-escape.md`](../labs/day-3/25-pod-escape.md) | 35 | 30 |
| S26 | Critically review real manifests against a production checklist. | [`labs/day-3/26-capstone.md`](../labs/day-3/26-capstone.md) | 30 | 40 |
| S27 | Know where to go next. | *(none — slides-only: open Q&A / office hours)* | 20 | — |

† **S24 is a deferred stub.** The slides and lab are outlined but not yet fully authored —
it needs a Go + kubebuilder toolchain and is scheduled for a later milestone. Its timing is
the planned slot, not delivered content. See the
[facilitator guide](./facilitator-guide.md) before including it.

## The canonical 3-day cut

The boil-down that a facilitator delivers by default. Target **~390 min/day at ~50/50**.
Everything **not** listed is toggled off for that delivery (still fully authored in the
superset). The cut is deliberately adjustable — the listed add-backs and toggles are the
first knobs to reach for.

### Day 1 (~365 min planned)

**Sections:** S00, S03, S04, S05, S06, S07, S08.

- **S01 Containers** and **S02 Container security** are offered as an **optional
  pre-read or a "day 0" evening block** — they are *not* in the core Day-1 cut above,
  even though the section map tags them Day 1. If the room needs container grounding,
  fold them in and drop **S09 Gateway API** to Day 2 to make room.

| Section | Slides | Lab | Total |
| --- | --- | --- | --- |
| S00 | 20 | 15 | 35 |
| S03 | 30 | 20 | 50 |
| S04 | 25 | 25 | 50 |
| S05 | 30 | 25 | 55 |
| S06 | 35 | 30 | 65 |
| S07 | 30 | 30 | 60 |
| S08 | 25 | 25 | 50 |
| **Day 1** | **195** | **170** | **365** |

### Day 2 (~345 min planned)

**Sections:** S09, S10, S11, S12, S13, S14.

- **S15 Jobs & CronJobs** and **S16 HPA** are the first **add-backs** if time allows
  (each ~40 min).

| Section | Slides | Lab | Total |
| --- | --- | --- | --- |
| S09 | 30 | 25 | 55 |
| S10 | 25 | 25 | 50 |
| S11 | 30 | 30 | 60 |
| S12 | 30 | 30 | 60 |
| S13 | 30 | 30 | 60 |
| S14 | 30 | 30 | 60 |
| **Day 2** | **175** | **170** | **345** |

### Day 3 (~420 min planned)

**Sections:** S17, S20, S21, S22, S23, S25, S26, S27.

- **S18 NetworkPolicy**, **S19 RBAC**, and **S24 kubebuilder** are the **toggles** to
  drop if the day runs long.

| Section | Slides | Lab | Total |
| --- | --- | --- | --- |
| S17 | 30 | 25 | 55 |
| S20 | 30 | 30 | 60 |
| S21 | 30 | 25 | 55 |
| S22 | 25 | 15 | 40 |
| S23 | 30 | 25 | 55 |
| S25 | 35 | 30 | 65 |
| S26 | 30 | 40 | 70 |
| S27 | 20 | — | 20 |
| **Day 3** | **230** | **190** | **420** |

> **Reading the totals.** Day 1 (365) and Day 2 (345) sit under the ~390 target, leaving
> headroom for the S01/S02 pre-read (Day 1) and the S15/S16 add-backs (Day 2). Day 3 as
> listed sums to **420** — over target — so a facilitator running to time should drop one
> of the Day-3 toggles (S18/S19/S24 are already excluded above; consider deferring the
> optional-tier S24 elsewhere or trimming the S26 capstone lab). These are unrehearsed
> planning estimates; the [facilitator guide](./facilitator-guide.md#timing--pacing)
> covers how to pace against them.

## CKAD / CKA alignment

Alignment is a **design check**, not the workshop's structure — certification prep is
explicitly *not* the organizing principle. Topic coverage is mapped to CKA/CKAD domains
so the workshop is a strong foundation for certification, and so certification-curious
learners can self-map.

> **Currency.** Verify the current Kubernetes release and CKA/CKAD curriculum versions
> at delivery time; this document does not hard-pin a version. The CKA was substantially
> revised (collapsing to five domains and adding **Gateway API, Helm/Kustomize, and
> CRDs/Operators**), all of which this workshop teaches — so the spine is deliberately
> modern.

### Covered by the workshop

| Cert domain (theme) | Sections | CKAD | CKA |
| --- | --- | --- | --- |
| Container images & build | S01, S02 | Design & Build | — |
| Cluster architecture & API model | S03, S04 | Design & Build | Cluster Arch |
| Workloads & scheduling (Pod, Deployment, StatefulSet, resources, jobs, HPA) | S05, S06, S12, S13, S15, S16 | Design & Build / Deployment | Workloads & Scheduling |
| Services & networking (Service, Ingress, Gateway API, NetworkPolicy) | S07, S08, S09, S18 | Services & Networking | Services & Networking |
| Configuration (ConfigMap, Secret) | S10 | App Env, Config & Security | Workloads & Scheduling |
| Storage (PV/PVC/StorageClass) | S11, S12 | Design & Build (volumes) | Storage |
| Observability (probes, metrics, debugging) | S14, S23 | Observability & Maintenance | Troubleshooting |
| Security (image, PSS, securityContext, RBAC, NetworkPolicy, hardening) | S02, S17, S18, S19, S25 | App Env, Config & Security | Cluster Arch / Troubleshooting |
| Packaging & delivery (Helm, GitOps) | S20, S21 | App Deployment (Helm) | Cluster Arch (Helm/Kustomize) |
| Extensibility (CRDs, operators) | S22, S23, S24 | App Env (CRD/Operators) | Cluster Arch (CRDs/operators) |

### Intentionally optional / next-steps

Called out in the wrap-up (S27) as "where to go next" rather than taught in depth:

- **Multi-container patterns** (sidecar/init/ambassador/adapter, incl. native sidecar
  containers) — a CKAD item; touched in S05.
- **Node scheduling controls** — nodeAffinity, taints/tolerations, topology spread — a
  CKA workloads item; a candidate for a future optional section.
- **Canary / blue-green** — a CKAD strategy item; conceptual demo in S06/S21.
- **Cluster internals** — CoreDNS, `crictl`, and the CNI/CSI/CRI extension interfaces;
  `crictl` is touched in S25 node debugging, and the CRI in S01/S03.
- **Admin track (out of scope for app developers)** — kubeadm lifecycle/upgrades, etcd
  backup/restore, HA control plane, node `drain`/`cordon`. Pointed to external
  resources and skipped.

## Where to go next (free resources)

Surfaced in S27 as downstream options — certification is a possibility, not the goal.

- **Official docs** — <https://kubernetes.io/docs/home/> · interactive Kubernetes Basics
  tutorial · Gateway API (<https://gateway-api.sigs.k8s.io/>) · Pod Security Standards.
- **CNCF / Linux Foundation** — the free LFS158 "Introduction to Kubernetes" course and
  the open-source CKA/CKAD curricula (<https://github.com/cncf/curriculum>).
- **Hands-on practice (free)** — Killercoda "Killer Shell" CKA/CKAD scenarios and
  ephemeral-cluster playgrounds.
- **Containers & images** — the OCI image spec, Trivy, Sigstore/cosign, SLSA, and
  distroless base images.
- **Operators** — the Kubebuilder Book and the Operator SDK.
- **Security (defensive)** — NSA/CISA Kubernetes Hardening Guidance, MITRE ATT&CK for
  Containers, and tooling such as kube-bench, Trivy, Kubescape, and Falco.
