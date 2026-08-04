# Facilitator Guide — Kubernetes Practitioner Workshop

Everything you need to **run** this workshop: room and environment setup, pacing
against the schedule, which labs need cluster-wide add-ons (and what to pre-install),
and how to provision a shared cluster so every attendee has a namespace they own.

This is the facilitator entry point. It is a companion to the participant-facing and
project-overview documents — know where each one takes you:

- [`../README.md`](../README.md) — **project front door**: what the workshop is, live
  decks, PDF downloads, audience & prerequisites. Send newcomers here.
- [`syllabus.md`](./syllabus.md) — the **public schedule**: section map (S00–S27), tiers,
  per-section timings (each linked to its lab), the canonical 3-day cut, and CKA/CKAD
  alignment.
- [`../labs/README.md`](../labs/README.md) — the **participant entry point**: prerequisites,
  the two environments, how the labs work, and a direct index of every authored lab.
- [`decisions/`](./decisions/) — architecture decision records; in particular
  [`0006-workshop-environment-and-iac.md`](./decisions/0006-workshop-environment-and-iac.md)
  describes the intended environment model this guide operationalizes.

> **Quick wayfinding.** *Just previewing?* → [README](../README.md) → the live decks.
> *Doing the labs?* → [labs README](../labs/README.md) → [`00-setup`](../labs/day-1/00-setup.md).
> *Running the room?* → you're in the right place; pair this with the
> [syllabus](./syllabus.md). *Contributing content?* → [`../AGENT.md`](../AGENT.md).

> **Honesty up front.** The environment automation described in ADR 0006 — an `infra/`
> tree with `make kind-up` / `make ns-provision` verbs — is **planned, not yet built**.
> This guide documents the **manual path that works today** (the `kubectl apply` / `helm
> install` commands the labs already ship) and marks every future convenience explicitly
> as *planned*. Do not expect a one-command setup at delivery time; provision by hand.

## Who runs this, and what you commit to

You are running a **beginner-to-intermediate**, code-heavy, vendor-neutral Kubernetes
workshop. It is **~50% presentation, ~50% hands-on practice**: every concept block in the
deck is immediately followed by a standalone lab under [`../labs/`](../labs/). Your job in
the room is to teach the concept, then get everyone through the lab — and, crucially, to
have the **environment ready before anyone arrives**.

The workshop is authored as a **content superset** (S00–S27) and **boiled down** per
delivery. The [canonical 3-day cut](./syllabus.md#the-canonical-3-day-cut) is the default
you deliver; you compose a shorter room by toggling `recommended` / `optional` sections
off. Decide your cut **before** the environment work below — it determines which add-ons
you must pre-install.

### Choose the deck before the room

Live delivery uses four small, independently buildable entries over the same section
sources: **Day 1**, **Day 2**, **Day 3**, and **Optional / Appendix**. Start a complete day,
one section, or a contiguous range with the launcher:

```bash
pnpm deck -- --list
pnpm deck -- --day 1
pnpm deck -- --section S05
pnpm deck -- --range S05-S09
```

Add `--action build` or `--action export` to render a custom selection instead of serving
it. `--dry-run` prints the resolved IDs without starting Slidev. If
[`gum`](https://github.com/charmbracelet/gum) is installed and the command runs in a TTY,
`pnpm deck` offers the same choices as an interactive menu. Gum is optional: flags and
`--list` remain deterministic on CI, remote shells, and managed laptops.

An invocation without a selector intentionally fails when no interactive menu is available;
it never falls back to the oversized content superset. The four standard entries also have
direct scripts: `pnpm dev:day1`, `dev:day2`, `dev:day3`, and `dev:optional`. The combined
`slides.md` superset remains available through `pnpm dev:superset` for compatibility and
whole-corpus inspection only.

## Timing and pacing

Syllabus [per-section minute marks](./syllabus.md#per-section-outcomes-timings-and-labs)
are **planning aids**, not a delivery contract. Pace to the room: the presenter, the
audience, and which optional sections you keep matter more than hitting a spreadsheet.

Rough shape for a full day: about half slides / half labs, with breaks and lunch on top.
The canonical cut is a bit light on Days 1–2 (headroom for on-ramps) and heavy on Day 3 —
trim the S26 capstone lab if you need wall-clock room.

> Confirm add-ons for *your* cut with a short dry-run (see
> [Rehearsal debt](#rehearsal-debt-read-before-you-teach) and
> [known limitations](./beta-limitations.md)). Do not treat unrehearsed minute totals as a
> release or teaching blocker.

**Pacing tactics that hold the 50/50 balance:**

- **Timebox the labs, not the discussion.** Announce a lab window up front and keep a
  visible timer if it helps the room. Day 1 Labs 01–08, Day 2 Labs 09–16, and Day 3 Labs
  17–23, 25–26 are fully copy-pasteable and link to their `NN-topic.solution.md` companion
  (S24 remains a deferred stub), so a stuck learner is one click from exact commands,
  expected state, and recovery guidance — you rarely need to stop the room.
- **Use the break→fix step as the natural catch-up point.** Fast finishers dig into the
  stretch goal; you circulate while slower learners reach the deliberate break.
- **Protect the red line.** Sections S05–S09 (`Pod → Deployment → Service → Ingress →
  Gateway API`) each extend the *same* manifest. If you fall behind, cut a later add-on
  section, not a red-line step — the through-line is load-bearing for everything after it.
- **Front-load the on-ramp decision.** S01/S02 (containers) run locally with no cluster.
  If your room needs container grounding, run them as an optional "day 0" evening block or
  a pre-read rather than eating Day-1 red-line time.

## The two teaching environments

Every cluster lab supports **two environments**, and both are first-class throughout. You
choose which the room uses (or let attendees choose per the constraints below). The labs
carry an **Environment badge** in their header table so a learner always knows which paths
a given lab supports.

| Environment | What it is | Attendee gets | You provide |
| --- | --- | --- | --- |
| **Shared namespace** | An assigned namespace on a cluster **you** run and admin. | A kubeconfig + a namespace (e.g. `student-07`), **no cluster-admin**. | The cluster, per-attendee namespaces, and any cluster-wide add-ons (pre-installed). |
| **Local `kind`** | A throwaway single-node cluster each attendee creates on their laptop. | Full admin over their own cluster. | Nothing at cluster level — attendees self-install add-ons per lab. Verify laptops meet the prerequisites. |

### How the labs signal the split

The badge grammar (defined in [`../labs/README.md`](../labs/README.md#your-environment))
tells you what a lab needs:

- **`namespace ✓ / kind ✓`** — runs identically in both. Most core labs.
- **`kind ✓` + `namespace: read-only`** — needs cluster-admin, CRDs, or host access, so
  the full path is **kind-only**. These labs **also ship a namespace-safe read-only
  alternative** (observe a component you pre-installed) so shared-cluster learners follow
  along. This is where your pre-install work concentrates.
- **`kind-only`** — no shared-cluster path at all (e.g. the pod-escape lab, which performs
  a controlled container escape and must run in a throwaway cluster the learner owns).
- **`local — no cluster needed`** — the container labs (S01/S02) run against a container
  engine on the laptop; no Kubernetes at all.

Attendees set a shell variable `$NS` once in the [setup lab](../labs/day-1/00-setup.md)
and reuse it everywhere (`export NS=student-07` on shared; `export NS=workshop` on kind).

### Choosing an environment for your room

- **Shared cluster** is smoother for a large or mixed-skill room: no laptop variance, no
  per-laptop container-engine debugging, and you control the add-ons. Cost: you must stand
  up and provision the cluster (see [Shared-cluster provisioning](#shared-cluster-provisioning-manual-today)),
  and the `kind-only` labs become **watch-me demos** (learners take the read-only path).
- **Local `kind`** is best when attendees have capable laptops and you want them to
  experience the full add-on installs (ingress controller, Argo CD, cert-manager). Cost:
  laptop prerequisites must be met (container engine + `kind` + adequate RAM), and network
  pull access to public image registries must work from the room.
- **Mixed** is supported: some attendees on kind, some on a shared namespace. Every core
  lab is identical across both, and the badge tells each learner which path to take.

> **Recommendation.** For a first delivery, run a **shared cluster** for the core red line
> (least laptop risk) and let confident attendees use **kind** for the add-on-heavy Day-3
> labs so they get the full install experience. Whatever you choose, verify it end-to-end
> **before** the room arrives — the setup lab exists exactly to catch a broken environment
> in the first 15 minutes.

## Add-ons: what to pre-install per lab

Some labs need **cluster-wide** prerequisites (a controller, CRDs, an operator, a
policy-capable CNI). By design these are never a normal learner step: anything
cluster-scoped is an **add-on** that is either self-installed on **kind** (the learner owns
that cluster) or **pre-installed by you** on the shared cluster (learners then take the
read-only path). See ADR 0006 for why this split exists.

The table below is your pre-install checklist. On **kind**, the lab installs the add-on
itself in an early step (learners run the command). On a **shared cluster**, **you install
it once, in advance**, and learners observe.

> **Verify versions at delivery time.** The pinned versions below are what the labs ship
> today; re-check the current release of each component when you deliver (the workshop
> deliberately does not hard-pin a Kubernetes version). ADR 0007 covers the intended
> single-source version pinning (planned in `infra/versions.env`).

| Section / lab | Add-on to pre-install | What it is / why | Install (as shipped) |
| --- | --- | --- | --- |
| **S08** Ingress ([lab](../labs/day-1/08-ingress.md)) | **Ingress controller** (Contour) — profile `ingress-contour` (or day composer `day-1`) | Nothing serves an Ingress until a controller exists; the lab exposes the red-line app north-south. **Mutually exclusive** with `gateway-envoy` (never install both). | Prefer `./workshop profile day-1` or `./workshop profile ingress-contour` (or `make profile-day-1` / `make profile-ingress-contour`). Manual: Contour v1.33.5 pinned quickstart. kind needs the ingress-ready 80/443 port mappings — the repo's kind cluster config already has them. |
| **S09** Gateway API ([lab](../labs/day-2/09-gateway-api.md)) | **Gateway API standard CRDs + Envoy Gateway** — profile `gateway-envoy` (canonical; also in `day-2`) | The Gateway API is CRD-based; you need the standard-channel CRDs **and** a controller that owns a `GatewayClass`. **Mutually exclusive** with Contour. | Prefer `./workshop profile day-2` or `./workshop profile gateway-envoy` (or `make profile-day-2` / `make profile-gateway-envoy`). Manual: Gateway API `standard-install.yaml` (v1.5.1) then Envoy Gateway `install.yaml` (v1.8.2). Provides the `eg` GatewayClass — labs must set `gatewayClassName: eg` explicitly. |
| **S16** Autoscaling / HPA ([lab](../labs/day-2/16-hpa.md)) | **metrics-server** (composed into `day-2`) | The HPA reads CPU from the `metrics.k8s.io` API, which metrics-server serves. No metrics-server → `TARGETS <unknown>`. | Prefer `./workshop profile day-2` (installs metrics-server + Envoy). Manual: `kubectl apply -f` the metrics-server `components.yaml` pin from `infra/versions.env`. **kind needs the `--kubelet-insecure-tls` patch** (kind's kubelet serves a self-signed cert). |
| **S18** NetworkPolicy ([lab](../labs/day-3/18-networkpolicy.md)) | **A policy-capable CNI** (Calico, Cilium, Antrea, or modern kindnet) | A NetworkPolicy is inert unless the CNI enforces it. `kubectl apply` succeeds on any cluster but the packet is only dropped if the CNI enforces. | On kind, current **kindnet** enforces (via kube-network-policies); the lab's Step 2 is an **enforcement self-test** with a **Calico fallback** if your CNI doesn't enforce. On a shared cluster, confirm your CNI enforces before the room. |
| **S21** GitOps / Argo CD ([lab](../labs/day-3/21-gitops.md)) | **Argo CD** (composed into `day-3`) | The in-cluster GitOps agent that reconciles the cluster toward Git; the lab hands it a public `guestbook` `Application`. | Prefer `./workshop profile day-3` (heavyweight). Manual: `kubectl create namespace argocd` then `kubectl apply -n argocd --server-side` the Argo CD pinned `install.yaml` from `infra/versions.env`. |
| **S22** Operator pattern ([lab](../labs/day-3/22-operator-concept.md)) | **cert-manager** (composed into `day-3`) | A real operator = CRDs + a controller. The lab installs **cert-manager** specifically (v1.21.0) and inspects the API it adds. | Prefer `./workshop profile day-3`. Manual: `kubectl apply -f` the cert-manager release manifest (v1.21.0). |
| **S23** Prometheus Operator ([lab](../labs/day-3/23-prometheus.md)) | **kube-prometheus-stack** (composed into `day-3`) | The Prometheus Operator manages Prometheus via a `ServiceMonitor` CRD; the lab wires the red-line app in. | Prefer `./workshop profile day-3` (warns heavyweight). **Helm:** pinned `kube-prometheus-stack` chart from `infra/versions.env` into a `monitoring` namespace. |
| **S25** Security & pod escape ([lab](../labs/day-3/25-pod-escape.md)) | **None** (kind-only, no add-on) | Pod Security Admission is built into the API server (stable since v1.25). | Nothing to install — but this lab is **strictly kind-only**: it runs a controlled escape and **must never touch a shared/managed/production cluster**. |
| **S24** Operator dev / kubebuilder ([lab](../labs/day-3/24-kubebuilder.md)) | **kubebuilder toolchain** (Go, kubebuilder) — *aspirational* | Scaffold and run a minimal operator against kind. | **This lab is currently a STUB** (kind-only, advanced, unauthored). Treat its toolchain as planned; do not schedule it as a full hands-on until authored. |

**Labs that need *no* cluster-wide add-on** (run in a plain namespace with only the default
StorageClass where noted): S00 setup, S03 cluster tour, S04 kubectl, S05–S07 (Pod /
Deployment / Service), S10 config, **S11 storage & S12 StatefulSet** (assume a **default
StorageClass** — present on kind; confirm one exists on your shared cluster), S13 resources,
S14 probes, S15 jobs, S17 pod security, S19 RBAC, S20 Helm, S26 capstone.

**Non-cluster prerequisites to check on laptops** (from
[`../labs/README.md`](../labs/README.md#prerequisites)):

- **Every cluster lab:** `kubectl` on `PATH`, within one minor version of the API server.
- **kind path:** [`kind`](https://kind.sigs.k8s.io) + a container engine (Docker or Podman).
- **Container labs (S01/S02):** a container engine (Docker / Podman / nerdctl). **S02**
  also needs a scanner — [Trivy](https://trivy.dev) (Grype works) and optionally
  [cosign](https://docs.sigstore.dev/) for the signing step (skippable).
- **S20 Helm** and **S23** need the [`helm`](https://helm.sh) CLI (v3.8+).

## Shared-cluster provisioning (manual today)

If you run a shared cluster, each attendee needs a namespace they own — with the right
RBAC, a resource cap, and (for S17) Pod Security Standards enforced. Because the model
must never grant learners cluster-admin, **anything cluster-scoped is your responsibility
to set up in advance.**

> **Planned automation.** ADR 0006 specifies an `infra/shared-cluster/provision.sh` script
> (surfaced as `make ns-provision`) that mints one namespace per attendee with the RBAC,
> quota/limit, and PSA labels below. **That script does not exist yet** (see
> [US-ENV-1](#rehearsal-debt-read-before-you-teach)). Until it does, provision namespaces
> by hand — a short loop over the four steps below per attendee.

Per attendee, the namespace must have:

1. **The namespace itself**, set as the attendee's default context so they can drop `-n
   $NS` (the [setup lab](../labs/day-1/00-setup.md) has them run `kubectl config
   set-context --current --namespace=$NS`; the namespace must already exist for them).
2. **An in-namespace RBAC Role + RoleBinding** granting create/update/delete on the common
   workload kinds (pods, deployments, services, configmaps, secrets, PVCs, jobs, …) **and
   nothing cluster-scoped**. The setup lab's Step 3 asserts this — `kubectl auth can-i
   create pods` must return `yes` in the attendee's namespace, and cluster-scoped writes
   must be denied. Learners build exactly this kind of Role themselves in **Lab 19 (RBAC)**.
3. **A ResourceQuota + LimitRange** so no attendee can starve the shared cluster. The
   labs assume this is present — S13 (resources & limits) explicitly relies on a
   quota/limit existing in the attendee's own namespace. A LimitRange also gives Pods
   sensible default requests/limits.
4. **Pod Security Standards labels, pre-applied.** Because labelling a Namespace is a write
   on a cluster-scoped object that the in-namespace Role cannot do, **you pre-label each
   attendee namespace `restricted`** on all three PSA modes:

   ```bash
   kubectl label --overwrite namespace "$NS" \
     pod-security.kubernetes.io/enforce=restricted \
     pod-security.kubernetes.io/warn=restricted \
     pod-security.kubernetes.io/audit=restricted
   ```

   S17 (pod security) depends on this: its shared-cluster path tells learners the
   `restricted` bar is **already on their namespace** and just to confirm it — they never
   run the `label` command (they can't). On **kind**, learners label their own namespace.

> **Sanity check before the room.** For a sample attendee namespace, run the
> [setup lab](../labs/day-1/00-setup.md) end to end as that identity: `kubectl auth can-i
> create pods` → `yes`, cluster-scoped writes → `no`, and `kubectl get namespace $NS
> --show-labels` shows all three `restricted` PSA labels. If that passes, every attendee is
> at the same verified starting state.

## Rehearsal debt (read before you teach)

The lab manifests are validated (client/server dry-run), and several were confirmed against
a live cluster — but the workshop has **not yet had a full clean-environment rehearsal
pass**. Be aware of the following, consistent with the honesty callouts already in the
[syllabus](./syllabus.md#superset-vs-the-canonical-3-day-cut) and
[labs README](../labs/README.md#how-to-start):

- **Syllabus minute marks are planning aids.** Room tempo is presenter- and
  audience-dependent — adjust on the day rather than chasing a fixed minute total.
- **S08 has fresh live evidence.** On 2026-08-03, its complete kind path passed on an
  Ubuntu 26.04 x86_64 laptop with Docker 29.6.2, kind v0.32.0 / Kubernetes v1.36.1,
  and Contour v1.33.5: controller and Envoy readiness, both host routes,
  required-`pathType` rejection, wrong-class routing loss, TLS/SNI, optional Extension 2
  (`ingress2gateway` preview), and cleanup. This validates behaviour, not classroom pacing.
  The created cluster and validation namespace were removed.
- **The remaining `kind`-only add-on installs have not all been run end-to-end** in a
  clean environment. Dry-run the remaining **add-on-heavy labs** (S09, S16, S18, S21, S22,
  S23) on a clean kind cluster before delivery so you know install quirks on *your*
  network.
- **Local kind automation is shipped** (`./workshop up` / `make kind-up` →
  `infra/kind/cluster.sh`). **Shared-cluster namespace provisioning**
  (`make ns-provision` / `infra/shared-cluster/`) is still planned — provision
  attendee namespaces by hand as above until that lands.
- **The de-nginx effort (roadmap M8 / US-NGX) has landed.** The retired ingress-nginx
  controller was replaced by **Contour** (S08), NGINX Gateway Fabric by **Envoy Gateway**
  (S09), and every demo web image by the purpose-built
  `ghcr.io/platformrelay/workshop-web` (`:v1`/`:v2`/`:v3` — listens on **8080**, non-root,
  distroless, PSA `restricted`-clean). The add-on table above reflects the new stack;
  re-check the pinned versions against the labs at delivery time.
- **S24 (kubebuilder) is a stub** and **S25 (pod escape) is strictly kind-only** — plan
  those two accordingly.

## Stable release posture (from v0.4.0)

The front-door **controlled-beta** banner is removed on the `v0.4.0` line by maintainer
decision (this branch / tip). Remaining items below are a **quality backlog**, not a
reason to re-paste a beta warning on the README or docs landing.

| Status | Item | Story / note |
| --- | --- | --- |
| Backlog | Full clean-environment rehearsal | **US-BETA-6** — useful for facilitators who want a recorded run; syllabus minutes stay planning aids, not a contract |
| Backlog | Validation matrix → `kind-smoke` | **US-ENV-4** Day-2/3 drivers + recorded evidence |
| Accepted deferred | S24 kubebuilder | **US-S24** — see [known limitations](./beta-limitations.md) |
| Done | Repo description + topics | **US-BETA-2** |

Do **not** treat unrehearsed minute marks as a release blocker — pacing is presenter- and
audience-dependent. Prefer a short dry-run of the add-ons *your* cut needs over chasing a
perfect timing spreadsheet.

Pre-release tags (`v*-beta.*`, `v*-rc.*`) still prepend
[known limitations](./beta-limitations.md) to GitHub Release notes; stable tags do not.

## Quick pre-delivery checklist

1. **Choose your cut** from the [3-day options](./syllabus.md#the-canonical-3-day-cut);
   note which `recommended`/`optional` sections you keep — that fixes your add-on list.
2. **Choose the environment** (shared cluster, kind, or mixed).
3. **Shared cluster:** stand up the cluster; provision one namespace per attendee (RBAC +
   quota/LimitRange + `restricted` PSA labels); **pre-install** every add-on your cut needs
   from the [add-on table](#add-ons-what-to-pre-install-per-lab).
4. **kind:** verify laptop prerequisites (container engine, `kind`, RAM, registry pull
   access); dry-run the add-on installs your cut actually uses.
5. **Distribute** kubeconfigs (shared) and the [`../labs/README.md`](../labs/README.md)
   prerequisites (both) ahead of time.
6. **Verify** by running the [setup lab](../labs/day-1/00-setup.md) as a sample attendee.
7. **Adjust pacing on the day** — use Day 1 feedback for Days 2–3 rather than the syllabus
   minute marks as gospel.
