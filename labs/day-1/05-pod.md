# Lab 05 — Pod (S05)

<!-- lab-contract:v1 -->

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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./05-pod.solution.md#guided-solutions)

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

---

### Step 2 — watch it come alive

```bash
kubectl get pod web -w        # -w = watch; Ctrl-C to stop once it is Running
```

**Task:** watch the phase transitions. What phases does the Pod pass through before
`Running`?

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

**Question:** you never installed a shell in the Pod — where does the `debug` shell run?

---

### Step 4 — break it: a bad image (ImagePullBackOff)

The single most common Pod failure. Apply a Pod whose image tag does not exist (imagine a
mistyped tag):

```bash
kubectl run web-typo --image=ghcr.io/platformrelay/workshop-web:v9.99-nope --restart=Never -n "$NS"
kubectl get pod web-typo          # repeat a few times, or add -w
```

**Task:** the Pod never reaches `Running`. Read `describe` and name the exact reason.

### Step 5 — fix it, then meet the punchline

There is no clean way to "edit" a bare Pod's image, so delete the broken one and (for the
punchline) delete the good one too:

```bash
kubectl delete pod web-typo
kubectl delete pod web
kubectl get pods            # what's left?
```

**Task:** after deleting `web`, is it recreated?

## Observe

- `web` goes `Pending → ContainerCreating → Running` and reports `READY 1/1`.
- `describe` and `logs` work against the running Pod; `exec … sh` fails (distroless — no
  shell) and `kubectl debug --target` gets you a shell beside the app instead.
- The bad-tag image sits in **`ImagePullBackOff`**, and its `Events` name the missing tag —
  identically on kind and the shared cluster.
- Deleting the Pod does **not** bring it back — no controller owns it.

## Challenge

A bare Pod can restart its *container* without a controller. Prove it: run a container
that exits on purpose and watch the `RESTARTS` counter, given the default
`restartPolicy: Always`.

**Difficulty:** Intermediate

**Success criteria:** Observe at least one restart, prove the Pod UID stays unchanged,
then delete it and explain why the container restarted but the Pod is not recreated.

**Hints:** Capture `metadata.uid` before and after the restart; a controller changes Pod
objects, while the kubelet restarts containers inside one Pod.

```bash
kubectl run crash --image=busybox:1.37 -- sh -c 'sleep 10; exit 1'
kubectl get pod crash -w          # watch RESTARTS climb, Pod stays
```

[Spoiler: challenge solution](./05-pod.solution.md#challenge-solution)

## Verify

Verify the lab's punchline before cleanup: the deleted bare Pod stays deleted.

```bash
kubectl get pod web web-typo -n "$NS" --ignore-not-found
```

Expected: no output. A `web` Pod appearing again would mean a controller owns it.

## Cleanup / reset

```bash
kubectl delete pod web web-typo crash -n "$NS" --ignore-not-found
# or the namespace-safe panic reset from Lab 00:
kubectl delete pod --all -n "$NS" --ignore-not-found
```

Leave `pod.yaml` on disk for Lab 06.
