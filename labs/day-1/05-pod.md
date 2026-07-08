# Lab 05 — Pod (S05)

| | |
| --- | --- |
| **Section** | S05 — Pod *(red line 1/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 25 min |

## Objective

Author, run, inspect, and delete a **Pod** — the smallest deployable unit — and watch its
lifecycle. The manifest you build here (`pod.yaml`) is the **canonical base** that the
Deployment (Lab 06), Service (Lab 07), and Ingress (Lab 08) labs all extend. This is
red-line step **1 of 5**.

## Prerequisites

- Lab 00 complete: `$NS` is set and is your default namespace
  (`kubectl config view --minify | grep namespace:` shows it).
- Your namespace is empty (`kubectl get all` → *No resources found*).

## Files used

- `pod.yaml` — the canonical Pod manifest, created inline in Step 1. **Keep this file** —
  Lab 06 starts from it.

---

## Step 1 — write the canonical Pod manifest

Build `pod.yaml`. On the slides you saw this grown field by field; here is the finished base.

```bash
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # this label is how Lab 07's Service will find the Pod
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      resources:        # a small "resources stub" — Lab 13 grows this into QoS
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
EOF
```

**Task:** validate the manifest **without** creating anything, then apply it.

```bash
kubectl apply --dry-run=server -f pod.yaml     # server validates; no object created
kubectl apply -f pod.yaml
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply --dry-run=server -f pod.yaml
pod/web created (server dry run)

$ kubectl apply -f pod.yaml
pod/web created
```

`--dry-run=server` sends the manifest through the API server's validation and admission
checks but rolls back instead of persisting — the safest way to catch a bad field before it
is real. (Offline with no cluster, use `--dry-run=client` for schema-only checks.)
</details>

---

## Step 2 — watch it come alive

```bash
kubectl get pod web -w        # -w = watch; Ctrl-C to stop once it is Running
```

**Task:** watch the phase transitions. What phases does the Pod pass through before
`Running`?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod web -w
NAME   READY   STATUS              RESTARTS   AGE
web    0/1     Pending             0          0s
web    0/1     ContainerCreating   0          1s
web    1/1     Running             0          4s
```

`Pending` (accepted, being scheduled / image pulling) → `ContainerCreating` → `Running`
with `READY 1/1`. Press **Ctrl-C** to exit the watch. The first pull may take longer while
the image downloads.
</details>

---

## Step 3 — inspect: describe, logs, exec

Three commands you will use in every debugging session for the rest of the workshop.

```bash
kubectl describe pod web        # events, image, node, conditions
kubectl logs web                # the container's stdout/stderr
kubectl exec -it web -- sh      # a shell inside the container; type 'exit' to leave
```

**Task:** inside the `exec` shell, confirm you are in the container (not on your host) by
checking the process list — nginx should be PID 1.

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec -it web -- sh
# ps -ef | head
UID   PID  PPID  C STIME TTY          TIME CMD
root    1     0  0 10:12 ?        00:00:00 nginx: master process nginx -g daemon off;
...
# exit
```

`nginx` is **PID 1** — the container has its own PID namespace, so its main process is
process 1. `kubectl logs web` shows nginx's startup lines; `describe` shows an `Events`
section ending in `Started container web`.
</details>

**Question:** you never installed a shell server in the Pod — how does `kubectl exec` get one?

<details><summary>Answer</summary>

`kubectl exec` asks the **kubelet** on the node to run a new process (`sh`) *inside the
container's namespaces* and streams it back through the API server. It is not SSH and needs
no extra port — it works because the kubelet already manages that container.
</details>

---

## Step 4 — break it: a bad image (ImagePullBackOff)

The single most common Pod failure. Apply a Pod whose image tag is a typo:

```bash
kubectl run web-typo --image=nginx:1.27-typo --restart=Never -n "$NS"
kubectl get pod web-typo          # repeat a few times, or add -w
```

**Task:** the Pod never reaches `Running`. Read `describe` and name the exact reason.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod web-typo
NAME       READY   STATUS             RESTARTS   AGE
web-typo   0/1     ImagePullBackOff   0          25s

$ kubectl describe pod web-typo | sed -n '/Events:/,$p'
Events:
  Type     Reason     Age                From     Message
  ----     ------     ----               ----     -------
  Normal   Scheduled  30s                default  Successfully assigned .../web-typo to ...
  Normal   Pulling    15s (x2 over 29s)  kubelet  Pulling image "nginx:1.27-typo"
  Warning  Failed     14s (x2 over 28s)  kubelet  Failed to pull image "nginx:1.27-typo": ... manifest ... not found
  Warning  Failed     14s (x2 over 28s)  kubelet  Error: ErrImagePull
  Normal   BackOff    2s  (x2 over 27s)  kubelet  Back-off pulling image "nginx:1.27-typo"
  Warning  Failed     2s  (x2 over 27s)  kubelet  Error: ImagePullBackOff
```

The status is **`ImagePullBackOff`**; the *events* tell you why — the tag `1.27-typo` does
not exist, so the pull fails and the kubelet backs off retrying. The events section, not the
one-word status, is where the real answer always lives.
</details>

## Step 5 — fix it, then meet the punchline

There is no clean way to "edit" a bare Pod's image, so delete the broken one and (for the
punchline) delete the good one too:

```bash
kubectl delete pod web-typo
kubectl delete pod web
kubectl get pods            # what's left?
```

**Task:** after deleting `web`, is it recreated?

<details><summary>Solution / expected output</summary>

```console
$ kubectl delete pod web
pod "web" deleted
$ kubectl get pods
No resources found in <your-namespace> namespace.
```

**Nothing recreates it.** A bare Pod has no controller watching it — delete it (or let its
node fail) and it is simply gone. That is exactly the problem a **Deployment** solves, which
is Lab 06. Keep your `pod.yaml`; you extend it next.
</details>

## Expected observations

- `web` goes `Pending → ContainerCreating → Running` and reports `READY 1/1`.
- `describe`, `logs`, and `exec` all work against the running Pod.
- The typo'd image sits in **`ImagePullBackOff`**, and its `Events` name the missing tag —
  identically on kind and the shared cluster.
- Deleting the Pod does **not** bring it back — no controller owns it.

## Cleanup / panic reset

```bash
kubectl delete pod web web-typo --ignore-not-found
# or the namespace-safe panic reset from Lab 00:
kubectl delete pod --all -n "$NS" --ignore-not-found
```

Leave `pod.yaml` on disk for Lab 06.

## Stretch (optional)

A bare Pod can restart its *container* without a controller. Prove it: make nginx exit and
watch the `RESTARTS` counter, given the default `restartPolicy: Always`.

```bash
kubectl apply -f pod.yaml
kubectl exec web -- kill 1        # kill nginx's PID 1
kubectl get pod web -w            # watch RESTARTS climb, Pod stays
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl get pod web -w
NAME   READY   STATUS      RESTARTS   AGE
web    1/1     Running     0          40s
web    0/1     Completed   0          55s
web    1/1     Running     1 (2s ago) 57s
```

The **container** restarted in place (`RESTARTS` → 1) because a Pod's default
`restartPolicy` is `Always` — but the **Pod object** itself is never recreated once deleted.
Container restart ≠ Pod recreation; only a controller does the latter. Clean up with the
panic reset above.
</details>
