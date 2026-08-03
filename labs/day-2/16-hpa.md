# Lab 16 — Autoscaling (HPA) (S16)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S16 — Autoscaling (HPA) |
| **Environment** | **kind ✓** (installs a cluster-wide **metrics-server**) · **namespace: read-only alt** (observe a pre-installed HPA — see the end) |
| **Estimated time** | 20 min |

## Objective

Make the replica count a **signal the cluster tracks**, not a number you guess. You will confirm
**metrics-server** is serving CPU, apply a **CPU-bound** Deployment that declares a
`requests.cpu`, wrap it in a **HorizontalPodAutoscaler**, then drive load at it and watch
`REPLICAS` climb toward `max` — and, once the load stops, watch it **linger** before shrinking
(the scale-down stabilization window). Finally you'll break the one thing every HPA depends on —
the CPU **request** — and watch `TARGETS` go `<unknown>`.

> **Why kind-only for the core path?** metrics-server is a **cluster-wide** add-on installed into
> `kube-system`; you need cluster-admin, which you have on kind but not in a shared namespace. If
> you're on a shared cluster, skip to the **read-only namespace alternative** at the bottom.

> **Set your context once.**
>
> ```bash
> kubectl config set-context --current --namespace=default   # kind: default is fine
> export NS=default
> ```

## Prerequisites

- A local **kind** cluster and cluster-admin (`kubectl get nodes` works; you can create objects
  in `kube-system`).
- Internet pull access for `registry.k8s.io/hpa-example` (the classic CPU-burning demo) and
  `busybox:1.37` (the load generator).
- `metrics-server` — installed in **Step 0** if it isn't already present.
- A little patience: the HPA re-evaluates every ~15s and the **scale-down** window is **5 minutes**
  by default, so the last step involves some watching.

## Files used

- `web.yaml` — a CPU-bound Deployment (`hpa-example`, **with `requests.cpu`**) + its Service.
- `hpa.yaml` — an `autoscaling/v2` HPA targeting the Deployment's CPU utilization.
- `load.yaml` — a throwaway Deployment that curls the Service in a tight loop.
- `web-no-requests.yaml` — the Deployment **without** `requests.cpu`, for the break→fix.

Everything is labelled `app: s16`, so cleanup is a single label selector. (Pods use a separate
`run:` label for Service/selector wiring so the load Pods don't get picked up as web endpoints.)

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./16-hpa.solution.md#guided-solutions)

### Step 0 — metrics-server: the HPA's eyes

The HPA reads CPU from the **metrics.k8s.io** API, which **metrics-server** serves. No
metrics-server → no data → the HPA can't compute a target. Check first:

```bash
kubectl top pods -A            # if this prints CPU/MEM, metrics-server is already up — skip ahead
```

If it errors with `Metrics API not available`, install it (kind needs one extra flag):

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# kind's kubelet serves metrics over a self-signed cert; metrics-server rejects it by default and
# never goes Ready. Allow it (kind/dev ONLY — never in production):
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl -n kube-system rollout status deployment/metrics-server   # wait for it to be Available
```

**Task:** confirm metrics-server now serves data (give it ~30–60s after Ready to collect a first
sample).

```bash
kubectl top nodes
kubectl top pods -A | head
```

---

### Step 1 — a CPU-bound app with a request, and an HPA over it

`hpa-example` is a tiny PHP app that burns CPU on every request — unlike the workshop-web demo app, which
answers instantly and would never move the needle. The `requests.cpu: 200m` is the **denominator**
the HPA scales against.

```bash
cat > web.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s16 }
spec:
  replicas: 2
  selector: { matchLabels: { run: web } }
  template:
    metadata:
      labels: { run: web, app: s16 }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example
          ports: [{ containerPort: 80 }]
          resources:
            requests: { cpu: 200m }        # the HPA scales CPU toward 50% of THIS
            limits:   { cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s16 }
spec:
  selector: { run: web }                   # selects the web Pods (NOT the load Pods)
  ports: [{ port: 80, targetPort: 80 }]
EOF

kubectl apply -f web.yaml
kubectl rollout status deployment/web
```

Now the HPA — `autoscaling/v2`, targeting CPU **Utilization** (a percentage of the request):

```bash
cat > hpa.yaml <<'EOF'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
  labels: { app: s16 }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50           # hold avg CPU at 50% of requests.cpu (=100m)
EOF

kubectl apply -f hpa.yaml
```

**Task:** watch the HPA settle at its baseline. Within ~30–60s `TARGETS` should show a real
percentage (near 0%) and `REPLICAS` should sit at `minReplicas` (2).

```bash
kubectl get hpa web -w        # wait for TARGETS to show cpu: X%/50% (not <unknown>), then Ctrl-C
```

---

### Step 2 — pour on load and watch it grow

Run a load generator that hammers the `web` Service in a tight loop. It carries the label
`run: load` (so the `web` Service does **not** treat it as a backend) plus `app: s16` (so cleanup
catches it).

```bash
cat > load.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load
  labels: { app: s16 }
spec:
  replicas: 1
  selector: { matchLabels: { run: load } }
  template:
    metadata:
      labels: { run: load, app: s16 }
    spec:
      containers:
        - name: load
          image: busybox:1.37
          command: ["sh", "-c", "while true; do wget -q -O- http://web >/dev/null; done"]
EOF

kubectl apply -f load.yaml
```

**Task:** watch the HPA react. Over the next 1–3 minutes `TARGETS` should climb **past 50%** and
`REPLICAS` should ramp up toward `max`. (One loop may not be enough on a fast machine — if
`TARGETS` stays low, scale the load up: `kubectl scale deployment/load --replicas=3`.)

```bash
kubectl get hpa web -w        # TARGETS crosses 50%, REPLICAS climbs 2 → … → toward 10
# in another view:
kubectl get pods -l run=web
```

**Question:** `TARGETS` briefly read `240%/50%` — how can a Pod's CPU utilization be over 100%?

---

### Step 3 — stop the load and watch it *linger*

```bash
kubectl delete -f load.yaml       # or: kubectl scale deployment/load --replicas=0
kubectl get hpa web -w            # keep watching — note how long REPLICAS stays high
```

**Task:** time roughly how long it takes `REPLICAS` to fall back to `2` after `TARGETS` drops to
near 0%. It is **not** immediate.

**Question (the headline):** why did scale-down lag behind the load dropping?

---

### Step 4 — break→fix: an HPA with nothing to divide by

The HPA scales on a **percentage of `requests.cpu`**. Take the request away and the percentage has
no denominator.

```bash
cat > web-no-requests.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s16 }
spec:
  replicas: 2
  selector: { matchLabels: { run: web } }
  template:
    metadata:
      labels: { run: web, app: s16 }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example
          ports: [{ containerPort: 80 }]
          # resources.requests.cpu REMOVED — the HPA has no base to compute % against
EOF

kubectl apply -f web-no-requests.yaml
kubectl rollout status deployment/web
kubectl get hpa web            # TARGETS now <unknown>
```

**Task:** confirm the HPA can no longer compute a target, and read *why* from `describe`.

```bash
kubectl get hpa web
kubectl describe hpa web | sed -n '/Conditions/,/Events/p'
```

**Task:** restore the request and confirm the HPA recovers.

```bash
kubectl apply -f web.yaml          # the original, WITH requests.cpu
kubectl rollout status deployment/web
kubectl get hpa web -w             # TARGETS goes back to cpu: X%/50%, then Ctrl-C
```

## Observe

- **metrics-server** must serve `kubectl top` before an HPA can read anything; on kind it needs
  `--kubelet-insecure-tls` to go Ready.
- With a **CPU-bound** app that declares `requests.cpu`, load pushes `TARGETS` past 50% and the HPA
  ramps `REPLICAS` toward `maxReplicas`; per-Pod CPU **falls** as replicas rise.
- Utilization is **relative to the request**, so `TARGETS` can read **>100%** (bursting above the
  request toward the limit).
- Scale-**up** is quick; scale-**down** waits out the **300s** stabilization window before shrinking.
- Remove `requests.cpu` → `TARGETS <unknown>`, `ScalingActive: False`,
  `FailedGetResourceMetric: missing request for cpu` → the HPA is frozen until you restore it.

## Challenge

An HPA never scales despite load. Diagnose a missing CPU request versus a missing
metrics-server, then restore scaling that reacts to load.

**Difficulty:** Intermediate

**Success criteria:** Identify the HPA condition or Event that names the missing signal, restore requests
or metrics-server as appropriate, and show CURRENT/TARGET metrics become numeric or
replicas increase under load.

**Hints:** Read kubectl describe hpa for failedGetResourceMetric; compare Deployment pod
template resources.requests.cpu with metrics-server readiness.

[Spoiler: challenge solution](./16-hpa.solution.md#challenge-solution)

## Verify

Confirm HPA signal path before cleanup.

```bash
kubectl get deploy,hpa,pods -n "$NS" -l app=s16
kubectl describe hpa -n "$NS" | sed -n '/Metrics:/,/Events:/p'
```

Expected: the HPA still exists and either shows numeric TARGETS or a clear condition
explaining why metrics are unavailable.

## Cleanup / reset

```bash
# scoped cleanup — everything this lab made is labelled app=s16
kubectl delete hpa,deployment,service -l app=s16 -n "$NS" --ignore-not-found
kubectl delete pod -l app=s16 -n "$NS" --ignore-not-found
rm -f web.yaml hpa.yaml load.yaml web-no-requests.yaml

# panic reset (namespace): also removes anything else this lab could have left
# kubectl delete hpa,deployment,service,pod --all -n "$NS" --ignore-not-found

# OPTIONAL — remove metrics-server too (only if you installed it for this lab):
# kubectl delete -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

> **Delete the load generator when you're done.** A tight `wget` loop left running will keep the
> HPA scaled up (and burn your laptop's CPU) — `kubectl delete deployment load` stops it.

## Stretch (optional) — make scale-down snappier with `behavior`

The 5-minute scale-down default is conservative. Add a `behavior` block to shrink faster — useful
to *see* scale-down without waiting, and a good feel for the knob from the slides.

```bash
kubectl patch hpa web --type=merge -p '{
  "spec": { "behavior": { "scaleDown": {
    "stabilizationWindowSeconds": 30,
    "policies": [ { "type": "Pods", "value": 2, "periodSeconds": 15 } ]
  } } }
}'
```

---

## Read-only namespace alternative (shared cluster)

You can't install metrics-server or scale nodes in a shared namespace, so the facilitator will
pre-provision a Deployment + HPA under load in your namespace. You **observe** it instead of
building it:

```bash
kubectl get hpa
kubectl describe hpa <name>              # read Conditions + the Events (ScalingActive, scale decisions)
kubectl get hpa <name> -w                # watch TARGETS and REPLICAS move if load is applied
kubectl top pods -l app=<label>          # the raw CPU the HPA is dividing by the request
```

**Question:** from `kubectl describe hpa`, how do you tell whether an HPA is *healthy* versus
*stuck*?

---

> **Delivery note (repo convention).** Manifests here use `autoscaling/v2` and were authored and
> `kubectl apply --dry-run=server`-validated, but the lab was **not executed end-to-end** in the
> authoring environment (the only reachable cluster was a shared production namespace, out of
> bounds for installing metrics-server or creating a load loop). Before rehearsal, run this once in
> a clean **kind** cluster to confirm: metrics-server goes Ready with `--kubelet-insecure-tls` and
> `kubectl top` serves data; a single `load` replica actually pushes `TARGETS` over 50% on your
> hardware (scale it up if not); the exact `REPLICAS` ramp and the ~5-minute scale-down lag; and
> the precise `describe hpa` condition strings (`FailedGetResourceMetric` / `missing request for
> cpu`).
