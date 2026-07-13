# Rehearsal Checklist — kind path, lab by lab

A pre-delivery **dry-run** checklist for the facilitator. It walks the workshop's
**canonical `kind` path** end to end — the path where the facilitator (or a learner
with cluster-admin) installs every add-on themselves — so the add-on installs, the
deliberate break→fix in each lab, and the clean-state cleanup are all exercised once
against a throwaway cluster **before** anyone is in the room.

Why the `kind` path: it is the fullest path. On a shared cluster the add-ons are
pre-installed and several labs run read-only, so a shared-cluster rehearsal never
exercises the installs. Rehearsing on `kind` covers everything; a shared-cluster
delivery is then a subset. See the
[facilitator guide](./facilitator-guide.md#add-ons-what-to-pre-install-per-lab) for
the add-on table this checklist mirrors, and the
[syllabus](./syllabus.md#section-map-s00s27) for the canonical section map.

> **Scope.** This checklist covers **every syllabus section (S00–S27)**, not just the
> 3-day cut, because a rehearsal should exercise the whole authored superset. The
> **Tier** column marks what is `core` / `recommended` / `optional` so you can skip
> the cut-first sections if you are only rehearsing a specific delivery. **S24 is a
> deferred stub** (do not rehearse as a runnable lab); **S27 is slides-only** (no lab).

Two more things to keep straight before you start:

> **This is a checklist, not a results log.** Record measured timings and blockers in
> the separate [timing-results template](./timing-results-template.md) — keep measured
> numbers out of this file. This checklist also complements the
> [US-BETA-3 validation matrix](./validation-matrix.md) (authored in a sibling lane):
> that matrix tracks per-lab manifest validation (client/server dry-run, live-cluster
> confirmation); this checklist is the human walk-through of the delivery path.

## How to use this checklist

1. Create a fresh `kind` cluster (`kind create cluster` with the lab's
   `kind-cluster.yaml` where a lab ships one — S08 needs the `ingress-ready` node
   label).
2. Work top to bottom. For each section: run the slides open in one window, do the lab
   in another, install any add-on **before** the lab step that needs it, hit the
   deliberate **break→fix**, then run the lab's **Cleanup / panic reset**.
3. Tick the boxes as you go. Log the numbers in the
   [timing-results template](./timing-results-template.md), not here.
4. By authoring contract (see the [facilitator guide](./facilitator-guide.md)), every
   runnable lab carries a **deliberate break→fix** (its exact shape varies — a wrong
   value, a broken selector, a flawed manifest to audit) and ends with a **Cleanup /
   panic reset**. Confirm both actually fire. (S24 is a stub and S27 is slides-only —
   neither applies there.)

## Pre-flight (once, before Section S00)

- [ ] `kubectl` on `PATH`, within one minor version of the target API server.
- [ ] `kind` + a container engine (Docker or Podman) installed; adequate RAM.
- [ ] `helm` v3.8+ on `PATH` (needed for S20, S23).
- [ ] Registry pull access from the rehearsal network (public images pull cleanly).
- [ ] For S02: a scanner (Trivy or Grype), optionally cosign.
- [ ] `export NS=workshop` (the kind convention) and confirm the namespace exists.

## Day 1 — Foundations and the core red line

| ✓ | ID | Tier | Lab | Add-on to install first | break→fix present | Cleanup runs |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S00 | core | [00-setup](../labs/day-1/00-setup.md) | none | wrong context | [ ] |
| [ ] | S01 | recommended | [01-containers](../labs/day-1/01-containers.md) | none (local, no cluster) | `latest` is not "newest" | [ ] |
| [ ] | S02 | recommended | [02-container-security](../labs/day-1/02-container-security.md) | none (local, no cluster) | a "deleted" secret still ships | [ ] |
| [ ] | S03 | core | [03-cluster-tour](../labs/day-1/03-cluster-tour.md) | none | a typo `explain` | [ ] |
| [ ] | S04 | core | [04-kubectl](../labs/day-1/04-kubectl.md) | none | client says yes, server says no | [ ] |
| [ ] | S05 | core | [05-pod](../labs/day-1/05-pod.md) | none | a bad image (ImagePullBackOff) | [ ] |
| [ ] | S06 | core | [06-deployment](../labs/day-1/06-deployment.md) | none | a rollout that stalls | [ ] |
| [ ] | S07 | core | [07-service](../labs/day-1/07-service.md) | none | break the selector (silent failure) | [ ] |
| [ ] | S08 | core | [08-ingress](../labs/day-1/08-ingress.md) | **ingress-nginx** (`kind` provider manifest) | forget `pathType` | [ ] |

**Day 1 add-on install to verify:** for **S08**, the `kind` cluster must carry the
`ingress-ready` node label (from the lab's `kind-cluster.yaml`), then
`kubectl apply -f` the ingress-nginx `kind` provider manifest and wait for the
controller to be ready **before** the Ingress step.

## Day 2 — Modern routing and running workloads well

| ✓ | ID | Tier | Lab | Add-on to install first | break→fix present | Cleanup runs |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S09 | recommended | [09-gateway-api](../labs/day-2/09-gateway-api.md) | **Gateway API CRDs + NGINX Gateway Fabric** | a `gatewayClassName` nobody owns | [ ] |
| [ ] | S10 | core | [10-config](../labs/day-2/10-config.md) | none | rotate a value — env vars don't update live | [ ] |
| [ ] | S11 | core | [11-storage](../labs/day-2/11-storage.md) | none (default StorageClass on kind) | a StorageClass that doesn't exist | [ ] |
| [ ] | S12 | recommended | [12-statefulset](../labs/day-2/12-statefulset.md) | none (default StorageClass on kind) | a `serviceName` pointing at nothing | [ ] |
| [ ] | S13 | core | [13-resources](../labs/day-2/13-resources.md) | none | push a container past its memory limit | [ ] |
| [ ] | S14 | core | [14-probes](../labs/day-2/14-probes.md) | none | break readiness, then liveness | [ ] |
| [ ] | S15 | recommended | [15-jobs](../labs/day-2/15-jobs.md) | none | a Job that fails until `backoffLimit` | [ ] |
| [ ] | S16 | optional | [16-hpa](../labs/day-2/16-hpa.md) | **metrics-server** (kind: `--kubelet-insecure-tls`) | an HPA with nothing to divide by | [ ] |

**Day 2 add-on installs to verify:** for **S09**, `kubectl apply -f` the Gateway API
standard-channel CRDs, then the NGINX Gateway Fabric deploy manifest (provides the
`nginx` GatewayClass), **before** the route step. For **S16**, `kubectl apply -f`
metrics-server `components.yaml` **with the kind `--kubelet-insecure-tls` patch**, then
confirm `kubectl top` reports before the HPA step (otherwise `TARGETS <unknown>`).

## Day 3 — Security, delivery, operators, best practices

| ✓ | ID | Tier | Lab | Add-on to install first | break→fix present | Cleanup runs |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S17 | core | [17-pod-security](../labs/day-3/17-pod-security.md) | none (PSA built into API server) | the insecure Pod is refused at the door | [ ] |
| [ ] | S18 | recommended | [18-networkpolicy](../labs/day-3/18-networkpolicy.md) | **policy-capable CNI** (kindnet enforces; Calico fallback) | `default-deny` fences the backend (self-test) | [ ] |
| [ ] | S19 | optional | [19-rbac](../labs/day-3/19-rbac.md) | none | run real commands as the SA and hit the deny | [ ] |
| [ ] | S20 | core | [20-helm](../labs/day-3/20-helm.md) | none (needs `helm` CLI) | break an upgrade, then roll back | [ ] |
| [ ] | S21 | recommended | [21-gitops](../labs/day-3/21-gitops.md) | **Argo CD** (`install.yaml` into `argocd` ns) | drift by hand, watch self-heal revert | [ ] |
| [ ] | S22 | recommended | [22-operator-concept](../labs/day-3/22-operator-concept.md) | **cert-manager** | delete the Secret, watch the loop remake it | [ ] |
| [ ] | S23 | recommended | [23-prometheus](../labs/day-3/23-prometheus.md) | **kube-prometheus-stack** (Helm) | diagnose on the Prometheus `/targets` page | [ ] |
| [ ] | S24 † | optional | [24-kubebuilder](../labs/day-3/24-kubebuilder.md) | **DEFERRED STUB — do not rehearse as a runnable lab** | n/a (unauthored) | n/a |
| [ ] | S25 | recommended | [25-pod-escape](../labs/day-3/25-pod-escape.md) | none — **kind-only**, controlled escape; never on shared/prod | (controlled escape + hardening) | [ ] |
| [ ] | S26 | core | [26-capstone](../labs/day-3/26-capstone.md) | none | audit a flawed manifest, then fix it | [ ] |
| [ ] | S27 | core | *(slides only — open Q&A / office hours, no lab)* | none | n/a (no lab) | n/a |

† **S24 is a deferred stub** — the slides and lab are outlined but not authored (needs a
Go + kubebuilder toolchain). Do not schedule it as a runnable rehearsal step.

**Day 3 add-on installs to verify:** **S18** — confirm your CNI actually *enforces*
(kind's current kindnet does, via kube-network-policies; the lab's Step 2 is an
enforcement self-test with a Calico fallback). **S21** — `kubectl create namespace
argocd` then `kubectl apply -n argocd --server-side` the Argo CD `install.yaml`.
**S22** — `kubectl apply -f` the cert-manager release manifest. **S23** — `helm repo
add` prometheus-community then `helm install` kube-prometheus-stack into a `monitoring`
namespace.

## Post-rehearsal wrap-up

- [ ] Every lab's **Cleanup / panic reset** left the cluster in a clean state (no
      leftover workloads, PVCs, CRDs, or namespaces you did not expect).
- [ ] Tear down: `kind delete cluster` and re-create from scratch confirms a clean
      rebuild (~30 s) — the documented panic reset for the kind path.
- [ ] All add-on installs completed within a workable time on the rehearsal network
      (record the real durations in the
      [timing-results template](./timing-results-template.md)).
- [ ] Any lab where the break→fix or cleanup did **not** behave as the lab describes is
      filed as a [beta-feedback issue](../.github/ISSUE_TEMPLATE/beta-feedback.yml).
- [ ] Timings for every section captured in the
      [timing-results template](./timing-results-template.md) so the planning
      estimates can finally be checked against measured reality.
