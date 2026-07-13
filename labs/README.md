# Labs — participant guide

Hands-on labs for the Kubernetes Practitioner Workshop. These are the **50% practice**
half of the workshop: every concept block in the deck is followed by a lab you run
against your own environment.

Each lab is a **standalone Markdown file** you can read top to bottom and copy-paste
your way through. You do not need the slides to run them.

> **New here? Start with [`day-1/00-setup.md`](./day-1/00-setup.md).** It verifies your
> tooling, context, and namespace before any real content — and teaches the panic reset
> you reuse everywhere. Then work through the labs in order (each extends the previous).

- **Schedule & section map:** [`../docs/syllabus.md`](../docs/syllabus.md)
- **Running the workshop (facilitators):** [`../docs/facilitator-guide.md`](../docs/facilitator-guide.md)
- **Project overview & preview:** [`../README.md`](../README.md)

## Prerequisites

You need a shell you are comfortable in, plus the tools below. **Versions are not
hard-pinned** — use current releases and keep `kubectl` within one minor version of your
cluster's API server.

**Core (every cluster lab):**

- `kubectl` on your `PATH`, talking to a cluster (see [Your environment](#your-environment)).
- One lab environment: an **assigned namespace** on a shared cluster, **or** a local
  **kind** cluster.

**For the local kind path:**

- [`kind`](https://kind.sigs.k8s.io) and a **container engine** (Docker or Podman).
- You have full admin over your own cluster, so kind-only labs (add-on installs) work.

**For the container labs (S01/S02) — no cluster needed:**

- A **container engine**: Docker, Podman, or nerdctl (the labs use an `$ENGINE`
  variable so any of the three works). Its daemon/machine must be running.
- **S02 only:** a vulnerability scanner — [Trivy](https://trivy.dev) (Grype works too);
  optionally [cosign](https://docs.sigstore.dev/) for the signing step (skippable).

**For specific Day-3 labs:**

- [`helm`](https://helm.sh) v3.8+ for the Helm lab (S20) and the Prometheus lab (S23).
- A few labs install cluster-wide add-ons (metrics-server, an Ingress/Gateway
  controller, a policy-capable CNI, Argo CD, a monitoring stack). These are **kind-only**
  and self-installed by the lab, or provided for you on a shared cluster. See
  [How the labs work](#how-the-labs-work) and the per-lab prerequisites.

The setup lab, [`day-1/00-setup.md`](./day-1/00-setup.md), verifies your tooling before
any real content — start there.

## Your environment

Every cluster lab runs in **one of two environments**, and both are supported
throughout:

| Environment | What it is | You get |
| --- | --- | --- |
| **Namespace** | An assigned namespace on a shared cluster your facilitator runs. | A kubeconfig + a namespace (e.g. `student-07`). **No cluster-admin.** |
| **kind** | A local single-node cluster you create yourself. | Full admin over your own throwaway cluster. |

Each lab carries an **Environment badge** telling you which paths it supports:

- **`namespace ✓ / kind ✓`** — works in both, identically. Most core labs.
- **`kind ✓` + `namespace: read-only`** — the full hands-on path needs cluster-admin,
  CRDs, or host access, so it runs only on your own kind cluster, **but** these labs also
  ship a namespace-safe read-only alternative (observe a pre-installed component) so
  shared-cluster learners can still follow along. (S16, S18, S21, S23.)
- **`kind-only`** — no shared-cluster path at all: the lab must run on a throwaway kind
  cluster you own (e.g. S25 pod-escape, a controlled container escape).
- **`local — no cluster needed`** — the container labs (S01/S02) run entirely on your
  machine against a container engine; no Kubernetes at all.

The labs use a shell variable `$NS` for your working namespace throughout. Set it once in
the setup lab (`export NS=<your-namespace>`; kind users use `export NS=workshop`).

## How the labs work

The workshop teaches a repeatable rhythm: **explain → run → observe → break → fix →
recap**. The labs are the "run / observe / break / fix" part. Every lab follows the
same shape:

1. **Title & metadata** — the matching section ID, an estimated time, and the
   Environment badge.
2. **Objective** — one or two sentences on what you'll prove.
3. **Prerequisites** — prior labs, any add-ons/tools needed.
4. **Files used** — manifests are created inline (via `cat > file.yaml`), so a lab is
   fully self-contained; nothing to clone separately.
5. **Steps** — explicit, ordered, copy-pasteable commands. No "figure it out."
6. **Cleanup / panic reset** — return to a known-good state.

### Spoilers & hints

Every task and every question is immediately followed by a **collapsible spoiler** with
the solution or the expected output:

```md
<details><summary>Solution / expected output</summary>

...the answer, the exact command output, and why it's correct...
</details>
```

Try each step **before** you open the spoiler — but if you get stuck, the answer is
always one click away. The labs are **idiot-proof by design**: a learner who copies every
command in order will succeed, and any question you could get wrong has its answer in a
spoiler.

### Break → fix

Every lab includes at least one **deliberate break**: a bad image tag, a mismatched
selector, a failing probe, a missing resource request, a rejected Pod. You run the broken
state, read the real error (from `describe`, `logs`, or events), then fix it. This is the
whole point — you learn to recognise failures in a safe place so you recognise them for
real later.

### Reset & cleanup safety

Every lab ends with a **Cleanup / panic reset** that returns your environment to a clean
state:

- On a **shared namespace**, cleanup is always **scoped to your namespace** (`-n $NS`) so
  you never touch anyone else's work. The canonical panic reset deletes the common
  workload objects in your namespace only.
- On **kind**, the fastest reset is to throw the cluster away and rebuild it
  (`kind delete cluster` then re-create it — ~30 s). **Never** do the throw-away reset on
  a shared cluster.

The setup lab defines the reusable panic reset; later labs point back to it.

## Layout

Labs are grouped by day, matching the [3-day cut](../docs/syllabus.md#the-canonical-3-day-cut).
The numeric prefix is the section ID (Lab `NN` ↔ section `SNN`). Every authored lab below
is a direct link — click straight into any one:

### Day 1 — Foundations, containers, core red line

- [`00-setup`](./day-1/00-setup.md) — verify tooling, context & namespace *(start here)*
- [`01-containers`](./day-1/01-containers.md) · [`02-container-security`](./day-1/02-container-security.md) *(local, no cluster)*
- [`03-cluster-tour`](./day-1/03-cluster-tour.md) · [`04-kubectl`](./day-1/04-kubectl.md)
- [`05-pod`](./day-1/05-pod.md) · [`06-deployment`](./day-1/06-deployment.md) · [`07-service`](./day-1/07-service.md) · [`08-ingress`](./day-1/08-ingress.md)

### Day 2 — Modern routing, running workloads well

- [`09-gateway-api`](./day-2/09-gateway-api.md) · [`10-config`](./day-2/10-config.md) · [`11-storage`](./day-2/11-storage.md) · [`12-statefulset`](./day-2/12-statefulset.md)
- [`13-resources`](./day-2/13-resources.md) · [`14-probes`](./day-2/14-probes.md) · [`15-jobs`](./day-2/15-jobs.md) · [`16-hpa`](./day-2/16-hpa.md)

### Day 3 — Security, delivery, operators, best practices

- [`17-pod-security`](./day-3/17-pod-security.md) · [`18-networkpolicy`](./day-3/18-networkpolicy.md) · [`19-rbac`](./day-3/19-rbac.md)
- [`20-helm`](./day-3/20-helm.md) · [`21-gitops`](./day-3/21-gitops.md) · [`22-operator-concept`](./day-3/22-operator-concept.md) · [`23-prometheus`](./day-3/23-prometheus.md)
- [`24-kubebuilder`](./day-3/24-kubebuilder.md) *(deferred stub)* · [`25-pod-escape`](./day-3/25-pod-escape.md) · [`26-capstone`](./day-3/26-capstone.md)

Because the deck is a **superset** (more sections than fit in three days), some labs are
outside the default 3-day cut (e.g. Jobs, HPA, RBAC). These are fully authored and
runnable regardless — see the [syllabus](../docs/syllabus.md) for which sections a given
delivery includes. One optional section, **S24 (kubebuilder)**, is a **deferred stub** —
it needs a Go toolchain and is authored in a later milestone; see the
[facilitator guide](../docs/facilitator-guide.md).

## How to start

1. Confirm your [prerequisites](#prerequisites) and decide your
   [environment](#your-environment) (namespace or kind).
2. Run [`day-1/00-setup.md`](./day-1/00-setup.md) end to end. It verifies `kubectl`, your
   context and namespace, and your permission to create workloads — and teaches the panic
   reset you'll reuse everywhere.
3. Work through the labs in order. Each extends the same running application (the
   [red line](../docs/syllabus.md#the-red-line): Pod → Deployment → Service → Ingress →
   Gateway API), so later labs assume you completed the earlier ones.

> **Kind rehearsal note.** The labs' manifests are validated, but not every lab has yet
> been run end-to-end in a clean environment — a few kind-only add-on installs (timings,
> exact controller/CRD behaviour) are pending a rehearsal pass. If a step's timing or
> output differs slightly from a spoiler, that is the likely reason; the commands are
> correct. Facilitators: see the [facilitator guide](../docs/facilitator-guide.md).
