# Lab 06 — Deployment (S06)

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

## Step 1 — extend the Pod into a Deployment

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
          image: nginx:1.27
          ports:
            - containerPort: 80
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get deploy,rs,pods -l app=web
NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/web   3/3     3            3           10s

NAME                             DESIRED   CURRENT   READY   AGE
replicaset.apps/web-6f8c9d5b7c   3         3         3       10s

NAME                       READY   STATUS    RESTARTS   AGE
pod/web-6f8c9d5b7c-2xk9p   1/1     Running   0          10s
pod/web-6f8c9d5b7c-7nqld   1/1     Running   0          10s
pod/web-6f8c9d5b7c-lm4tt   1/1     Running   0          10s
```

The chain is **Deployment → ReplicaSet → 3 Pods**. The Deployment created a ReplicaSet; the
ReplicaSet created the Pods. Pod names are `<rs-name>-<random>`.
</details>

**Question:** delete one Pod — what happens, and how is this different from Lab 05?

<details><summary>Solution / expected output</summary>

```console
$ kubectl delete pod -l app=web --field-selector status.phase=Running | head -1
pod "web-6f8c9d5b7c-2xk9p" deleted
$ kubectl get pods -l app=web
NAME                       READY   STATUS    RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running   0          2m
web-6f8c9d5b7c-lm4tt       1/1     Running   0          2m
web-6f8c9d5b7c-rr8vd       1/1     Running   0          3s     # <-- brand new replacement
```

The ReplicaSet **immediately recreates** it to hold `replicas: 3`. In Lab 05 the bare Pod
stayed gone. That reconciliation — observed vs desired → act — is the whole point of a
controller.
</details>

---

## Step 2 — scale

```bash
kubectl scale deployment web --replicas=5
kubectl get pods -l app=web -w        # Ctrl-C once 5 are Running
kubectl scale deployment web --replicas=3
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl scale deployment web --replicas=5
deployment.apps/web scaled
$ kubectl get pods -l app=web
NAME                       READY   STATUS    RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running   0          5m
web-6f8c9d5b7c-lm4tt       1/1     Running   0          5m
web-6f8c9d5b7c-rr8vd       1/1     Running   0          3m
web-6f8c9d5b7c-8p2mn       1/1     Running   0          6s
web-6f8c9d5b7c-c4wjx       1/1     Running   0          6s
```

Scaling only changes `replicas`; the ReplicaSet adds or removes Pods to match. Scaling down
to 3 terminates two.
</details>

---

## Step 3 — roll out a new image, watch ReplicaSets churn

In one terminal, start watching ReplicaSets; in another, change the image.

```bash
# Terminal A — leave this running:
kubectl get rs -l app=web -w

# Terminal B:
kubectl set image deployment/web web=nginx:1.28
kubectl rollout status deployment/web
```

**Task:** in Terminal A, describe what happens to the number of ReplicaSets.

<details><summary>Solution / expected output</summary>

```console
# Terminal A (watch):
NAME             DESIRED   CURRENT   READY   AGE
web-6f8c9d5b7c   3         3         3       8m      # old RS (nginx:1.27)
web-7d4bf9c8f5   1         1         0       0s      # new RS (nginx:1.28) scales up...
web-6f8c9d5b7c   2         3         3       8m      # ...old scales down in step
web-7d4bf9c8f5   3         3         3       20s
web-6f8c9d5b7c   0         0         0       8m      # old RS emptied, kept for rollback

# Terminal B:
$ kubectl rollout status deployment/web
deployment "web" successfully rolled out
```

A **second ReplicaSet** appears for the new image. The new RS scales **up** as the old RS
scales **down**, one step at a time (governed by `maxSurge`/`maxUnavailable`), so the app
stays available throughout. The old RS is kept at 0 replicas for rollback.
</details>

---

## Step 4 — history and rollback

```bash
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl rollout status deployment/web
```

**Task:** verify the image actually reverted to `nginx:1.27`.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
nginx:1.27
```

`rollout undo` promoted the old ReplicaSet back to 3 replicas and scaled the new one to 0 —
the reverse of Step 3. The jsonpath one-liner reads the current image straight from the
Deployment.
</details>

---

## Step 5 — break/fix: a rollout that stalls

Roll out an image tag that does not exist and watch the rollout **stall** rather than break
the running app.

```bash
kubectl set image deployment/web web=nginx:9.99-nope
kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
kubectl get pods -l app=web
```

**Task:** the running app never went down — why, and how do you recover?

<details><summary>Solution / expected output</summary>

```console
$ kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
error: timed out waiting for the condition
exit=1

$ kubectl get pods -l app=web
NAME                       READY   STATUS             RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running            0          12m   # old Pods still serving
web-6f8c9d5b7c-lm4tt       1/1     Running            0          12m
web-7c9955bbbf-abcde       0/1     ImagePullBackOff   0          40s   # new Pod can't pull

$ kubectl rollout undo deployment/web        # recover
deployment.apps/web rolled back
```

`maxUnavailable` keeps the **old** Pods running until the new ones become `Ready`. The bad
new Pod is stuck in `ImagePullBackOff`, so the rollout never completes — but it also never
takes the app down. `rollout undo` reverts to the last good ReplicaSet.
</details>

## Expected observations

- `Deployment → ReplicaSet → Pods`; deleting a Pod triggers immediate recreation.
- A new image spawns a **second ReplicaSet**; new scales up as old scales down, with no
  outage.
- `rollout undo` restores the previous image (verified by jsonpath).
- A bad-image rollout **stalls** with the new Pod in `ImagePullBackOff` while old Pods keep
  serving — recovered with `rollout undo`.

## Cleanup / panic reset

```bash
kubectl delete -f deployment.yaml --ignore-not-found
# or the Lab 00 panic reset:
kubectl delete deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Keep `deployment.yaml` and `pod.yaml` for Lab 07.

## Stretch (optional)

Make the rollout visibly gradual by widening the surge, then roll a new image and watch the
Pod counts.

```bash
kubectl patch deployment web --type=merge \
  -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":2,"maxUnavailable":0}}}}'
kubectl set image deployment/web web=nginx:1.28
kubectl get pods -l app=web -w
```

<details><summary>Solution / what you're looking at</summary>

With `maxUnavailable: 0` the Deployment never drops below 3 ready Pods, and `maxSurge: 2`
lets it run up to 5 during the switch — so you briefly see extra Pods appear before old ones
terminate. This is the safest (but slowest, most resource-hungry) rolling-update setting.
Reset with `kubectl rollout undo deployment/web` and the panic reset above.
</details>
