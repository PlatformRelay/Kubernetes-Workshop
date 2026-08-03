# Lab 07 — Service (S07)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S07 — Service *(red line 3/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Give the Deployment a **stable address** with a Service, reach it by DNS from another Pod,
and see how a Service finds its Pods through **labels → EndpointSlices**. Then break the
selector and meet the single most common — and most *silent* — Service bug. Red-line step
**3 of 5**: `service.yaml` sits alongside the Lab 06 Deployment and selects its Pods.

## Prerequisites

- Lab 06 complete; `deployment.yaml` applied and 3 Pods `Running`
  (`kubectl get deploy web` → `3/3`).
- `$NS` is your default namespace.

## Files used

- `service.yaml` — a ClusterIP Service selecting `app: web`, created in Step 1.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./07-service.solution.md#guided-solutions)

### Step 1 — expose the Deployment

The Service's `selector` is the **same label** the Deployment stamps on its Pods
(`app: web`). That label match is the entire wiring.

```bash
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web            # picks every Pod carrying this label
  ports:
    - name: http
      port: 80          # the Service port — what clients hit
      targetPort: 8080  # the container port (containerPort in the Pod)
EOF

kubectl apply -f service.yaml
kubectl get service web
```

---

### Step 2 — see the endpoints the selector produced

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl get pods -l app=web -o wide
```

**Task:** how many endpoint addresses are there, and where do they come from?

---

### Step 3 — reach it by DNS from a throwaway Pod

Cluster DNS gives every Service a name. From a temporary Pod, fetch the demo app's status
page by the Service name `web`:

```bash
kubectl run tmp --restart=Never --image=busybox:1.36 -- sleep 300
kubectl wait --for=condition=Ready pod/tmp --timeout=60s
kubectl exec tmp -- wget -qO- http://web
```

**Task:** what did you get back, and what name resolved? Run it a few times — watch the
`pod:` line.

---

### Step 4 — break the selector (the silent failure)

Change the Service selector to a label **no Pod has**, then try again. Watch carefully: the
Service object stays perfectly healthy.

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web-oops"}}}'
kubectl get service web                                   # still there, still has a ClusterIP
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- --timeout=5 http://web ; echo "exit=$?"
```

**Task:** the curl fails. Where is the failure visible — on the Service, or somewhere else?

### Step 5 — fix it and re-verify

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- http://web | head -1
```

## Observe

- The Service gets a stable `ClusterIP`; its EndpointSlice lists **one address per Pod**.
- `http://web` resolves via cluster DNS and returns the demo app's status body — the
  `pod:` line rotates across the three Pods.
- A wrong selector leaves the Service **healthy-looking but with zero endpoints**, and
  requests time out — identically in both environments.
- Fixing the selector repopulates endpoints and restores traffic immediately.

## Challenge

Watch an endpoint leave the set the moment its Pod is deleted — the behaviour Lab 14
(probes) builds on.

```bash
# Terminal A:
kubectl get endpointslices -l kubernetes.io/service-name=web -w
# Terminal B:
POD=$(kubectl get pods -n "$NS" -l app=web --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod "$POD" -n "$NS"
```

[Spoiler: challenge solution](./07-service.solution.md#challenge-solution)

## Verify

Verify both endpoint selection and request routing before removing the Service.

```bash
kubectl rollout status deployment/web -n "$NS" --timeout=120s
kubectl get endpointslice -n "$NS" -l kubernetes.io/service-name=web
kubectl exec tmp -n "$NS" -- wget -qO- http://web | head -1
```

Expected: the EndpointSlice has ready addresses and the request prints `workshop-web v1`.

## Cleanup / reset

```bash
kubectl delete -f service.yaml -n "$NS" --ignore-not-found
kubectl delete pod tmp -n "$NS" --ignore-not-found
# full reset:
kubectl delete svc,deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Keep `service.yaml` and `deployment.yaml` for Lab 08.
