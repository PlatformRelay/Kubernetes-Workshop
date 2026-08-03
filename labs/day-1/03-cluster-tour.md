# Lab 03 — Kubernetes mental model (S03)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S03 — Kubernetes mental model |
| **Environment** | namespace ✓ (read-only alt) / kind ✓ |
| **Estimated time** | 20 min |

## Objective

Tour a **real** cluster with `kubectl` and map what you find onto the mental model
from the slides: the **control plane** (where desired state lives), the **node**
(where containers run), and the **reconciliation** idea made concrete as
**spec** (desired) vs **status** (observed). Nothing here creates or changes
objects — this lab is **read-only** and safe to run anywhere you have access.

## Prerequisites

- You finished **Lab 00** — `kubectl` reaches a cluster and `$NS` is your default
  namespace.
- **One** environment:
  - **Shared cluster:** your assigned namespace. Some commands here are
    *cluster-scoped* (nodes, control-plane Pods); if your role can't read them you'll
    get a `Forbidden` error — that's expected, and each such step has a
    **namespace-safe alternative**.
  - **Local kind cluster:** you own it, so every command works.
- No cluster-admin required. No files to create.

```bash
export NS=<your-namespace>        # same value as Lab 00 (kind users: workshop)
```

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./03-cluster-tour.solution.md#guided-solutions)

### Step 1 — the nodes: where your containers actually run

Every Pod runs on a node. Ask the cluster what its nodes look like.

```bash
kubectl get nodes -o wide
```

**Task:** run it and read across one row to the **OS-IMAGE**, **KERNEL-VERSION**, and
**CONTAINER-RUNTIME** columns. That last column is the same runtime stack you met in
S01.

---

### Step 2 — the API is self-documenting

You never need to memorise fields. The cluster ships its own schema.

```bash
kubectl api-resources | head -20      # every kind the cluster understands
kubectl explain pod.spec              # the schema behind a Pod's spec
```

**Task:** run both. In `api-resources`, find the `SHORTNAMES`, `APIVERSION`, and
`NAMESPACED` columns. In `explain`, read the first few fields of `pod.spec`.

**Question:** what does `kubectl explain pod.spec.restartPolicy` say the default is?

---

### Step 3 — find the control plane (or your namespace)

The control-plane components from the slides — API server, etcd, scheduler,
controller-manager — run as Pods in the `kube-system` namespace on a
self-hosted/kind cluster.

#### kind path (you own the cluster)

```bash
kubectl get pods -n kube-system
```

#### Namespace path (shared cluster, read-only alternative)

`kube-system` isn't yours to read on a shared cluster. Explore what **is** — your own
namespace:

```bash
kubectl describe namespace "$NS"
kubectl get all -n "$NS"
```

---

### Step 4 — break it on purpose: a typo `explain`

Every lab has a deliberate **break→fix**. Here it's the most common `kubectl` slip:
a mistyped field path. Watch it fail, read the error, then fix it.

```bash
kubectl explain pod.spce      # typo: "spce" instead of "spec"
```

**Task:** run it. It must **fail**. Read the error, then run the corrected command.

**Question:** why is a typo in `explain` harmless, but a typo in a manifest you
`apply` might not be?

---

### Step 5 — see reconciliation: spec vs status on a live object

The slides said reconciliation drives **status** (observed) toward **spec** (desired).
Every object carries both halves — read them on something already running.

Pick any existing object. On **kind**, a `kube-system` Pod works; on a **shared**
cluster where your namespace is empty, every Namespace object also has `spec`/`status`,
so use that as the fallback.

```bash
# kind (or anywhere you can read a Pod):
kubectl get pods -n kube-system \
  -l component=kube-apiserver -o yaml | head -40

# shared, namespace-only fallback — every object has spec/status:
kubectl get namespace "$NS" -o yaml
```

**Task:** in the YAML, find the top-level `spec:` block and the top-level `status:`
block. Note that you *wrote* nothing in `status` — the system did.

**Question:** which component *writes* the `status` of a Pod, and which component
decided *which node* the Pod's `spec` runs on?

---

## Observe

- `kubectl get nodes -o wide` shows a `CONTAINER-RUNTIME` of `containerd`/`cri-o` —
  the CRI stack from S01 (or a `Forbidden` you can explain, on a locked-down shared
  cluster).
- `kubectl api-resources` distinguishes namespaced kinds from cluster-scoped ones.
- `kubectl explain` answers schema questions authoritatively and **rejects** a typo'd
  field path instead of guessing.
- On kind, the control plane is visible as Pods in `kube-system`; on a shared cluster,
  it isn't yours to read — and that's correct.
- Every live object has a `spec` (desired, you write) and a `status` (observed, the
  system writes) — reconciliation is the loop between them.

---

## Challenge

`explain` has a `--recursive` mode that prints the whole tree of a kind — handy for
discovering fields you didn't know existed.

**Difficulty:** Beginner

**Success criteria:** Locate the readiness and liveness probe fields without using web
search, name their full field paths, and explain where they sit below `pod.spec`.

**Hints:** Pipe recursive output through `grep -i -E 'readiness|liveness'`, then confirm
each result with a focused `kubectl explain` command.

```bash
kubectl explain pod.spec --recursive | head -40
```

[Spoiler: challenge solution](./03-cluster-tour.solution.md#challenge-solution)

## Verify

Repeat the two observations that work in both supported environments.

```bash
kubectl api-resources --namespaced=true | head
kubectl get pods -n "$NS" -o custom-columns=NAME:.metadata.name,DESIRED:.spec.containers[*].name,PHASE:.status.phase
```

Expected: the first command lists namespaced API kinds; the second prints desired and
observed fields for every Pod you may read. An empty Pod list is also a valid state.

## Cleanup / reset

This lab is **read-only** — you created nothing, so there's nothing to delete. The only
"reset" is to re-confirm you're pointed at the right place before the next lab, which
*does* create objects:

```bash
kubectl config view --minify | grep namespace:    # still your $NS?
kubectl config current-context                     # still your cluster?
```
