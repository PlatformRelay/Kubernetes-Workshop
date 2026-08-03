# Lab 14 — Health probes (S14) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

`READY 1/1` means the **readiness** probe passed — the demo app serves its own `/ready`
endpoint, and it answers 200. Three Ready Pods → three addresses in the EndpointSlice →
the Service load-balances across all three.
</details>

**Question:** the container was `Running` a second after it started, but didn't reach
`READY 1/1` until a moment later. What sat between "Running" and "Ready"?

<details><summary>Answer</summary>

The **readiness probe**. `Running` means the server process started; `Ready` means the readiness
probe has since returned success at least once. Until then the Pod is `Running` but `0/1` and
is **kept out of the EndpointSlice** — which is exactly why a rolling update never sends traffic
to a half-started replica. (The **startup** probe also gates this: readiness doesn't even begin
until startup passes.)
</details>

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
readiness (its `/ready` now answers **503**), so the endpoint controller **removed its IP**
from the slice. Two addresses remain. `describe pod "$POD"` shows the event
`Readiness probe failed: HTTP probe failed with statuscode: 503`.
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
hit the drained Pod on `/` it would still be served — the process is up and its status page
still answers 200 with `ready: false` in the body; only the readiness *endpoint* reports 503.)
</details>

**Task:** fix it — `POST /recover` and watch the Pod rejoin the slice.

```bash
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/recover"
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
container, and in this manifest liveness probes `/healthz` — which the app answers `200` for
as long as the process serves — so it stayed happy the whole time. That separation is
deliberate (and the app enforces it in code: `/fail` flips only `/ready`, never `/healthz`):
you never want a "not ready yet" state to trigger a restart. Next step breaks liveness to see
the other outcome.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS             RESTARTS      AGE
web-6c4f9b7d8-2xq4l    0/1     CrashLoopBackOff   3 (18s ago)   90s
web-6c4f9b7d8-7bkdp    0/1     Running            2 (25s ago)   90s
web-6c4f9b7d8-lm9rt    0/1     CrashLoopBackOff   3 (11s ago)   90s

$ kubectl describe pod "$POD"
    Liveness:  http-get http://:9999/healthz delay=0s timeout=1s period=10s #success=1 #failure=3
...
Events:
  Warning  Unhealthy  ...  Liveness probe failed: Get "http://10.244.0.11:9999/healthz": connect: connection refused
  Normal   Killing    ...  Container web failed liveness probe, will be restarted
```

The rolling update replaced the Pods; each new one's liveness probe hits port `9999`, gets
`connection refused`, fails 3× (≈30s), and the kubelet **kills and restarts** the container.
Every restart repeats the cycle → `RESTARTS` climbs → **CrashLoopBackOff** (the kubelet backs
off exponentially between restarts). Note the phase is still `Running`/`CrashLoopBackOff`, never
`Deleted` — liveness restarts the *container*, it never recreates the Pod.
</details>

**Task:** fix it — re-apply the correct manifest (liveness back on port 8080) and confirm restarts
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

Liveness on `/healthz` (port 8080) returns `200`, so nothing gets restarted — `RESTARTS 0`, all `1/1`.
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS             RESTARTS      AGE
slow-5f7b9c6d4-kk8wp    0/1     CrashLoopBackOff   3 (20s ago)   2m
```

Liveness starts probing at `initialDelaySeconds: 3`; the container is still in its `sleep 20`,
so `/` gets `connection refused`. Three misses (≈12s) and the kubelet kills it — **mid-boot**. It never
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS    RESTARTS   AGE
slow-6d8c7f5b9-p2mtq    1/1     Running   0          35s
```

While the **startup** probe is failing (during the 20s sleep), the **liveness** probe is
*suspended* — it doesn't even run, so it can't kill the container. Around 20–21s the tiny web
server comes up, startup passes once, and only then does liveness take over. Result: a clean
boot, `RESTARTS 0`.
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

### Stretch (optional) — a rollout that stalls on readiness

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

The new Pods are `Running` but never `1/1` — `FAIL_READY=1` makes the app start with its
`/ready` endpoint answering 503, and nothing ever flips it back — so they never enter the
EndpointSlice and the rollout **stalls**; by default `maxUnavailable` keeps enough old, Ready
Pods alive that the Service never loses capacity. That's the safety feature: a broken
readiness probe **blocks the bad version from taking traffic** instead of causing an outage.
(You *could* rescue a single stuck Pod with `POST /recover`, but the honest fix for a bad
template is rolling forward.) Fix by rolling forward to the good manifest:

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

## Expected state / output

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

Representative statuses include Running/Complete/Failed Pods, Bound PVCs, Accepted
Gateway conditions, or numeric HPA TARGETS — compare meaning, not ephemeral names.

## Explanation

Readiness controls whether the Pod is a Service backend; liveness asks the kubelet
to restart a stuck process. Treating a traffic-shedding problem as liveness causes
pointless restarts, while ignoring liveness leaves a dead process serving if readiness
still passes.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f <file> -n "$NS"` after fixing the
broken field, or delete only the labelled objects from Cleanup / reset and restart the guided
task. Prefer `kubectl describe` Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl get pods -n "$NS" -o wide
kubectl get endpointslices -n "$NS"
kubectl describe pod -n "$NS" | sed -n '/Events:/,$p' | head -n 40
kubectl apply -f deployment-probes.yaml -n "$NS"
kubectl rollout status deploy/web -n "$NS"
```

### Expected state / output

A readiness failure removes the Pod address from Service endpoints while leaving the
process Running; a liveness failure increments Restarts toward CrashLoopBackOff. After
restore, endpoints include Ready Pods and restart counts stop climbing.

### Explanation

Readiness controls whether the Pod is a Service backend; liveness asks the kubelet
to restart a stuck process. Treating a traffic-shedding problem as liveness causes
pointless restarts, while ignoring liveness leaves a dead process serving if readiness
still passes.

### Hints

Watch kubectl get endpointslices while toggling readiness; use kubectl describe pod
for liveness restart Events.
