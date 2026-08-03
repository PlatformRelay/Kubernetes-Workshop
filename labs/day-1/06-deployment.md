# Lab 06 — Deployment (S06)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S06 — Deployment *(red line 2/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Turn the bare Pod from Lab 05 into a **Deployment**, then scale it, roll out a new image,
watch ReplicaSets churn, and roll back. You will see *why* you rarely create bare Pods. This
is red-line step **2 of 5** — `deployment.yaml` **extends** `pod.yaml`.

## Prerequisites

- Lab 05 complete; `pod.yaml` still on disk. `$NS` is your default namespace.
- Namespace empty (`kubectl get all` → *No resources found*). Run the Lab 00 panic reset if
  not.

## Files used

- `deployment.yaml` — the Deployment, built in Step 1 by wrapping `pod.yaml`'s Pod as the
  Deployment's `template`. **Keep it** — Lab 07 adds a Service alongside it.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./06-deployment.solution.md#guided-solutions)

### Step 1 — extend the Pod into a Deployment

A Deployment carries the **same Pod** inside `spec.template`, plus three new things:
`replicas`, a `selector`, and metadata about the template. Compare against your `pod.yaml` —
everything under `template:` is the Lab 05 Pod, indented.

```bash
cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # must match template.metadata.labels below
  template:
    metadata:
      labels:
        app: web        # the Pod labels — Lab 07's Service selects these
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
EOF

kubectl apply -f deployment.yaml
kubectl get deploy,rs,pods -l app=web
```

**Task:** how many Pods appear, and what owns them?

**Question:** delete one Pod — what happens, and how is this different from Lab 05?

---

### Step 2 — scale

```bash
kubectl scale deployment web --replicas=5
kubectl get pods -l app=web -w        # Ctrl-C once 5 are Running
kubectl scale deployment web --replicas=3
```

---

### Step 3 — roll out a new image, watch ReplicaSets churn

In one terminal, start watching ReplicaSets; in another, change the image.

```bash
# Terminal A — leave this running:
kubectl get rs -l app=web -w

# Terminal B:
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl rollout status deployment/web
```

**Task:** in Terminal A, describe what happens to the number of ReplicaSets.

---

### Step 4 — history and rollback

```bash
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl rollout status deployment/web
```

**Task:** verify the image actually reverted to `ghcr.io/platformrelay/workshop-web:v1`.

---

### Step 5 — break/fix: a rollout that stalls

Roll out an image tag that does not exist and watch the rollout **stall** rather than break
the running app.

```bash
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v9.99-nope
kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
kubectl get pods -l app=web
```

**Task:** the running app never went down — why, and how do you recover?

## Observe

- `Deployment → ReplicaSet → Pods`; deleting a Pod triggers immediate recreation.
- A new image spawns a **second ReplicaSet**; new scales up as old scales down, with no
  outage.
- `rollout undo` restores the previous image (verified by jsonpath).
- A bad-image rollout **stalls** with the new Pod in `ImagePullBackOff` while old Pods keep
  serving — recovered with `rollout undo`.

## Challenge

Make the rollout visibly gradual by widening the surge, then roll a new image and watch the
Pod counts.

**Difficulty:** Intermediate

**Success criteria:** Record the minimum Ready count and maximum total Pod count during
the rollout, relate them to `maxUnavailable: 0` and `maxSurge: 2`, and explain the resource
trade-off.

**Hints:** Keep `kubectl get pods -w` in one terminal and run patch/image commands in
another; count Running plus ContainerCreating Pods at the peak.

```bash
kubectl patch deployment web --type=merge \
  -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":2,"maxUnavailable":0}}}}'
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl get pods -l app=web -w
```

[Spoiler: challenge solution](./06-deployment.solution.md#challenge-solution)

## Verify

Verify recovery from the deliberately bad rollout before deleting the Deployment.

```bash
kubectl rollout status deployment/web -n "$NS" --timeout=120s
kubectl get deployment web -n "$NS" \
  -o jsonpath='{.status.availableReplicas}{" ready; image="}{.spec.template.spec.containers[0].image}{"\n"}'
```

Expected: `3 ready` and a real workshop-web image tag, not `v9.99-nope`.

## Cleanup / reset

```bash
kubectl delete -f deployment.yaml -n "$NS" --ignore-not-found
# or the Lab 00 panic reset:
kubectl delete deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Keep `deployment.yaml` and `pod.yaml` for Lab 07.
