# Lab 14 — Health probes (S14)

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
- Internet pull access for `nginx:1.27` and `curlimages/curl`.
- A way to send HTTP from inside the cluster — the steps use a throwaway `curl` Pod; no
  external LoadBalancer or Ingress is needed (ClusterIP only).

## Files used

- `deployment-probes.yaml` — the `web` Deployment (3 replicas) with **all three** probes; its
  container/probe block mirrors the slide's final magic-move frame.
- `service.yaml` — a ClusterIP `web` Service selecting `app: s14`.
- `broken/deployment-broken-liveness.yaml` — liveness pointed at a **dead port** → constant
  restarts.
- `broken/deployment-broken-readiness.yaml` — readiness pointed at a **missing path** for the
  whole Deployment → a rollout that stalls (stretch).
- `slowstart-noguard.yaml` / `slowstart.yaml` — a slow-booting container **without** and
  **with** a startup probe.

Everything is labelled `app: s14`, so cleanup is a single label selector.

---

## Step 0 — a Deployment that reports its own health

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
          image: nginx:1.27
          ports: [{ containerPort: 80 }]
          readinessProbe:
            httpGet: { path: /ready.html, port: 80 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 3
            failureThreshold: 30          # up to 90s to boot before liveness takes over
          lifecycle:
            postStart:
              exec: { command: ["sh", "-c", "echo ok > /usr/share/nginx/html/ready.html"] }
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
      targetPort: 80
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p    1/1     Running   0          40s
web-7d9c8b6c5-9m7xq    1/1     Running   0          40s
web-7d9c8b6c5-pv6tn    1/1     Running   0          40s

$ kubectl get endpointslices -l kubernetes.io/service-name=web \
    -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
10.244.0.7 10.244.0.8 10.244.0.9
```

`READY 1/1` means the **readiness** probe passed (`postStart` wrote `/ready.html`, so
`httpGet /ready.html` returns 200). Three Ready Pods → three addresses in the EndpointSlice →
the Service load-balances across all three.
</details>

**Question:** the container was `Running` a second after it started, but didn't reach
`READY 1/1` until a moment later. What sat between "Running" and "Ready"?

<details><summary>Answer</summary>

The **readiness probe**. `Running` means nginx's process started; `Ready` means the readiness
probe has since returned success at least once. Until then the Pod is `Running` but `0/1` and
is **kept out of the EndpointSlice** — which is exactly why a rolling update never sends traffic
to a half-started replica. (The **startup** probe also gates this: readiness doesn't even begin
until startup passes.)
</details>

---

## Step 1 — break→fix readiness on one Pod (zero downtime)

Readiness controls **traffic only**. Break it on a *single* Pod and watch that Pod leave the
EndpointSlice while the Service keeps serving from the other two — no restart, no error to the
caller.

```bash
# pick one Pod and delete the file its readiness probe checks
POD=$(kubectl get pod -l app=s14 -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- rm /usr/share/nginx/html/ready.html

# within ~15s (periodSeconds 5 × failureThreshold 3) it flips to NotReady
kubectl get pod "$POD" -w        # Ctrl-C once READY shows 0/1
```

**Task:** confirm the broken Pod is still `Running` but has **left** the EndpointSlice, and that
its `RESTARTS` count is unchanged.

```bash
kubectl get pod "$POD"
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod "$POD"
NAME                  READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p   0/1     Running   0          5m

$ kubectl get endpointslices -l kubernetes.io/service-name=web \
    -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
10.244.0.8 10.244.0.9
```

`READY 0/1`, `STATUS Running`, `RESTARTS 0` — the Pod is alive and untouched, it just failed
readiness (nginx now 404s `/ready.html`), so the endpoint controller **removed its IP** from the
slice. Two addresses remain. `describe pod "$POD"` shows the event
`Readiness probe failed: HTTP probe failed with statuscode: 404`.
</details>

**Task:** prove **zero downtime** — hammer the Service while one Pod is drained and confirm every
request still gets a `200`.

```bash
kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- \
  sh -c 'for i in $(seq 1 12); do
           curl -s -o /dev/null -w "%{http_code} " http://web.'"$NS"'.svc.cluster.local; sleep 1;
         done; echo'
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- sh -c '...'
200 200 200 200 200 200 200 200 200 200 200 200
pod "curl-s14" deleted
```

Every request returns `200`. The ClusterIP only routes to endpoints in the slice, and the two
Ready Pods absorb all of it. This is the readiness contract: a Pod that isn't ready is
**invisible to the Service**, so draining it costs the user nothing. (If a request had somehow
hit the broken Pod on the app path it would still be served — nginx is up; only the readiness
*path* 404s.)
</details>

**Task:** fix it — recreate the file and watch the Pod rejoin the slice.

```bash
kubectl exec "$POD" -- sh -c 'echo ok > /usr/share/nginx/html/ready.html'
kubectl get pod "$POD" -w        # Ctrl-C once it's back to 1/1
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod "$POD"
NAME                  READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p   1/1     Running   0          7m

# EndpointSlice is back to three addresses
10.244.0.7 10.244.0.8 10.244.0.9
```

Readiness passes again → the Pod rejoins the slice, still with `RESTARTS 0`. Readiness is
**fully reversible**: it never touches the process, only the Pod's membership in the Service.
</details>

**Question:** readiness failed, yet the app **never restarted**. Why not — and which probe
*would* have restarted it?

<details><summary>Answer</summary>

Because **readiness and liveness are separate checks with separate jobs**. Readiness only
decides *"send this Pod traffic?"* — a failure removes it from endpoints and nothing more. The
container keeps running untouched (`RESTARTS 0`). Only the **liveness** probe restarts a
container, and in this manifest liveness probes `/` (the nginx index, still `200`), so it stayed
happy the whole time. That separation is deliberate: you never want a "not ready yet" state to
trigger a restart. Next step breaks liveness to see the other outcome.
</details>

---

## Step 2 — break→fix liveness (restarts → CrashLoopBackOff)

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
          image: nginx:1.27
          ports: [{ containerPort: 80 }]
          readinessProbe:
            httpGet: { path: /ready.html, port: 80 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /, port: 9999 }   # nothing listens on 9999 → always fails
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 3
            failureThreshold: 30
          lifecycle:
            postStart:
              exec: { command: ["sh", "-c", "echo ok > /usr/share/nginx/html/ready.html"] }
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS             RESTARTS      AGE
web-6c4f9b7d8-2xq4l    0/1     CrashLoopBackOff   3 (18s ago)   90s
web-6c4f9b7d8-7bkdp    0/1     Running            2 (25s ago)   90s
web-6c4f9b7d8-lm9rt    0/1     CrashLoopBackOff   3 (11s ago)   90s

$ kubectl describe pod "$POD"
    Liveness:  http-get http://:9999/ delay=0s timeout=1s period=10s #success=1 #failure=3
...
Events:
  Warning  Unhealthy  ...  Liveness probe failed: Get "http://10.244.0.11:9999/": connect: connection refused
  Normal   Killing    ...  Container web failed liveness probe, will be restarted
```

The rolling update replaced the Pods; each new one's liveness probe hits port `9999`, gets
`connection refused`, fails 3× (≈30s), and the kubelet **kills and restarts** the container.
Every restart repeats the cycle → `RESTARTS` climbs → **CrashLoopBackOff** (the kubelet backs
off exponentially between restarts). Note the phase is still `Running`/`CrashLoopBackOff`, never
`Deleted` — liveness restarts the *container*, it never recreates the Pod.
</details>

**Task:** fix it — re-apply the correct manifest (liveness back on port 80) and confirm restarts
stop.

```bash
kubectl apply -f deployment-probes.yaml
kubectl rollout status deployment/web
kubectl get pods -l app=s14
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-c8n2v    1/1     Running   0          30s
web-7d9c8b6c5-h4rqd    1/1     Running   0          28s
web-7d9c8b6c5-tz9wp    1/1     Running   0          26s
```

Liveness on `/` (port 80) returns `200`, so nothing gets restarted — `RESTARTS 0`, all `1/1`.
The fix for a real flapping-liveness incident is the same shape: correct the target, loosen the
timing, or move slow-boot tolerance to a **startup** probe (next step) — never just delete the
liveness probe, which throws away your self-healing.
</details>

**Question:** during the break, `RESTARTS` climbed but the Pod objects were never recreated and
never `Deleted`. Which component did the killing, and why didn't a new Pod appear each time?

<details><summary>Answer</summary>

The **kubelet** (on the node) killed and restarted the **container inside the existing Pod**,
per the Pod's default `restartPolicy: Always`. That's an *in-place* container restart —
`RESTARTS` counts it, but the Pod object, its name, and its IP stay the same. A new Pod only
appears if the **Deployment/ReplicaSet controller** replaces it (e.g. the rollout you triggered),
which is a different mechanism. Liveness = restart the container; it never deletes or recreates
the Pod.
</details>

---

## Step 3 — startup probe: protect a slow starter

A container that takes 20s to boot will be **killed by liveness** long before it's ready —
unless a **startup** probe holds liveness off until the app is up. Show both halves.

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
          image: nginx:1.27
          command: ["sh", "-c", "sleep 20 && nginx -g 'daemon off;'"]  # 20s before it serves
          ports: [{ containerPort: 80 }]
          livenessProbe:
            httpGet: { path: /, port: 80 }
            initialDelaySeconds: 3
            periodSeconds: 3
            failureThreshold: 3           # ~12s in, liveness gives up — mid-boot
EOF

kubectl apply -f slowstart-noguard.yaml
kubectl get pod -l role=slow -w        # Ctrl-C after you see RESTARTS climbing
```

**Task:** confirm the container is killed *before it ever finishes booting*.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS             RESTARTS      AGE
slow-5f7b9c6d4-kk8wp    0/1     CrashLoopBackOff   3 (20s ago)   2m
```

Liveness starts probing at `initialDelaySeconds: 3`; nginx is still in its `sleep 20`, so `/`
gets `connection refused`. Three misses (≈12s) and the kubelet kills it — **mid-boot**. It never
reaches the 20s mark, so it can never come up. This is exactly why bolting `initialDelaySeconds`
onto liveness is fragile: you're guessing the boot time, and a bad guess is a permanent
CrashLoop.
</details>

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
          image: nginx:1.27
          command: ["sh", "-c", "sleep 20 && nginx -g 'daemon off;'"]
          ports: [{ containerPort: 80 }]
          startupProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 3
            failureThreshold: 30          # up to 90s to boot — comfortably past 20s
          livenessProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 3
            failureThreshold: 3           # only starts counting AFTER startup passes
EOF

kubectl apply -f slowstart.yaml
kubectl get pod -l role=slow -w        # Ctrl-C once it reaches 1/1 (~25s), RESTARTS 0
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS    RESTARTS   AGE
slow-6d8c7f5b9-p2mtq    1/1     Running   0          35s
```

While the **startup** probe is failing (during the 20s sleep), the **liveness** probe is
*suspended* — it doesn't even run, so it can't kill the container. Around 20–21s nginx comes up,
startup passes once, and only then does liveness take over. Result: a clean boot, `RESTARTS 0`.
Same slow container, opposite outcome — the startup probe is the difference. (This Pod has no
readiness probe, so `1/1` here just means the container is up; readiness gating is Step 0–1's
story.)
</details>

**Question:** with the same `httpGet /` on both the startup and liveness probes, why does startup
succeed where a plain liveness probe failed?

<details><summary>Answer</summary>

Because of **when** each runs and **how forgiving** it is. The startup probe runs *first* and has
a generous budget (`failureThreshold 30 × periodSeconds 3 = 90s`), so it patiently waits out the
20s boot. Crucially, **liveness is held off entirely until startup succeeds** — so the tight
liveness threshold never sees the not-yet-listening app. Once startup passes, liveness begins
with a fresh count against an app that's already up. Startup answers "has it booted *yet*?";
liveness answers "is it *still* alive?" — and separating those two questions is the whole point
of the startup probe.
</details>

---

## Expected observations

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
          image: nginx:1.27
          ports: [{ containerPort: 80 }]
          readinessProbe:
            httpGet: { path: /never-here.html, port: 80 }   # 404 forever → never Ready
            periodSeconds: 5
            failureThreshold: 3
EOF

kubectl apply -f broken/deployment-broken-readiness.yaml
kubectl rollout status deployment/web --timeout=40s   # will report it did NOT roll out
kubectl get pods -l app=s14
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl rollout status deployment/web --timeout=40s
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
error: timed out waiting for the condition

$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-6b9f7c8d5-r4k9x    0/1     Running   0          45s   # new ReplicaSet, never Ready
web-7d9c8b6c5-c8n2v    1/1     Running   0          8m    # old Pod, still serving
web-7d9c8b6c5-h4rqd    1/1     Running   0          8m
```

The new Pods are `Running` but never `1/1` (readiness 404s `/never-here.html`), so they never
enter the EndpointSlice and the rollout **stalls** — by default `maxUnavailable` keeps enough
old, Ready Pods alive that the Service never loses capacity. That's the safety feature: a broken
readiness probe **blocks the bad version from taking traffic** instead of causing an outage. Fix
by rolling forward to the good manifest:

```console
$ kubectl apply -f deployment-probes.yaml && kubectl rollout status deployment/web
deployment.apps/web configured
deployment "web" successfully rolled out
```

</details>

## Cleanup / panic reset

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
