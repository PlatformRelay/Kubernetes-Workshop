# Lab 13 — Resources & limits (S13)

| | |
| --- | --- |
| **Section** | S13 — Resources & limits |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin; a ResourceQuota/LimitRange in your own namespace needs no special rights)* |
| **Estimated time** | 30 min |

## Objective

Feel resource management from both ends. You will read the **QoS class** Kubernetes derives
from your `resources` (Burstable, Guaranteed, BestEffort), force a container **past its memory
limit** and watch it get **OOMKilled** (exit 137) and restarted, then meet the other kind of
enforcement — a **ResourceQuota** that rejects a Pod at **admission** so it never exists. The
whole lab turns on one contrast: **runtime** enforcement (the kubelet kills/throttles a Pod
that misbehaves) vs **admission** enforcement (the API server refuses to create it at all).

> **Set your namespace once.** Everything runs in your assigned namespace (or a kind cluster).
> Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–06 concepts (Pod, Deployment). This lab **creates its own** objects and doesn't
  depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights.
- Internet pull access for `nginx:1.27` and `polinux/stress` (the classic memory-hog image).
- Optional: a metrics pipeline (`kubectl top pods` returns data) for the CPU-throttle stretch.
  Not required for the core lab.

## Files used

- `qos-burstable.yaml` — a Pod with `requests` **and** `limits` that differ → **Burstable**.
- `qos-guaranteed.yaml` — a Pod with `requests == limits` for both cpu & memory → **Guaranteed**.
- `qos-besteffort.yaml` — a Pod with **no** `resources` → **BestEffort**.
- `oom-demo.yaml` — a `polinux/stress` Pod that allocates **past** a tiny memory limit.
- `resourcequota.yaml` — a namespace aggregate cap.
- `quota-buster.yaml` — a Pod that requests **more than the quota allows**.

Everything is labelled `app: s13` so cleanup is a single label selector.

---

## Step 0 — three Pods, three QoS classes

You never type a QoS class — Kubernetes **derives** it from the `resources` you set and shows
it in `kubectl describe pod`. Apply all three variants of the same `web` container and read the
class off each. (They're bare Pods so each maps to exactly one class; the rule is identical
under a Deployment.)

```bash
cat > qos-burstable.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-burstable
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: nginx:1.27
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits:   { cpu: 500m, memory: 256Mi }   # limit != request → Burstable
EOF

cat > qos-guaranteed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: nginx:1.27
      resources:
        requests: { cpu: 200m, memory: 128Mi }
        limits:   { cpu: 200m, memory: 128Mi }   # request == limit, both set → Guaranteed
EOF

cat > qos-besteffort.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-besteffort
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: nginx:1.27
      # no resources block at all → BestEffort
EOF

kubectl apply -f qos-burstable.yaml -f qos-guaranteed.yaml -f qos-besteffort.yaml
kubectl get pods -l app=s13
```

**Task:** read the QoS class of each Pod and match it to the rule.

```bash
for p in qos-burstable qos-guaranteed qos-besteffort; do
  printf '%-16s ' "$p"; kubectl get pod "$p" -o jsonpath='{.status.qosClass}'; echo
done
```

<details><summary>Solution / expected output</summary>

```console
$ for p in qos-burstable qos-guaranteed qos-besteffort; do
    printf '%-16s ' "$p"; kubectl get pod "$p" -o jsonpath='{.status.qosClass}'; echo
  done
qos-burstable    Burstable
qos-guaranteed   Guaranteed
qos-besteffort   BestEffort
```

`kubectl describe pod qos-guaranteed | grep "QoS Class"` shows the same thing
(`QoS Class:  Guaranteed`). The rules, exactly:

- **Guaranteed** — *every* container sets *both* cpu & memory, and for each `request == limit`.
- **BestEffort** — *no* container sets *any* request or limit.
- **Burstable** — anything in between (at least one request/limit set, but not Guaranteed).

</details>

**Question:** if you delete the `limits` from `qos-guaranteed` but keep the `requests`, what
QoS class does it become — and what if instead you delete the `requests` and keep only
`limits`?

<details><summary>Answer</summary>

- **requests only** (no limits) → **Burstable**. It no longer satisfies "every container has a
  limit for both resources," so it drops out of Guaranteed.
- **limits only** (no requests) → still **Guaranteed**. This is the gotcha: when you set a
  limit but no request, Kubernetes **copies the limit into the request**, so `request == limit`
  holds and both are set → Guaranteed. Setting only limits is a valid way to get Guaranteed.

</details>

---

## Step 1 — break→fix: push a container past its memory limit

Memory is **incompressible** — a container that exceeds its memory limit can't be "slowed
down," so the kernel **kills** it. Reproduce it deliberately with `polinux/stress`, which
allocates a fixed amount of memory on demand.

```bash
cat > oom-demo.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]   # wants ~150 MB
      resources:
        requests: { memory: 50Mi }
        limits:   { memory: 100Mi }        # ceiling BELOW what stress allocates
EOF

kubectl apply -f oom-demo.yaml
# watch it die and get restarted — Ctrl-C after a couple of restarts
kubectl get pod oom-demo -w
```

**Task:** the container asks for ~150 MB but is capped at 100Mi. What does `kubectl get`
show, and what does `describe` say killed it?

```bash
kubectl get pod oom-demo
kubectl describe pod oom-demo | sed -n '/State:/,/Restart Count/p'
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod oom-demo
NAME       READY   STATUS             RESTARTS      AGE
oom-demo   0/1     CrashLoopBackOff   3 (24s ago)   95s

$ kubectl describe pod oom-demo
...
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    ...
    Restart Count:  3
```

The container is **OOMKilled** — `Reason: OOMKilled`, `Exit Code: 137` (137 = 128 + signal 9,
`SIGKILL`). Because a Pod's default `restartPolicy` is `Always`, the kubelet keeps restarting
it; each restart OOMs again, so it lands in **CrashLoopBackOff** with `RESTARTS` climbing. A
real memory leak looks exactly like this.
</details>

**Task:** fix it by raising the limit above what the app needs, then confirm it stays up.
(A Pod's `resources` are immutable, so delete and recreate.)

```bash
cat > oom-demo-fixed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
      resources:
        requests: { memory: 50Mi }
        limits:   { memory: 250Mi }        # now comfortably above ~150 MB
EOF

kubectl delete pod oom-demo
kubectl apply -f oom-demo-fixed.yaml
kubectl get pod oom-demo -w        # Ctrl-C once it's Running and RESTARTS stops climbing
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod oom-demo
NAME       READY   STATUS    RESTARTS   AGE
oom-demo   1/1     Running   0          40s
```

With a 250Mi ceiling the ~150 MB allocation fits, nothing is killed, `RESTARTS` stays at 0.
The fix is either **raise the limit** (as here) or **shrink the app's footprint** — never just
"remove the limit," which trades a predictable OOMKill for an unbounded noisy neighbour.
</details>

**Question:** the container was `OOMKilled` but immediately came back. Which component killed
it, and which component restarted it?

<details><summary>Answer</summary>

The **kernel's OOM killer** (driven by the container's cgroup memory limit that the **kubelet**
programmed) sent `SIGKILL` when the process crossed 100Mi. The **kubelet** then restarted the
container per the Pod's `restartPolicy: Always`. Both are **runtime** enforcement — the Pod
existed and was misbehaving. Hold that thought: Step 3's quota rejection happens *before* a Pod
exists at all.
</details>

---

## Step 2 — a namespace aggregate cap (ResourceQuota)

A **ResourceQuota** caps the *sum* of requests/limits (and object counts) across the whole
namespace. Clear the QoS Pods first so the used total starts from a known baseline, then apply
the quota.

```bash
kubectl delete pod qos-burstable qos-guaranteed qos-besteffort oom-demo --ignore-not-found

cat > resourcequota.yaml <<'EOF'
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-cap
  labels: { app: s13 }
spec:
  hard:
    requests.memory: 256Mi     # total reserved memory across all Pods
    limits.memory: 512Mi
    pods: "5"
EOF

kubectl apply -f resourcequota.yaml
kubectl describe resourcequota team-cap
```

**Task:** read how much of the quota is used vs the hard cap.

<details><summary>Solution / expected output</summary>

```console
$ kubectl describe resourcequota team-cap
Name:            team-cap
Namespace:       <ns>
Resource         Used  Hard
--------         ----  ----
limits.memory    0     512Mi
pods             0     5
requests.memory  0     256Mi
```

`Used` is 0 because we deleted the earlier Pods. Every Pod created from now on is checked
against `Hard - Used` **at admission**. (If your namespace already had workloads, `Used`
reflects them — the quota counts everything, not just this lab's objects.)
</details>

---

## Step 3 — break→fix: a Pod that exceeds the quota

```bash
cat > quota-buster.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: quota-buster
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: nginx:1.27
      resources:
        requests: { memory: 512Mi }    # 512Mi > the 256Mi requests.memory cap
        limits:   { memory: 512Mi }
EOF

kubectl apply -f quota-buster.yaml
```

**Task:** the create is **rejected**. Read the error — which resource blew the budget, and did
the Pod get created?

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f quota-buster.yaml
Error from server (Forbidden): error when creating "quota-buster.yaml": pods "quota-buster" is
forbidden: exceeded quota: team-cap, requested: requests.memory=512Mi, used: requests.memory=0,
limited: requests.memory=256Mi

$ kubectl get pod quota-buster
Error from server (NotFound): pods "quota-buster" not found
```

`exceeded quota: team-cap, requested … used … limited …` — the API server refused the Pod at
**admission** because `requests.memory` (512Mi) exceeded the remaining budget (256Mi − 0). The
Pod **was never created** (`NotFound`). Nothing to restart, nothing to kill — it simply doesn't
exist. Fix by requesting within budget:

```console
$ sed 's/512Mi/128Mi/g' quota-buster.yaml | kubectl apply -f -
pod/quota-buster created
```

</details>

**Question:** what happens if you submit a Pod with **no** `resources` while this quota is in
force — and how would a `LimitRange` change that?

<details><summary>Answer</summary>

Once a quota constrains `requests.memory`/`limits.memory`, every Pod **must** specify them.
A Pod that omits them is rejected with a *different* error:

```console
Error from server (Forbidden): ... is forbidden: failed quota: team-cap: must specify
limits.memory,requests.memory
```

That's two distinct admission failures: **`must specify…`** (you left a constrained resource
out) vs **`exceeded quota:`** (you asked for more than the budget). A **LimitRange** in the
namespace fixes the first automatically — it **injects** default requests/limits into Pods that
omit them, so a would-be BestEffort Pod is given values and admitted (as Burstable). Quota sets
the ceiling; LimitRange supplies the defaults that keep bare Pods from tripping it.
</details>

## Expected observations

- QoS class is **derived**, not chosen: **Guaranteed** (all set, `request == limit`),
  **BestEffort** (nothing set), **Burstable** (everything else). Limits-only still → Guaranteed.
- A container over its **memory** limit is **OOMKilled** (`Exit Code 137`) and — with the
  default `restartPolicy: Always` — restarted into **CrashLoopBackOff**.
- The fix is a correct **limit** (or a smaller app), not removing the limit.
- A **ResourceQuota** enforces at **admission**: a Pod exceeding it gets `exceeded quota:` and
  is **never created**; a Pod omitting a constrained resource gets `must specify…`.
- **Runtime** enforcement (kubelet kills/restarts a live Pod) vs **admission** enforcement (API
  server rejects before the Pod exists) — the core mental model of the section.

## Cleanup / panic reset

```bash
# scoped cleanup — everything this lab made is labelled app=s13
kubectl delete pod -l app=s13 -n "$NS" --ignore-not-found
kubectl delete resourcequota team-cap -n "$NS" --ignore-not-found   # frees the namespace cap
rm -f qos-burstable.yaml qos-guaranteed.yaml qos-besteffort.yaml \
      oom-demo.yaml oom-demo-fixed.yaml resourcequota.yaml quota-buster.yaml

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete pod,resourcequota,limitrange --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

> **Delete the ResourceQuota when you're done.** While it exists, *every* Pod in the namespace
> must set requests/limits — leaving it in place will make the next lab's bare Pods fail with
> `must specify…`.

## Stretch (optional) — CPU throttling: slow, but never killed

Prove the other half of the asymmetry. CPU is **compressible**, so a container over its CPU
limit is **throttled** (capped share) rather than killed — it stays `Running`.

```bash
cat > cpu-hog.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: cpu-hog
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--cpu", "2"]              # tries to burn 2 cores
      resources:
        requests: { cpu: 100m }
        limits:   { cpu: 200m }         # ...but capped at 0.2 core
EOF

kubectl apply -f cpu-hog.yaml
kubectl get pod cpu-hog                 # STATUS stays Running, RESTARTS stays 0
kubectl top pod cpu-hog                 # if metrics-server is present: ~200m, pinned at the limit
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl get pod cpu-hog
NAME      READY   STATUS    RESTARTS   AGE
cpu-hog   1/1     Running   0          30s

$ kubectl top pod cpu-hog          # requires metrics-server
NAME      CPU(cores)   MEMORY(bytes)
cpu-hog   200m         1Mi
```

`stress` wants two full cores but the cgroup CPU quota clamps it to `200m`. The container is
**never killed** — `RESTARTS` stays 0 and `STATUS` stays `Running` — it just runs slow. That's
the whole asymmetry: **memory over limit → killed**, **CPU over limit → throttled**. If `top`
returns `error: Metrics API not available`, your cluster has no metrics-server; the `get pod`
line (Running, 0 restarts) already makes the point. Clean up: `kubectl delete pod cpu-hog`.
</details>
