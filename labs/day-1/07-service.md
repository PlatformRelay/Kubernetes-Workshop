# Lab 07 — Service (S07)

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

## Step 1 — expose the Deployment

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
      port: 80          # the Service port
      targetPort: 80    # the container port (containerPort in the Pod)
EOF

kubectl apply -f service.yaml
kubectl get service web
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get service web
NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   10.96.142.51    <none>        80/TCP    5s
```

`ClusterIP` is the default type: a stable **in-cluster** virtual IP. It never changes even as
the Pods behind it come and go — which is the whole reason Services exist (Pod IPs are
ephemeral, as you saw when the ReplicaSet churned Pods in Lab 06).
</details>

---

## Step 2 — see the endpoints the selector produced

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl get pods -l app=web -o wide
```

**Task:** how many endpoint addresses are there, and where do they come from?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS                            AGE
web-abcde   IPv4          80      10.244.0.7,10.244.0.8,10.244.0.9     30s
```

**Three** addresses — one per Pod. The endpoint controller watched the Service's selector,
found the three `app: web` Pods, and wrote their IPs into an **EndpointSlice**. Compare the
IPs to `kubectl get pods -o wide` — they are the Pod IPs. The Service is just a stable front
door; EndpointSlices are the live list of who is behind it.
</details>

---

## Step 3 — reach it by DNS from a throwaway Pod

Cluster DNS gives every Service a name. From a temporary Pod, fetch the nginx page by the
Service name `web`:

```bash
kubectl run tmp -i --rm --restart=Never --image=busybox:1.36 -- \
  wget -qO- http://web | head -4
```

**Task:** what did you get back, and what name resolved?

<details><summary>Solution / expected output</summary>

```console
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.36 -- wget -qO- http://web | head -4
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```

`http://web` resolved via cluster DNS to the Service's ClusterIP, which load-balanced to one
of the three Pods. The fully-qualified name is `web.<your-namespace>.svc.cluster.local`;
inside the same namespace the short name `web` is enough. The `tmp` Pod is deleted on exit
(`--rm`).
</details>

---

## Step 4 — break the selector (the silent failure)

Change the Service selector to a label **no Pod has**, then try again. Watch carefully: the
Service object stays perfectly healthy.

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web-oops"}}}'
kubectl get service web                                   # still there, still has a ClusterIP
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl run tmp -i --rm --restart=Never --image=busybox:1.36 -- \
  wget -qO- --timeout=5 http://web ; echo "exit=$?"
```

**Task:** the curl fails. Where is the failure visible — on the Service, or somewhere else?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get service web
NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   10.96.142.51    <none>        80/TCP    6m      # looks totally fine

$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS   AGE
web-abcde   IPv4          80      <unset>     6m                   # <-- ZERO endpoints

$ kubectl run tmp ... wget -qO- --timeout=5 http://web ; echo "exit=$?"
wget: download timed out
exit=1
```

This is the classic trap: **the Service is healthy, has a ClusterIP, and reports no errors**
— but its EndpointSlice is **empty** because the selector matches nothing, so traffic has
nowhere to go. `kubectl describe service web` even shows `Endpoints: <none>`. The lesson:
when a Service "doesn't work," check its **endpoints** first, not the Service object.
</details>

## Step 5 — fix it and re-verify

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl run tmp -i --rm --restart=Never --image=busybox:1.36 -- \
  wget -qO- http://web | head -1
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS                          AGE
web-abcde   IPv4          80      10.244.0.7,10.244.0.8,10.244.0.9   8m

$ kubectl run tmp ... wget -qO- http://web | head -1
<!DOCTYPE html>
```

Restoring `app: web` repopulates the EndpointSlice within a second and traffic flows again.
Same manifest, one label — that is the whole difference between working and silently dead.
</details>

## Expected observations

- The Service gets a stable `ClusterIP`; its EndpointSlice lists **one address per Pod**.
- `http://web` resolves via cluster DNS and returns the nginx welcome page.
- A wrong selector leaves the Service **healthy-looking but with zero endpoints**, and
  requests time out — identically in both environments.
- Fixing the selector repopulates endpoints and restores traffic immediately.

## Cleanup / panic reset

```bash
kubectl delete -f service.yaml --ignore-not-found
kubectl delete pod tmp --ignore-not-found        # in case a --rm Pod was interrupted
# full reset:
kubectl delete svc,deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Keep `service.yaml` and `deployment.yaml` for Lab 08.

## Stretch (optional)

Watch an endpoint leave the set the moment its Pod is deleted — the behaviour Lab 14
(probes) builds on.

```bash
# Terminal A:
kubectl get endpointslices -l kubernetes.io/service-name=web -w
# Terminal B:
kubectl delete pod -l app=web --field-selector status.phase=Running | head -1
```

<details><summary>Solution / what you're looking at</summary>

In Terminal A the deleted Pod's IP disappears from the `ENDPOINTS` list, then a new IP (the
ReplicaSet's replacement Pod) is added once it is Ready. The EndpointSlice tracks Pod
**readiness and existence** live — in Lab 14 you make a Pod fail its readiness probe to leave
the set *without* being deleted. Clean up with the panic reset above.
</details>
