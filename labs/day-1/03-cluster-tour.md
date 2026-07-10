# Lab 03 — Kubernetes mental model (S03)

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

## Step 1 — the nodes: where your containers actually run

Every Pod runs on a node. Ask the cluster what its nodes look like.

```bash
kubectl get nodes -o wide
```

**Task:** run it and read across one row to the **OS-IMAGE**, **KERNEL-VERSION**, and
**CONTAINER-RUNTIME** columns. That last column is the same runtime stack you met in
S01.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get nodes -o wide
NAME              STATUS   ROLES           AGE   VERSION   INTERNAL-IP   OS-IMAGE                     KERNEL-VERSION   CONTAINER-RUNTIME
workshop-cp       Ready    control-plane   4h    v1.3x.y   172.18.0.2    Debian GNU/Linux 12          6.x.y            containerd://1.7.x
```

- On **kind** you'll typically see one node (`*-control-plane`); a shared cluster
  shows many worker nodes and their roles.
- **CONTAINER-RUNTIME** shows `containerd://…` (or `cri-o://…`) — the CRI runtime the
  kubelet drives. Kubernetes doesn't run containers itself; it tells this runtime to.

</details>

<details><summary>Shared cluster: got <code>Error ... "nodes" is forbidden</code>?</summary>

```console
$ kubectl get nodes -o wide
Error from server (Forbidden): nodes is forbidden: User "..." cannot list
resource "nodes" in API group "" at the cluster scope
```

That's not a mistake — listing nodes is **cluster-scoped**, and your workshop role is
scoped to your namespace (least privilege, exactly as in Lab 00). Note the message and
continue; you don't need node access for the rest of the lab. On **kind** you own the
cluster, so this always works.
</details>

---

## Step 2 — the API is self-documenting

You never need to memorise fields. The cluster ships its own schema.

```bash
kubectl api-resources | head -20      # every kind the cluster understands
kubectl explain pod.spec              # the schema behind a Pod's spec
```

**Task:** run both. In `api-resources`, find the `SHORTNAMES`, `APIVERSION`, and
`NAMESPACED` columns. In `explain`, read the first few fields of `pod.spec`.

<details><summary>Solution / expected output</summary>

```console
$ kubectl api-resources | head -6
NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND
pods          po           v1           true         Pod
services      svc          v1           true         Service
nodes         no           v1           false        Node
namespaces    ns           v1           false        Namespace
deployments   deploy       apps/v1      true         Deployment

$ kubectl explain pod.spec
KIND:       Pod
VERSION:    v1
FIELD: spec <PodSpec>
DESCRIPTION:
    ...
FIELDS:
  containers    <[]Container> -required-
  ...
  restartPolicy <string>
  nodeName      <string>
```

`NAMESPACED=false` marks cluster-scoped kinds (Node, Namespace) — the ones a
namespace-scoped role can't list. `explain` reads the same OpenAPI schema the API
server validates against, so it's always correct for **your** cluster version.
</details>

**Question:** what does `kubectl explain pod.spec.restartPolicy` say the default is?

<details><summary>Answer</summary>

```console
$ kubectl explain pod.spec.restartPolicy
KIND:       Pod
VERSION:    v1
FIELD: restartPolicy <string>
DESCRIPTION:
    Restart policy for all containers within the pod. One of Always, OnFailure,
    Never. ... Default to Always.
```

The default is **`Always`** — which is why a bare Pod's container keeps restarting.
We use this in Lab 05. Reaching for `explain` instead of a web search is the habit to
build.
</details>

---

## Step 3 — find the control plane (or your namespace)

The control-plane components from the slides — API server, etcd, scheduler,
controller-manager — run as Pods in the `kube-system` namespace on a
self-hosted/kind cluster.

### kind path (you own the cluster)

```bash
kubectl get pods -n kube-system
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -n kube-system
NAME                                    READY   STATUS    RESTARTS   AGE
etcd-workshop-control-plane             1/1     Running   0          4h
kube-apiserver-workshop-control-plane   1/1     Running   0          4h
kube-controller-manager-...             1/1     Running   0          4h
kube-scheduler-workshop-control-plane   1/1     Running   0          4h
coredns-...                             1/1     Running   0          4h
kindnet-...                             1/1     Running   0          4h
kube-proxy-...                          1/1     Running   0          4h
```

There they are: `etcd`, `kube-apiserver`, `kube-controller-manager`,
`kube-scheduler` — the four boxes from the slide, running as ordinary Pods. Managed
clouds hide these, but they still exist.
</details>

### Namespace path (shared cluster, read-only alternative)

`kube-system` isn't yours to read on a shared cluster. Explore what **is** — your own
namespace:

```bash
kubectl describe namespace "$NS"
kubectl get all -n "$NS"
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl describe namespace student-07
Name:         student-07
Labels:       kubernetes.io/metadata.name=student-07
Status:       Active
...

$ kubectl get all -n student-07
No resources found in student-07 namespace.
```

An empty namespace is the correct clean state (you built nothing yet). The control
plane is still there doing its job for your namespace — you just can't peek at its
Pods, which is RBAC working as designed.
</details>

---

## Step 4 — break it on purpose: a typo `explain`

Every lab has a deliberate **break→fix**. Here it's the most common `kubectl` slip:
a mistyped field path. Watch it fail, read the error, then fix it.

```bash
kubectl explain pod.spce      # typo: "spce" instead of "spec"
```

**Task:** run it. It must **fail**. Read the error, then run the corrected command.

<details><summary>Solution / expected output</summary>

```console
$ kubectl explain pod.spce
error: field "spce" does not exist
```

*(Exact wording varies slightly by `kubectl` version — the point is it names the bad
field and refuses, rather than guessing.)* Because `explain` validates the path
against the real schema, a typo can't slip through. Fix it:

```console
$ kubectl explain pod.spec
KIND:       Pod
VERSION:    v1
FIELD: spec <PodSpec>
...
```

This is a **safe** break — `explain` only reads schema, so there's nothing to clean
up. Contrast Lab 05, where a bad *manifest* actually creates a failing Pod.
</details>

**Question:** why is a typo in `explain` harmless, but a typo in a manifest you
`apply` might not be?

<details><summary>Answer</summary>

`explain` only **reads** the schema — no object is created or changed. `apply` sends a
manifest to the API server, which creates/updates a real object; a typo there can
produce a broken workload (or, for an unknown field, be rejected or silently dropped
depending on validation). That's why the next labs always pair `apply` with
`kubectl describe` and `get` to confirm what actually happened.
</details>

---

## Step 5 — see reconciliation: spec vs status on a live object

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

<details><summary>Solution / what you're looking at</summary>

```yaml
spec:                     # DESIRED — authored by whoever created the object
  containers:
    - name: kube-apiserver
      image: registry.k8s.io/kube-apiserver:v1.3x.y
status:                   # OBSERVED — written by the kubelet / controllers
  phase: Running
  podIP: 172.18.0.2
  conditions:
    - type: Ready
      status: "True"
```

For the Namespace fallback the blocks are smaller but the shape is identical:

```yaml
spec:
  finalizers: [kubernetes]
status:
  phase: Active
```

`spec` is the request; `status` is reality. Reconciliation is the loop closing the gap
between them — the animation from the slide, on a real object.
</details>

**Question:** which component *writes* the `status` of a Pod, and which component
decided *which node* the Pod's `spec` runs on?

<details><summary>Answer</summary>

- The **kubelet** on the Pod's node writes the Pod's `status` (it observes the real
  containers and reports back through the API server).
- The **scheduler** set `spec.nodeName` — it watched for a Pod with no node and bound
  one. It only *decides*; the kubelet does the running. Both talk **only** to the API
  server, never to etcd directly.

</details>

---

## Expected observations

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

## Cleanup / panic reset

This lab is **read-only** — you created nothing, so there's nothing to delete. The only
"reset" is to re-confirm you're pointed at the right place before the next lab, which
*does* create objects:

```bash
kubectl config view --minify | grep namespace:    # still your $NS?
kubectl config current-context                     # still your cluster?
```

<details><summary>Not on your namespace/context?</summary>

Re-select it exactly as in Lab 00:

```bash
kubectl config set-context --current --namespace="$NS"
```

If a command earlier left you on a wrong context, `kubectl config use-context <name>`
switches back (`kubectl config get-contexts` lists the valid names).
</details>

## Stretch (optional)

`explain` has a `--recursive` mode that prints the whole tree of a kind — handy for
discovering fields you didn't know existed.

```bash
kubectl explain pod.spec --recursive | head -40
```

<details><summary>What you're looking at</summary>

The full nested field tree of `pod.spec` with no descriptions — a fast map of
everything a Pod spec *can* contain. Pipe it to `grep` to hunt a field, e.g.
`kubectl explain pod.spec --recursive | grep -i probe` to preview the health-probe
fields you'll meet in S14.
</details>
