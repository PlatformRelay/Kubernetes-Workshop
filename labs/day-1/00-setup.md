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

- **One** of the two environments:
  - **Shared cluster:** a kubeconfig from your facilitator and an **assigned namespace**
    (e.g. `student-07`), plus `kubectl` on your `PATH`. You do **not** need cluster-admin.
  - **Local kind cluster:** a **container engine** (Docker or Podman) and this repo cloned.
    You run **one command** (`./workshop up`) — it installs the pinned tools (kubectl, kind,
    …) and creates your cluster. See [`../../docs/setup.md`](../../docs/setup.md) for engine
    choice (incl. the Docker Desktop licensing note) and the Windows/WSL2 path.
- A terminal you can copy-paste into. No prior labs.

## Files used

- **None.** On the kind path, the cluster config lives in `infra/kind/cluster.yaml` and is
  managed for you by `./workshop`; you create no files in this lab.

---

## Step 0 — first task: confirm your machine is lab-ready

Every later lab has a spoiler; so does this one. **Get to a verified starting state before
any content.** Do the task that matches your environment.

### kind path — one command

From the repo root, bring up (or re-check) your local cluster:

```bash
./workshop up          # preflight → pinned tools → kind cluster → doctor
```

`up` finishes by running `./workshop doctor`, which checks the engine, tool versions, the
cluster, its nodes, and a throwaway smoke Pod. A green summary means you're ready.

<details><summary>Solution / expected output — kind path</summary>

```console
$ ./workshop up
workshop up — bring up a local, lab-ready kind cluster
[ OK ] container engine reachable: docker
[ OK ] toolchain installed and verified against mise.lock
[ OK ] kind cluster 'workshop' ready

Running doctor to confirm the environment is lab-ready…
[PASS] container engine reachable (docker)
[PASS] kind v0.32.0 matches pin (v0.32.0)
[PASS] kubectl v1.36.1 matches pin (v1.36.1)
[PASS] kind cluster 'workshop' exists
[PASS] cluster answers the API (context kind-workshop)
[PASS] all nodes Ready (1/1)
[PASS] smoke Pod ran to completion and was cleaned up

doctor: 7 passed, 0 warnings, 0 failed
[ OK ] environment is ready — start with labs/day-1/00-setup.md
```

Re-run `./workshop doctor` any time to re-check. A `[WARN]` (e.g. a version drift) is fine;
a `[FAIL]` prints a targeted fix hint — the common one is "run: make kind-up", which
`./workshop up` does for you.
</details>

### Shared-cluster path — reach your cluster

`./workshop doctor` is for the local kind cluster only, so on a shared cluster your first
task is instead to confirm `kubectl` reaches the cluster your facilitator gave you. That is
exactly Step 1 below — start there.

---

## Step 1 — confirm kubectl and reach a cluster

Set a shell variable for your working namespace now; **every later command reuses `$NS`.**
On the shared cluster, use the namespace your facilitator assigned. On kind, your cluster
came up in Step 0 — we create a `workshop` namespace in Step 2; use `workshop` there.

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

Your cluster already exists — `./workshop up` created it in Step 0 and switched your kubectl
context to `kind-workshop`. Now just create a `workshop` namespace and make it your default:

```bash
kubectl create namespace workshop
kubectl config set-context --current --namespace=workshop
kubectl config view --minify | grep namespace:
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl create namespace workshop
namespace/workshop created

$ kubectl config set-context --current --namespace=workshop
Context "kind-workshop" modified.

$ kubectl config view --minify | grep namespace:
    namespace: workshop
```

`./workshop up` already pointed kubectl at `kind-workshop`, so `set-context` here just
changes the **default namespace** within that context. (If you ever need to recreate the
cluster from scratch, `./workshop down && ./workshop up` is the full reset.)
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
recognise the failure later. Here it's the most common one of all: `kubectl` with **no context
selected**. Save your current context, unset it so `kubectl` has nowhere to talk to, watch it
fail, then switch back.

```bash
CURRENT=$(kubectl config current-context)   # remember your real context
kubectl config unset current-context        # break it: no context is now selected
kubectl get pods                            # this now fails — read the error
```

**Task:** run all three. The last command must **fail**. Read the error text before fixing it —
you'll restore the context in the next block.

<details><summary>Solution / expected output</summary>

```console
$ CURRENT=$(kubectl config current-context)
$ kubectl config unset current-context
Property "current-context" unset.
$ kubectl get pods
error: current-context must exist in order to minify
```

With no `current-context`, `kubectl` doesn't know **which cluster** to talk to, so it refuses
before it ever hits the network. A close cousin you'll meet in the wild is a context that *is*
set but points nowhere reachable:

```console
The connection to the server localhost:8080 was refused - did you specify the right host or port?
```

Same lesson, different layer: **no context** → fix the *context*; **connection refused** → the
context is fine but the *cluster/network* isn't.
</details>

**Task:** switch back to your real context and confirm `kubectl` works again.

```bash
kubectl config use-context "$CURRENT"       # restore what you saved above
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl config use-context "$CURRENT"
Switched to context "workshop-shared".        # or "kind-workshop"
```

If `$CURRENT` is empty (e.g. a fresh terminal), pass the name directly:
`kubectl config use-context workshop-shared` (shared) or `kind-workshop` (kind).
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
$ ./workshop down && ./workshop up   # then re-do Step 2's namespace commands
```

`./workshop down` deletes the cluster (it asks you to confirm; add `--yes` to skip the
prompt) and `./workshop up` recreates it from the same pinned config. Never do this on a
shared cluster — you would delete everyone's work. There, the scoped
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
