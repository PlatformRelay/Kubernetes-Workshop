# Lab 04 — kubectl (S04)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S04 — kubectl |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 25 min |

## Objective

Get **fluent** with the tool you'll use for everything else: discover objects with
`get`/`describe`/`explain`, pull exact values with `-o jsonpath`, generate manifests
imperatively with `--dry-run=client -o yaml`, and *feel* the difference between
**client** and **server** dry-run. This lab is **read-only** — you generate YAML but
never `apply` it, so it's safe in any namespace.

## Prerequisites

- **Lab 00** finished — `kubectl` reaches a cluster and `$NS` is your default
  namespace.
- **Lab 03** helps (you met `explain`, `api-resources`, and spec/status) but isn't
  required.
- Both environments follow the same steps (read + dry-run only) and reach the same
  pass/fail results. A couple of commands print a **different error message** on a
  shared cluster than on kind — each is called out where it happens. No cluster-admin.

```bash
export NS=<your-namespace>        # same value as Lab 00 (kind users: workshop)
```

## Files used

- `web.yaml` — generated during the challenge for a non-mutating `kubectl diff`, then removed in
  cleanup. The guided steps create no persistent files or cluster objects.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./04-kubectl.solution.md#guided-solutions)

### Step 1 — the scavenger hunt (discover, don't create)

Answer each question using **only** `get`, `describe`, and `explain`. Every question has
a spoiler — try first, then check.

**Q1.** What is the **default** `restartPolicy` for a Pod?

**Q2.** Your namespace looks empty (`kubectl get all` says so). But list ConfigMaps —
there's already one. What is it, and who created it?

**Q3.** Is a `Deployment` in the same API group as a `Pod`? Use `api-resources`.

**Q4.** According to the schema, is `containers` **required** in a Pod spec?

---

### Step 2 — generate YAML without applying it

The fastest way to a correct manifest is to have `kubectl` write it for you, then edit.
`--dry-run=client` builds the object **locally** and prints it — nothing is created.

```bash
kubectl run web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
```

**Task:** run both. Confirm you get a full manifest on stdout and that
`kubectl get pods` / `kubectl get deploy` still show **nothing** — you created nothing.

**Question:** why do the printed manifests include empty `resources: {}` and
`status: {}` you never asked for?

---

### Step 3 — pull exact values with jsonpath and labels

Tables are for eyes; `-o jsonpath` is for extracting one value (scripts, quick checks).

```bash
# one node's name, no grep/awk:
kubectl get nodes -o jsonpath='{.items[0].metadata.name}{"\n"}'

# filter by label — the kube-system Pods carry component/tier labels (kind):
kubectl get pods -n kube-system -l tier=control-plane
```

**Task:** get a single node name with `jsonpath`. Then, on **kind**, list the
control-plane Pods with a label selector. On a **shared** cluster (no `kube-system`
access), filter your own namespace instead — e.g. `kubectl get configmap -l foo=bar`
(expect an empty list, proving the filter works).

> **Shared cluster:** `get nodes` is cluster-scoped and may return
> `Error ... "nodes" is forbidden` for your namespace-scoped role (same as Lab 03).
> If so, practise `jsonpath` on a namespaced object you *can* read instead:
> `kubectl get configmap kube-root-ca.crt -o jsonpath='{.metadata.name}{"\n"}'`.

**Question:** how is `-l app=web` different from grepping `kubectl get pods | grep web`?

---

### Step 4 — break it on purpose: client says yes, server says no

`--dry-run=client` only renders locally. `--dry-run=server` runs the **full** server
path (validation + admission) and can reject things the client can't see. Prove it with
the cleanest example: a namespace that doesn't exist.

```bash
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=client -o yaml >/dev/null; echo "client exit: $?"
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=server -o yaml >/dev/null; echo "server exit: $?"
```

**Task:** run both. The **client** line must succeed; the **server** line must fail.
Read the server error — its exact text depends on your environment.

**Question:** you're about to `apply` an important manifest. Which dry-run do you run
first, and why?

---

## Observe

- `explain` answers schema questions (defaults, required fields, API group)
  authoritatively — no web search needed.
- `--dry-run=client -o yaml` generates a full manifest and creates **nothing**.
- `-o jsonpath` extracts a single value; `-l` filters server-side by label.
- The **same** manifest can pass `--dry-run=client` and fail `--dry-run=server` — server
  dry-run is the one that tells you the cluster would really accept it.
- After this lab, `kubectl get all` in your namespace is still empty.

---

## Challenge

`kubectl diff` previews a change against the live cluster without applying it. Generate a
manifest, tweak it, and diff — all without creating anything permanent.

**Difficulty:** Intermediate

**Success criteria:** Show the initial create diff, change replicas from one to three,
show the changed diff, and prove no `web` Deployment was persisted.

**Hints:** `kubectl diff` exits 1 when differences exist; inspect its output, then verify
with `kubectl get deployment web --ignore-not-found`.

```bash
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml
kubectl diff -f web.yaml            # shows it would be CREATED (all new lines)
```

[Spoiler: challenge solution](./04-kubectl.solution.md#challenge-solution)

## Verify

Prove that generation and validation remain non-mutating.

```bash
kubectl create deployment contract-check \
  --image=ghcr.io/platformrelay/workshop-web:v1 \
  --dry-run=client -o yaml | kubectl apply --dry-run=server -f -
kubectl get deployment contract-check -n "$NS" --ignore-not-found
```

Expected: server dry-run reports `created (server dry run)`; the second command prints
nothing because no Deployment was persisted.

## Cleanup / reset

You **applied nothing**, so there is nothing in the cluster to delete. If you redirected
any generated manifests to files, they're local — remove them if you like:

```bash
rm -f web.yaml            # or whatever you saved
```
