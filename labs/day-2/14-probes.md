# Lab 14 — Health probes (S14)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S14 — Health probes |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin; everything runs in your own namespace)* |
| **Estimated time** | 30 min |

## Objective

Make the difference between the three probes *physical*. You will add **readiness**,
**liveness**, and **startup** probes to the through-line `web` Deployment, then break each on
purpose and watch the outcomes diverge:

- **readiness ✗** → the Pod stays `Running` but leaves its Service's **EndpointSlice**, so it
  gets no traffic — and because the other replicas keep serving, users see **zero downtime**.
- **liveness ✗** → the kubelet **restarts** the container (`RESTARTS ↑`) and, if it stays
  broken, drops it into **CrashLoopBackOff**.
- **startup** → shepherds a deliberately slow-starting container past a liveness probe that
  would otherwise kill it mid-boot.

The one contrast to leave with: **readiness drains traffic, liveness restarts the container** —
same-looking failure, opposite response.

> **Set your namespace once.** Everything runs in your assigned namespace (or a kind cluster).
> Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–07 concepts (Pod, Deployment, Service/EndpointSlice). This lab **creates its own**
  objects and doesn't depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights.
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1`, `curlimages/curl`, and
  `busybox:1.37` (the slow-starter stand-in).
- A way to send HTTP from inside the cluster — the steps use a throwaway `curl` Pod; no
  external LoadBalancer or Ingress is needed (ClusterIP only).

## Files used

- `deployment-probes.yaml` — the `web` Deployment (3 replicas) with **all three** probes; its
  container/probe block mirrors the slide's final magic-move frame.
- `service.yaml` — a ClusterIP `web` Service selecting `app: s14`.
- `broken/deployment-broken-liveness.yaml` — liveness pointed at a **dead port** → constant
  restarts.
- `broken/deployment-broken-readiness.yaml` — every Pod started with `FAIL_READY=1`, so
  readiness **fails from boot** for the whole Deployment → a rollout that stalls (stretch).
- `slowstart-noguard.yaml` / `slowstart.yaml` — a slow-booting container **without** and
  **with** a startup probe.

Everything is labelled `app: s14`, so cleanup is a single label selector.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./14-probes.solution.md#guided-solutions)

### Step 0 — a Deployment that reports its own health

Apply the `web` Deployment with all three probes plus its Service, and confirm every Pod
reaches `READY 1/1` and lands in the EndpointSlice.

```bash
cat > deployment-probes.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30          # up to 90s to boot before liveness takes over
EOF

cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s14 }
spec:
  selector: { app: s14 }
  ports:
    - port: 80
      targetPort: 8080
EOF

kubectl apply -f deployment-probes.yaml -f service.yaml
kubectl rollout status deployment/web
```

**Task:** confirm all three Pods are `Ready` and their IPs are in the EndpointSlice.

```bash
kubectl get pods -l app=s14 -o wide
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Question:** the container was `Running` a second after it started, but didn't reach
`READY 1/1` until a moment later. What sat between "Running" and "Ready"?

---

### Step 1 — break→fix readiness on one Pod (zero downtime)

Readiness controls **traffic only**. Break it on a *single* Pod and watch that Pod leave the
EndpointSlice while the Service keeps serving from the other two — no restart, no error to the
caller.

```bash
# pick one Pod and flip its /ready endpoint to failing — no exec, no restart, just an HTTP POST
POD=$(kubectl get pod -l app=s14 -o jsonpath='{.items[0].metadata.name}')
POD_IP=$(kubectl get pod "$POD" -o jsonpath='{.status.podIP}')
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/fail"

# within ~15s (periodSeconds 5 × failureThreshold 3) it flips to NotReady
kubectl get pod "$POD" -w        # Ctrl-C once READY shows 0/1
```

> The demo app was built for exactly this: `POST /fail` makes its `/ready` endpoint answer
> **503** (the process itself keeps serving normally); `POST /recover` flips it back. We
> target the **Pod IP**, not the Service, so only this one Pod is affected.

**Task:** confirm the broken Pod is still `Running` but has **left** the EndpointSlice, and that
its `RESTARTS` count is unchanged.

```bash
kubectl get pod "$POD"
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Task:** prove **zero downtime** — hammer the Service while one Pod is drained and confirm every
request still gets a `200`.

```bash
kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- \
  sh -c 'for i in $(seq 1 12); do
           curl -s -o /dev/null -w "%{http_code} " http://web.'"$NS"'.svc.cluster.local; sleep 1;
         done; echo'
```

**Task:** fix it — `POST /recover` and watch the Pod rejoin the slice.

```bash
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/recover"
kubectl get pod "$POD" -w        # Ctrl-C once it's back to 1/1
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Question:** readiness failed, yet the app **never restarted**. Why not — and which probe
*would* have restarted it?

---

### Step 2 — break→fix liveness (restarts → CrashLoopBackOff)

Liveness controls **the container's life**. Point it at a port nothing is listening on and the
kubelet will conclude the container is wedged and restart it — over and over.

```bash
mkdir -p broken
cat > broken/deployment-broken-liveness.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: 9999 }   # nothing listens on 9999 → always fails
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
EOF

kubectl apply -f broken/deployment-broken-liveness.yaml
kubectl get pods -l app=s14 -w     # Ctrl-C after RESTARTS climbs a couple of times
```

**Task:** read `RESTARTS` and confirm from `describe` that **liveness** is the cause.

```bash
kubectl get pods -l app=s14
POD=$(kubectl get pod -l app=s14 -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Liveness:/p;/Events:/,$p'
```

**Task:** fix it — re-apply the correct manifest (liveness back on port 8080) and confirm restarts
stop.

```bash
kubectl apply -f deployment-probes.yaml
kubectl rollout status deployment/web
kubectl get pods -l app=s14
```

**Question:** during the break, `RESTARTS` climbed but the Pod objects were never recreated and
never `Deleted`. Which component did the killing, and why didn't a new Pod appear each time?

---

### Step 3 — startup probe: protect a slow starter

A container that takes 20s to boot will be **killed by liveness** long before it's ready —
unless a **startup** probe holds liveness off until the app is up. Show both halves. (The
demo app boots in milliseconds, so it can't play the victim here — instead we fake a slow
starter with busybox: 20 seconds of `sleep` before its tiny `httpd` starts serving.)

First, the trap — a slow starter with liveness but **no** startup probe:

```bash
cat > slowstart-noguard.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slow
  labels: { app: s14 }
spec:
  replicas: 1
  selector:
    matchLabels: { app: s14-slow, role: slow }
  template:
    metadata:
      labels: { app: s14-slow, role: slow }
    spec:
      containers:
        - name: web
          image: busybox:1.37
          command: ["sh", "-c", "sleep 20 && echo up > /tmp/index.html && exec httpd -f -p 8080 -h /tmp"]
          ports: [{ containerPort: 8080 }]     # 20s of sleep before it serves
          livenessProbe:
            httpGet: { path: /, port: 8080 }
            initialDelaySeconds: 3
            periodSeconds: 3
            failureThreshold: 3           # ~12s in, liveness gives up — mid-boot
EOF

kubectl apply -f slowstart-noguard.yaml
kubectl get pod -l role=slow -w        # Ctrl-C after you see RESTARTS climbing
```

**Task:** confirm the container is killed *before it ever finishes booting*.

Now the fix — add a **startup** probe that suspends liveness until the app is up:

```bash
cat > slowstart.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slow
  labels: { app: s14 }
spec:
  replicas: 1
  selector:
    matchLabels: { app: s14-slow, role: slow }
  template:
    metadata:
      labels: { app: s14-slow, role: slow }
    spec:
      containers:
        - name: web
          image: busybox:1.37
          command: ["sh", "-c", "sleep 20 && echo up > /tmp/index.html && exec httpd -f -p 8080 -h /tmp"]
          ports: [{ containerPort: 8080 }]
          startupProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30          # up to 90s to boot — comfortably past 20s
          livenessProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 3
            failureThreshold: 3           # only starts counting AFTER startup passes
EOF

kubectl apply -f slowstart.yaml
kubectl get pod -l role=slow -w        # Ctrl-C once it reaches 1/1 (~25s), RESTARTS 0
```

**Question:** with the same `httpGet /` on both the startup and liveness probes, why does startup
succeed where a plain liveness probe failed?

---

## Observe

- `READY 1/1` requires the **readiness** probe to pass; until then a `Running` Pod is `0/1` and
  stays out of the Service's EndpointSlice.
- **readiness ✗** on one Pod → it stays `Running` with `RESTARTS 0`, leaves the EndpointSlice,
  and the Service serves from the other replicas with **zero downtime**; fix → it rejoins.
- **liveness ✗** → the kubelet restarts the container in place (`RESTARTS ↑`) → **CrashLoopBackOff**
  if it stays broken; the Pod object is never recreated or deleted.
- A **startup** probe suspends readiness and liveness until the app boots, so a slow starter that
  a bare liveness probe would kill mid-boot comes up cleanly.
- `kubectl describe pod` Events are the diagnosis: `Readiness probe failed…` /
  `Liveness probe failed…` is the first place to look when `Running` isn't serving.

## Challenge

Traffic stops reaching one Pod while another Pod restarts in a loop. Decide which
symptom is readiness versus liveness, restore Service endpoints without unnecessary
restarts, and explain why readiness failures must not kill the container.

**Difficulty:** Intermediate

**Success criteria:** Show an endpoint removed for a failed readiness probe and a restart count climb for
failed liveness, restore both probes, and explain the traffic versus process consequence
of each.

**Hints:** Watch kubectl get endpointslices while toggling readiness; use kubectl describe pod
for liveness restart Events.

[Spoiler: challenge solution](./14-probes.solution.md#challenge-solution)

## Verify

Confirm probe evidence before cleanup.

```bash
kubectl get deploy,pods,svc -n "$NS" -l app=s14
kubectl get endpointslices -n "$NS"
```

Expected: the probes Deployment still exists and EndpointSlices reflect Ready Pods
(or the deliberate not-ready state you have not yet fixed).

## Cleanup / reset

Run this last — it removes everything the lab created (the `slow` Deployment carries
`app: s14` on the object itself, so the label selector catches it too).

```bash
# scoped cleanup — everything this lab made is labelled app=s14
kubectl delete deployment,svc -l app=s14 -n "$NS" --ignore-not-found
rm -f deployment-probes.yaml service.yaml slowstart.yaml slowstart-noguard.yaml
rm -rf broken

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete deployment,svc,pod --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

## Stretch (optional) — a rollout that stalls on readiness

Readiness gates the rollout itself. Break readiness for the **whole** Deployment and watch the
rollout refuse to finish — while the old Pods keep serving.

```bash
mkdir -p broken
cat > broken/deployment-broken-readiness.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          env:
            - name: FAIL_READY
              value: "1"                  # the app boots with /ready answering 503 → never Ready
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
EOF

kubectl apply -f broken/deployment-broken-readiness.yaml
kubectl rollout status deployment/web --timeout=40s   # will report it did NOT roll out
kubectl get pods -l app=s14
```
