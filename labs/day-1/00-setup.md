# Lab 00 — Welcome & setup (S00)

| | |
| --- | --- |
| **Section** | S00 — Welcome & setup |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 15 min |

## Objective

Prove your tooling works **before** any real content: confirm `kubectl` talks to a cluster,
you are pointed at the right context and namespace, and you can create workloads there. By
the end, everyone — whether on a shared cluster or a local kind cluster — is at the **same
verified starting state**.

## Prerequisites

- `kubectl` installed and on your `PATH`.
- **One** of the two environments:
  - **Shared cluster:** a kubeconfig from your facilitator and an **assigned namespace**
    (e.g. `student-07`). You do **not** need cluster-admin.
  - **Local kind cluster:** [`kind`](https://kind.sigs.k8s.io) and a container engine
    (Docker or Podman) installed. You have full admin over your own cluster.
- A terminal you can copy-paste into. No prior labs.

## Files used

- `kind-cluster.yaml` — a minimal kind cluster config (created inline in Step 2, kind path
  only). No other files.

---

## Step 1 — confirm kubectl and reach a cluster

Set a shell variable for your working namespace now; **every later command reuses `$NS`.**
On the shared cluster, use the namespace your facilitator assigned. On kind, we create one
in Step 2 — use `workshop` there.

```bash
export NS=<your-namespace>        # e.g. student-07  (kind users: export NS=workshop)
kubectl version                   # client + server versions
kubectl config current-context    # which cluster am I pointed at?
```

**Task:** run the three commands. Confirm `kubectl version` prints **both** a *Client
Version* and a *Server Version* (a client-only output means you are not reaching a cluster).

<details><summary>Solution / expected output</summary>

```console
$ kubectl version
Client Version: v1.3x.y
Kustomize Version: v5.x.y
Server Version: v1.3x.z

$ kubectl config current-context
workshop-shared          # or "kind-workshop" on a local cluster
```

If you only see `Client Version:` and then a connection error, your kubeconfig is not
loaded or the cluster is unreachable — fix that with your facilitator (shared) or by
finishing Step 2 (kind) before continuing.
</details>

**Question:** your client and server versions differ — is that a problem?

<details><summary>Answer</summary>

Usually no. Kubernetes supports a `kubectl` that is **within one minor version** of the API
server (e.g. a v1.34 client against a v1.33 or v1.35 server). A larger skew can produce
missing fields or odd errors — if you see strange behaviour later, check this first with
`kubectl version`.
</details>

---

## Step 2 — get a namespace you own, and make it your default

Pick the path that matches your environment. **Both paths end identically:** `$NS` exists,
is empty, and is your default namespace so you can drop `-n $NS` from later commands.

### Namespace environment (shared cluster)

Your namespace already exists. Confirm it and set it as your context default:

```bash
kubectl get namespace "$NS"
kubectl config set-context --current --namespace="$NS"
kubectl config view --minify | grep namespace:
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get namespace student-07
NAME         STATUS   AGE
student-07   Active   3h

$ kubectl config set-context --current --namespace=student-07
Context "workshop-shared" modified.

$ kubectl config view --minify | grep namespace:
    namespace: student-07
```

`--minify` collapses the kubeconfig to just the current context, so the `namespace:` line is
the one that will be used by default from now on.
</details>

### kind environment (local cluster)

Create a single-node cluster from a pinned config, then make a `workshop` namespace your
default:

```bash
cat > kind-cluster.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: workshop
nodes:
  - role: control-plane
EOF

kind create cluster --config kind-cluster.yaml
kubectl create namespace workshop
kubectl config set-context --current --namespace=workshop
kubectl config view --minify | grep namespace:
```

<details><summary>Solution / expected output</summary>

```console
$ kind create cluster --config kind-cluster.yaml
Creating cluster "workshop" ...
 ✓ Ensuring node image ...
 ✓ Preparing nodes ...
 ✓ Starting control-plane ...
 ✓ Installing CNI ...
 ✓ Installing StorageClass ...
Set kubectl context to "kind-workshop"

$ kubectl create namespace workshop
namespace/workshop created

$ kubectl config view --minify | grep namespace:
    namespace: workshop
```

`kind create cluster` automatically switches your kubectl context to `kind-workshop`, so the
`set-context` command then just changes the **default namespace** within it.
</details>

---

## Step 3 — confirm you can actually create workloads

Reading is not enough — the first real lab creates a Pod. Check the permission directly with
`kubectl auth can-i` (this asks the API server, so the answer is authoritative for your
identity in **this** namespace).

```bash
kubectl auth can-i create pods -n "$NS"
kubectl auth can-i delete pods -n "$NS"
```

**Task:** both must answer `yes`. If either says `no` on the shared cluster, stop and tell
your facilitator — you have the wrong namespace or a read-only binding.

<details><summary>Solution / expected output</summary>

```console
$ kubectl auth can-i create pods -n student-07
yes
$ kubectl auth can-i delete pods -n student-07
yes
```

On kind you own the cluster, so every answer is `yes`. On the shared cluster you should be
able to create/delete workloads **inside your namespace** but not cluster-scoped objects —
that is expected and correct (least privilege). We test RBAC properly in Lab 19.
</details>

---

## Step 4 — break it on purpose: a wrong context

Every lab in this workshop has a **deliberate break→fix** step — failing safely now means you
recognise the failure later. Here it's the most common one of all: `kubectl` pointed at a
context that doesn't exist. Ask for a context that isn't there, watch it fail, then switch back.

```bash
kubectl config use-context does-not-exist    # typo / stale name on purpose
kubectl get pods                             # this now fails — read the error
```

**Task:** run both. The second command must **fail**. Read the error text before fixing it,
then switch back to your real context and confirm `kubectl` works again.

<details><summary>Solution / expected output</summary>

```console
$ kubectl config use-context does-not-exist
error: no context exists with the name: "does-not-exist"

$ kubectl get pods
error: current-context must exist ...   # or: The connection to the server ... was refused
```

Two different failure shapes, same root cause — kubectl isn't pointed at a live cluster:

- **`no context exists` / `current-context must exist`** — the name is wrong or unset. Fix the
  *context*.
- **`The connection to the server ... was refused`** — the context is fine but the cluster is
  unreachable (down, wrong port, VPN off). Fix the *cluster/network*.

Switch back to the context you set in Step 2 and re-verify:

```console
$ kubectl config use-context workshop-shared     # kind users: kind-workshop
Switched to context "workshop-shared".
```
</details>

**Task (confirm you're really back):** prove the cluster is reachable again. The check differs
slightly per environment.

<details><summary>Solution / expected output — namespace path</summary>

Confirm read scope in your namespace:

```console
$ kubectl get pods
No resources found in student-07 namespace.
```

An empty list (not an error) means you're connected and scoped correctly.
</details>

<details><summary>Solution / expected output — kind path</summary>

Confirm the cluster exists and the control plane answers:

```console
$ kind get clusters
workshop

$ kubectl cluster-info
Kubernetes control plane is running at https://127.0.0.1:PORT
CoreDNS is running at https://127.0.0.1:PORT/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

`cluster-info` printing endpoints (not a connection error) confirms you're back on a live cluster.
</details>

---

## Step 5 — reach the shared "ready" state

Everyone should now have an **empty** working namespace. Confirm nothing is running:

```bash
kubectl get all -n "$NS"
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get all -n student-07
No resources found in student-07 namespace.
```

`No resources found` is the correct, shared ready state for both environments. If you see
leftover objects on a shared namespace, run the panic reset in the next step.
</details>

## Expected observations

- `kubectl version` shows a client **and** a server version.
- `kubectl config view --minify` shows your namespace (`$NS`) as the default.
- `kubectl auth can-i create pods` returns `yes` in your namespace.
- Pointing at a bad context **fails loudly**, and you can read the error and recover from it.
- `kubectl get all` reports **no resources** — you are at the clean starting state.

---

## Cleanup / panic reset

You created nothing to clean up in this lab, but learn the **panic reset now** — every later
lab points back here. It deletes the common namespaced workload objects **scoped to your
namespace**, returning it to the empty state without touching anyone else:

```bash
# Namespace-safe panic reset — deletes YOUR namespace's workloads only.
kubectl delete deploy,rs,sts,ds,job,cronjob,pod,svc,ingress,configmap,secret,pvc \
  --all -n "$NS" \
  --ignore-not-found \
  --field-selector metadata.name!=kube-root-ca.crt   # keep the auto-injected CA configmap
```

<details><summary>When the shared cluster is not enough — kind only</summary>

On kind, the fastest possible reset is to throw the cluster away and rebuild it (≈30 s):

```console
$ kind delete cluster --name workshop
$ kind create cluster --config kind-cluster.yaml   # then re-do Step 2's namespace commands
```

Never do this on a shared cluster — you would delete everyone's work. There, the scoped
`kubectl delete ... -n $NS` above is the correct reset.
</details>

## Stretch (optional)

See the **full** set of actions your identity is allowed in your namespace:

```bash
kubectl auth can-i --list -n "$NS"
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl auth can-i --list -n student-07
Resources          Non-Resource URLs   Resource Names   Verbs
pods               []                  []               [get list watch create update patch delete]
deployments.apps   []                  []               [get list watch create update patch delete]
...
selfsubjectreviews []                  []               [create]
```

Each row is a rule that applies to you here. On kind you will see a `*.*` wildcard row
(cluster-admin). On the shared cluster the list is deliberately narrower — that is RBAC doing
its job, which you'll build yourself in Lab 19.
</details>
