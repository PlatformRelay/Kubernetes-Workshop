# Lab 05 — Pod (S05) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 1 — write the canonical Pod manifest

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
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
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

### Step 2 — watch it come alive

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

### Step 3 — inspect: describe, logs, debug

Three commands you will use in every debugging session for the rest of the workshop.

```bash
kubectl describe pod web        # events, image, node, conditions
kubectl logs web                # the container's stdout/stderr
kubectl exec -it web -- sh      # try it — this one FAILS on purpose
```

**Task:** `kubectl exec … sh` fails. Read the error and explain why — then get a shell
anyway with `kubectl debug`:

```bash
kubectl debug -it web --image=busybox:1.37 --target=web -- sh
```

Inside the debug shell, confirm you are in the container's context (not on your host) by
checking the process list — the demo server should be PID 1. Type `exit` to leave.

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec -it web -- sh
error: Internal error occurred: ... exec: "sh": executable file not found in $PATH

$ kubectl debug -it web --image=busybox:1.37 --target=web -- sh
/ # ps
PID   USER     TIME  COMMAND
    1 65532     0:00 /workshop-web
   13 root      0:00 sh
   19 root      0:00 ps
/ # exit
```

The demo image is **distroless** — it contains the server binary and nothing else, not even
`sh`, so there is nothing for `exec` to run. `kubectl debug` instead attaches an
**ephemeral container** (here: busybox, which has a shell) to the running Pod;
`--target=web` shares the app container's PID namespace, so `ps` shows `/workshop-web` as
**PID 1** — the container has its own PID namespace, so its main process is process 1.
`kubectl logs web` shows the server's startup line
(`workshop-web v1 listening on :8080 …`); `describe` shows an `Events` section ending in
`Started container web`.
</details>

**Question:** you never installed a shell in the Pod — where does the `debug` shell run?

<details><summary>Answer</summary>

`kubectl debug` adds an **ephemeral container** to the Pod's spec via the API server; the
**kubelet** starts it from the toolbox image you named (`busybox:1.37`) *inside the Pod's
namespaces* and streams it back. It is not SSH and needs no extra port — and unlike a shell
baked into the app image, it is only there while you debug. (Plain `kubectl exec` works the
same way but can only run binaries that already exist in the container's image.)
</details>

---

### Step 4 — break it: a bad image (ImagePullBackOff)

The single most common Pod failure. Apply a Pod whose image tag does not exist (imagine a
mistyped tag):

```bash
kubectl run web-typo --image=ghcr.io/platformrelay/workshop-web:v9.99-nope --restart=Never -n "$NS"
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
  Normal   Pulling    15s (x2 over 29s)  kubelet  Pulling image "ghcr.io/platformrelay/workshop-web:v9.99-nope"
  Warning  Failed     14s (x2 over 28s)  kubelet  Failed to pull image "ghcr.io/platformrelay/workshop-web:v9.99-nope": ... manifest ... not found
  Warning  Failed     14s (x2 over 28s)  kubelet  Error: ErrImagePull
  Normal   BackOff    2s  (x2 over 27s)  kubelet  Back-off pulling image "ghcr.io/platformrelay/workshop-web:v9.99-nope"
  Warning  Failed     2s  (x2 over 27s)  kubelet  Error: ImagePullBackOff
```

The status is **`ImagePullBackOff`**; the *events* tell you why — the tag `v9.99-nope` does
not exist, so the pull fails and the kubelet backs off retrying. The events section, not the
one-word status, is where the real answer always lives.
</details>

### Step 5 — fix it, then meet the punchline

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

## Expected state / output

- `web` goes `Pending → ContainerCreating → Running` and reports `READY 1/1`.
- `describe` and `logs` work against the running Pod; `exec … sh` fails (distroless — no
  shell) and `kubectl debug --target` gets you a shell beside the app instead.
- The bad-tag image sits in **`ImagePullBackOff`**, and its `Events` name the missing tag —
  identically on kind and the shared cluster.
- Deleting the Pod does **not** bring it back — no controller owns it.

## Explanation

A Pod groups one or more containers under one lifecycle identity. The kubelet can restart
a failed container inside that Pod, but only a higher-level controller creates a replacement
Pod after deletion. Events explain pull and scheduling failures that the phase alone hides.

## Troubleshooting and recovery

For `ImagePullBackOff`, inspect `kubectl describe pod web-typo -n "$NS"`
and restore the pinned image in `pod.yaml`. Remove only the named lab Pods; do not clear
other participants' workloads.

## Challenge solution

### Commands / manifest

```bash
kubectl run crash -n "$NS" --image=busybox:1.37 -- sh -c 'sleep 10; exit 1'
UID_BEFORE=$(kubectl get pod crash -n "$NS" -o jsonpath='{.metadata.uid}')
until [ "$(kubectl get pod crash -n "$NS" -o jsonpath='{.status.containerStatuses[0].restartCount}')" -ge 1 ]; do
  sleep 2
done
UID_AFTER=$(kubectl get pod crash -n "$NS" -o jsonpath='{.metadata.uid}')
test "$UID_BEFORE" = "$UID_AFTER"
kubectl get pod crash -n "$NS"
kubectl delete pod crash -n "$NS"
kubectl get pod crash -n "$NS" --ignore-not-found
```

### Expected state / output

The restart count reaches at least one while both captured UIDs remain identical. After deletion,
the final `get` prints nothing: no controller recreates this bare Pod.

### Explanation

The kubelet restarts a failed container according to the Pod's `restartPolicy`, retaining the Pod
object and UID. Pod replacement requires a controller such as a Deployment or Job.

### Hints

Capture `metadata.uid` before and after the restart; a controller changes Pod objects, while the
kubelet restarts containers inside one Pod.
