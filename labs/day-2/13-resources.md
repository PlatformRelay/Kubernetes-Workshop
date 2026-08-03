# Lab 13 — Resources & limits (S13)

<!-- lab-contract:v1 -->

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
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1` and `polinux/stress` (the classic memory-hog image).
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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./13-resources.solution.md#guided-solutions)

### Step 0 — three Pods, three QoS classes

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
      image: ghcr.io/platformrelay/workshop-web:v1
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
      image: ghcr.io/platformrelay/workshop-web:v1
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
      image: ghcr.io/platformrelay/workshop-web:v1
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

**Question:** if you delete the `limits` from `qos-guaranteed` but keep the `requests`, what
QoS class does it become — and what if instead you delete the `requests` and keep only
`limits`?

---

### Step 1 — break→fix: push a container past its memory limit

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

**Question:** the container was `OOMKilled` but immediately came back. Which component killed
it, and which component restarted it?

---

### Step 2 — a namespace aggregate cap (ResourceQuota)

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

---

### Step 3 — break→fix: a Pod that exceeds the quota

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
      image: ghcr.io/platformrelay/workshop-web:v1
      resources:
        requests: { memory: 512Mi }    # 512Mi > the 256Mi requests.memory cap
        limits:   { memory: 512Mi }
EOF

kubectl apply -f quota-buster.yaml
```

**Task:** the create is **rejected**. Read the error — which resource blew the budget, and did
the Pod get created?

**Question:** what happens if you submit a Pod with **no** `resources` while this quota is in
force — and how would a `LimitRange` change that?

## Observe

- QoS class is **derived**, not chosen: **Guaranteed** (all set, `request == limit`),
  **BestEffort** (nothing set), **Burstable** (everything else). Limits-only still → Guaranteed.
- A container over its **memory** limit is **OOMKilled** (`Exit Code 137`) and — with the
  default `restartPolicy: Always` — restarted into **CrashLoopBackOff**.
- The fix is a correct **limit** (or a smaller app), not removing the limit.
- A **ResourceQuota** enforces at **admission**: a Pod exceeding it gets `exceeded quota:` and
  is **never created**; a Pod omitting a constrained resource gets `must specify…`.
- **Runtime** enforcement (kubelet kills/restarts a live Pod) vs **admission** enforcement (API
  server rejects before the Pod exists) — the core mental model of the section.

## Challenge

A Pod disappears or never schedules after a memory spike. Determine whether the
signal is OOMKilled (cgroup limit) or a ResourceQuota / scheduling rejection, then
restore a runnable Pod in the Guaranteed or Burstable class the lab uses.

**Difficulty:** Intermediate

**Success criteria:** Identify the exact reason from describe Events (OOMKilled versus quota), restore a
Running Pod whose resources fit, and show which QoS class status the fixed Pod reports.

**Hints:** Compare kubectl describe pod last state reason with kubectl describe resourcequota;
OOMKilled is a container exit, quota failures often reject create.

[Spoiler: challenge solution](./13-resources.solution.md#challenge-solution)

## Verify

Confirm QoS/quota evidence still exists before cleanup.

```bash
kubectl get pods -n "$NS" -l app=s13 -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass,STATUS:.status.phase
kubectl get resourcequota -n "$NS"
```

Expected: you can still read QoS classes and any ResourceQuota the lab applied.

## Cleanup / reset

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
