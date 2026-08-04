# Lab 16 — Autoscaling (HPA) (S16) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl top nodes
NAME                 CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
kind-control-plane   180m         2%     1200Mi          15%

$ kubectl top pods -A | head
NAMESPACE     NAME                              CPU(cores)   MEMORY(bytes)
kube-system   coredns-...                       3m           14Mi
kube-system   metrics-server-...                5m           18Mi
```

If `kubectl top` returns numbers, the HPA has a metric source. If it still says
`Metrics API not available`, metrics-server hasn't collected a sample yet (wait a bit) or the
`--kubelet-insecure-tls` patch didn't apply — re-check `kubectl -n kube-system get deploy
metrics-server -o jsonpath='{..args}'`. **Remember this symptom:** a broken metrics-server ALSO
makes an HPA read `<unknown>` — that's a *different* cause from the missing-request break in Step 4.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%   2         10        2          60s
```

`TARGETS cpu: 0%/50%` = "current average CPU is ~0% of the request, target is 50%." The app is
idle, so the HPA holds at `minReplicas: 2`. If you instead see `cpu: <unknown>/50%`, either
metrics-server hasn't produced a sample yet (wait) or the Deployment is missing `requests.cpu`
(you'll do that deliberately in Step 4). Note you set `replicas: 2` in the Deployment as a
*starting point* — from now on the HPA owns that field; don't `kubectl scale` it by hand.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get hpa web -w
NAME   REFERENCE        TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%     2         10        2          3m
web    Deployment/web   cpu: 240%/50%   2         10        2          3m30s
web    Deployment/web   cpu: 240%/50%   2         10        4          3m45s
web    Deployment/web   cpu: 130%/50%   2         10        8          4m30s
web    Deployment/web   cpu: 55%/50%    2         10        10         5m30s
```

The load pushes average CPU well over the target, so the HPA applies
`ceil(current × util/target)` and adds Pods — you'll see `REPLICAS` step up (2 → 4 → 8 → 10) as it
re-evaluates every ~15s. Notice `TARGETS` **falls as REPLICAS rises**: the same total load spread
over more Pods is less CPU per Pod. It stops at `maxReplicas: 10` even if `TARGETS` is still above
50% — `max` is the hard ceiling. The exact numbers depend on your machine; the shape (over target →
climb → per-Pod CPU eases) is the point.
</details>

**Question:** `TARGETS` briefly read `240%/50%` — how can a Pod's CPU utilization be over 100%?

<details><summary>Answer</summary>

Utilization here is **relative to the `requests.cpu` (200m)**, not to a whole core.
`240%` means the Pods were averaging ~`480m` of actual CPU against a `200m` request — they're
allowed to burst above their request up to their `limit` (500m). So "utilization" for HPA is
"actual CPU ÷ requested CPU," which can exceed 100% whenever a Pod uses more than it requested.
That's exactly why a request must exist for the number to mean anything (Step 4).
</details>

---

### Step 3 — stop the load and watch it *linger*

```bash
kubectl delete -f load.yaml       # or: kubectl scale deployment/load --replicas=0
kubectl get hpa web -w            # keep watching — note how long REPLICAS stays high
```

**Task:** time roughly how long it takes `REPLICAS` to fall back to `2` after `TARGETS` drops to
near 0%. It is **not** immediate.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get hpa web -w
NAME   REFERENCE        TARGETS        MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 55%/50%   2         10        10         6m
web    Deployment/web   cpu: 0%/50%    2         10        10         6m30s   # load gone, still 10
web    Deployment/web   cpu: 0%/50%    2         10        10         10m     # ...still holding
web    Deployment/web   cpu: 0%/50%    2         10        2          11m30s  # finally shrinks
```

CPU drops to ~0% almost at once, but `REPLICAS` **stays at 10 for about five minutes** before
collapsing back to `min`. Scale-up was quick; scale-down is deliberately slow. That delay is the
whole point of the next question.
</details>

**Question (the headline):** why did scale-down lag behind the load dropping?

<details><summary>Answer</summary>

Because of the **scale-down stabilization window**, `behavior.scaleDown.stabilizationWindowSeconds`,
which **defaults to 300 seconds (5 minutes)**. When deciding whether to shrink, the HPA looks back
over that window and uses the **highest** replica recommendation in it — so a sudden drop in load
can't immediately shrink the fleet; the low reading has to persist for the whole window first. (The
**scale-up** window defaults to `0` — spikes are met right away.) The asymmetry is intentional:
over-reacting to a brief lull just **thrashes** Pods (and leaves you short right before the next
spike), whereas under-reacting to a spike **drops traffic**. So the HPA errs toward keeping
capacity — **fast up, patient down**. You can tune it under `spec.behavior` if 5 minutes is wrong
for your workload.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: <unknown>/50%   2         10        2          14m

$ kubectl describe hpa web
...
Conditions:
  Type           Status  Reason                   Message
  ----           ------  ------                   -------
  AbleToScale    True    SucceededGetScale        the HPA controller was able to get the target's current scale
  ScalingActive  False   FailedGetResourceMetric  failed to get cpu utilization: missing request for cpu ...
```

`TARGETS <unknown>/50%` and `ScalingActive: False` with **`missing request for cpu`**. Without a
`requests.cpu`, "50% utilization" is undefined, so the HPA gives up computing a desired count and
**freezes at the current replica count** — it can neither scale up under load nor down when idle.
This is the single most common "my HPA does nothing" cause. (Contrast Step 0's `<unknown>`, which
came from metrics-server not serving data — same symptom, different root cause: check
`kubectl top pods` to tell them apart. If `top` works but the HPA is `<unknown>`, it's the missing
request; if `top` itself fails, it's metrics-server.)
</details>

**Task:** restore the request and confirm the HPA recovers.

```bash
kubectl apply -f web.yaml          # the original, WITH requests.cpu
kubectl rollout status deployment/web
kubectl get hpa web -w             # TARGETS goes back to cpu: X%/50%, then Ctrl-C
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%   2         10        2          16m
```

With the request back, the HPA can compute utilization again — `TARGETS` shows a real percentage
and `ScalingActive` returns to `True`. The fix for a real-world `<unknown>` is almost always
"add the missing `requests.cpu`" (or fix metrics-server) — not touching the HPA at all.
</details>

### Stretch (optional) — make scale-down snappier with `behavior`

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

<details><summary>What changes</summary>

You've cut the scale-down stabilization window from 300s to **30s** and capped the rate at
**2 Pods per 15s**. Re-run Steps 2–3: after the load stops, `REPLICAS` now falls back toward `min`
within about half a minute instead of five, stepping down at most 2 at a time. This is exactly the
`spec.behavior.scaleDown` block from the slides — proof that the "slow down" is a **default, not a
law**. (Lowering it too far reintroduces the flapping the window exists to prevent, so 300s is a
sane production default.)
</details>

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

<details><summary>Answer</summary>

Read the **Conditions**. A healthy HPA shows `AbleToScale: True` and **`ScalingActive: True`**
(`ValidMetricFound`) — it's reading a metric and free to act. A stuck one shows
**`ScalingActive: False`** with a reason like `FailedGetResourceMetric` (no metric —
`missing request for cpu`, or metrics-server down) or `FailedGetScale` (can't find the target). The
`ScaleDownStabilized` condition/event also explains a fleet that's holding high after load drops:
it's inside the stabilization window. `TARGETS` reading `<unknown>` in `kubectl get hpa` is the
quick tell; `describe` gives you the *why*.
</details>

## Expected state / output

- **metrics-server** must serve `kubectl top` before an HPA can read anything; on kind it needs
  `--kubelet-insecure-tls` to go Ready.
- With a **CPU-bound** app that declares `requests.cpu`, load pushes `TARGETS` past 50% and the HPA
  ramps `REPLICAS` toward `maxReplicas`; per-Pod CPU **falls** as replicas rise.
- Utilization is **relative to the request**, so `TARGETS` can read **>100%** (bursting above the
  request toward the limit).
- Scale-**up** is quick; scale-**down** waits out the **300s** stabilization window before shrinking.
- Remove `requests.cpu` → `TARGETS <unknown>`, `ScalingActive: False`,
  `FailedGetResourceMetric: missing request for cpu` → the HPA is frozen until you restore it.

Representative statuses include Running/Complete/Failed Pods, Bound PVCs, Accepted
Gateway conditions, or numeric HPA TARGETS — compare meaning, not ephemeral names.

## Explanation

HPA resource metrics are percentages of requests — without a CPU request there is
nothing to divide by. Without metrics-server the HPA cannot read utilization at all.
Distinguishing those failures avoids installing metrics-server when the Deployment
simply omitted requests.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

When HPA `TARGETS` stay `<unknown>` under load, run `kubectl describe hpa -n "$NS"` and look
for `failedGetResourceMetric`. Missing `resources.requests.cpu` is fixed by restoring the
Deployment template — `kubectl apply -f deployment.yaml -n "$NS"` — then confirming
`kubectl get hpa -n "$NS"` shows numeric CURRENT/TARGET. If metrics-server itself is down,
check `kubectl -n kube-system get deploy metrics-server` before blaming the HPA; do not delete
the HPA as the first recovery step.

## Challenge solution

### Commands / manifest

```bash
kubectl describe hpa -n "$NS" | sed -n '/Events:/,$p'
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes >/dev/null && echo metrics-ok
kubectl get deploy -n "$NS" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.template.spec.containers[0].resources}{"\n"}{end}'
kubectl apply -f web.yaml -n "$NS"
kubectl apply -f hpa.yaml -n "$NS"
kubectl get hpa -n "$NS"
```

### Expected state / output

describe names either failed metrics fetch or a missing CPU request (target undefined).
After the fix, HPA shows a numeric target status and can raise the replica count when
load is applied.

### Explanation

HPA resource metrics are percentages of requests — without a CPU request there is
nothing to divide by. Without metrics-server the HPA cannot read utilization at all.
Distinguishing those failures avoids installing metrics-server when the Deployment
simply omitted requests.

### Hints

Read kubectl describe hpa for failedGetResourceMetric; compare Deployment pod
template resources.requests.cpu with metrics-server readiness.
