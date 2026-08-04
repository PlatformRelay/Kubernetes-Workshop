# Lab 09 — Gateway API (S09)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S09 — Gateway API *(red line 5/5)* |
| **Environment** | namespace ✓ / kind ✓ *(CRDs + a Gateway controller required)* |
| **Estimated time** | 25 min |

## Objective

Replace an Ingress with its typed, role-separated successor: a **Gateway** (the entry
point, owned by infra) plus an **HTTPRoute** (the rules, owned by the app team) that
routes to the **same** `web`/`web2` Services from Labs 07–08. You will read
`status.conditions` to see *why* it did (or didn't) wire up, add a **header match**, and
point a Gateway at a `gatewayClassName` nobody owns to watch its status stay at
`Waiting for controller`. Red-line step **5 of 5** — this front door **replaces** Lab
08's `ingress.yaml`; the backends do not change.

> **Environment honesty.** Gateway API is **CRDs + a controller**, exactly like Ingress.
>
> - **kind:** you install both yourself (admin) — this path is **kind-only** for the
>   install step. Preferred facilitator path: `./workshop profile gateway-envoy` (canonical
>   S09 profile; mutually exclusive with Contour / `ingress-contour`). Always set
>   `gatewayClassName: eg` explicitly — do not rely on whichever GatewayClass happens to
>   be default.
> - **Shared cluster:** the CRDs and a controller are **pre-provided**; your facilitator
>   gives you the `GatewayClass` name (examples below use `eg`). You install **nothing**
>   — skip Step 1 and use the shared class name everywhere.
>
> **Delivery-time check.** This lab pins **Gateway API v1.5.1** (standard channel) and
> **Envoy Gateway v1.8.2** — the CRD release that controller is built and
> conformance-tested against (`infra/versions.env` is the pin file). Re-verify both pins
> before the session; a newer standard channel may exist, but always install the CRD
> version **your controller compiles against**. The two release URLs below are the only
> version-sensitive lines.

## Prerequisites

- Labs 05–08 concepts (Deployment, Service, Ingress). This lab **recreates its own
  backends**, so it does not depend on leftovers from Lab 08.
- kind path: `kind` + a container engine, and admin over your cluster.
- Shared-cluster path: your assigned namespace `$NS` and the pre-installed
  **GatewayClass** name (ask your facilitator).

## Files used

- `backends.yaml` — two Deployments + Services (`web` on `workshop-web:v1`, `web2` on
  `:v2`) whose response bodies name the pod and version (the backends the Gateway fronts).
- `gatewayclass.yaml` — the `GatewayClass` that names the controller (kind path).
- `gateway.yaml` — the `Gateway` with an HTTP listener on `:80`.
- `route.yaml` — the `HTTPRoute` that attaches to the Gateway and routes by path.
- `route-header.yaml` — `route.yaml` plus a header match to `web2` (Step 5).
- `gateway-broken.yaml` — a Gateway with a `gatewayClassName` nobody owns (Step 6).
- `route-canary.yaml` — a weighted 90/10 split (stretch).

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./09-gateway-api.solution.md#guided-solutions)

### Step 1 (kind only) — install the CRDs, the controller, and a GatewayClass

The Gateway API types are **not** built into Kubernetes. Install the standard-channel
CRDs, then a conformant controller (**Envoy Gateway**). Its install manifest does
**not** create a `GatewayClass` — you declare that yourself, exactly like the
`IngressClass` beat in Lab 08.

```bash
# make sure you are on your workshop cluster / namespace
kubectl create namespace workshop --dry-run=client -o yaml | kubectl apply -f -
kubectl config set-context --current --namespace=workshop
export NS=workshop

# 1a. Gateway API standard-channel CRDs v1.5.1 (GatewayClass, Gateway, HTTPRoute — all GA).
#     Server-side apply: the CRDs are too large for the client-side annotation.
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml

# 1b. Envoy Gateway v1.8.2 — the controller (installs into namespace `envoy-gateway-system`).
kubectl apply --server-side -f https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml
kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available

# 1c. The GatewayClass — infra's one-time declaration of who implements the API.
cat > gatewayclass.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
EOF
kubectl apply -f gatewayclass.yaml

# Confirm the controller claimed its class:
kubectl get gatewayclass
```

<details><summary>Shared-cluster path — do this instead of Step 1</summary>

Do **not** install anything. Confirm the CRDs and a controller already exist, and note
the class name:

```console
$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       40d
```

Use that class name in `gateway.yaml` (replace `eg` if your cluster's class differs) and
run everything in your assigned namespace `$NS`. Skip every `kind`-specific command below.
</details>

---

### Step 2 — deploy two distinguishable backends

Same backends as Lab 08 — the Gateway fronts the identical Services, proving the red
line. `workshop-web` answers every request with its pod name and version (`v1`/`v2`),
so you can always tell which backend replied.

```bash
cat > backends.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: web } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: web } }
spec:
  selector: { app: web }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: web2, labels: { app: web2 } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web2 } }
  template:
    metadata: { labels: { app: web2 } }
    spec:
      containers:
        - name: web2
          image: ghcr.io/platformrelay/workshop-web:v2
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web2, labels: { app: web2 } }
spec:
  selector: { app: web2 }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
EOF

kubectl apply -f backends.yaml
kubectl rollout status deploy/web && kubectl rollout status deploy/web2
```

---

### Step 3 — apply the Gateway (the entry point)

The `Gateway` is the infra-owned door: one HTTP listener on port 80. By default a listener
admits `HTTPRoutes` from the **same namespace**, so no extra `allowedRoutes` is needed here.

```bash
cat > gateway.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: eg             # must match `kubectl get gatewayclass`
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway.yaml
kubectl get gateway web
kubectl get gateway web -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
```

**Task:** what do the `Accepted` and `Programmed` conditions say, and why is that
honest on kind?

---

### Step 4 — apply the HTTPRoute and route by path

The `HTTPRoute` is the app-owned rules. It **attaches** to the Gateway with `parentRefs` and
sends `/` to the `web` Service.

```bash
cat > route.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web                    # attach to the Gateway named "web"
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }  # the SAME Service from Lab 07
EOF

kubectl apply -f route.yaml
kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'

# Reach the Gateway: no LoadBalancer on kind, so port-forward its Envoy Service
# (the upstream-documented path). The Service is labelled with its owning Gateway:
export ENVOY_SERVICE=$(kubectl get svc -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=$NS,gateway.envoyproxy.io/owning-gateway-name=web \
  -o jsonpath='{.items[0].metadata.name}')
kubectl -n envoy-gateway-system port-forward service/$ENVOY_SERVICE 8888:80 >/tmp/pf.log 2>&1 &
sleep 2
curl -H 'Host: web.example.com' http://localhost:8888/
```

**Task:** which backend answers, and what do the HTTPRoute's conditions show?

**Question:** the HTTPRoute lists `hostnames: [web.example.com]`. What happens to a request
whose `Host` header is something else?

---

### Step 5 — add a typed header match

Under Ingress anything past host/path needed controller-specific annotations. Here it's
a **typed field**: add a rule that matches the header `x-env: canary` and sends those
requests to `web2`. The header+path rule is **more specific**, so it wins over the plain
`/` rule regardless of order.

```bash
cat > route-header.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
          headers:
            - { name: x-env, value: canary }   # typed match — no annotation
      backendRefs:
        - { name: web2, port: 80 }
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }
EOF

kubectl apply -f route-header.yaml

curl -sH 'Host: web.example.com' http://localhost:8888/ | head -1                       # no header
curl -sH 'Host: web.example.com' -H 'x-env: canary' http://localhost:8888/ | head -1    # with header
```

**Task:** which backend answers each request?

---

### Step 6 — break it: a `gatewayClassName` nobody owns

Like an Ingress with the wrong class, a Gateway pointing at a class no controller owns just
sits there. Prove it with a fresh Gateway.

```bash
cat > gateway-broken.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-broken
spec:
  gatewayClassName: eg-typo        # no controller owns this class
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway-broken.yaml
kubectl get gateway web-broken
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
```

**Task:** does the apply succeed? What is the Gateway's status, and who wrote it?

**Fix it:** point the broken Gateway at the real class and watch the controller claim it.

```bash
kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'

# it now has its own data plane too — then remove it, one front door is enough:
kubectl delete gateway web-broken
```

**Question:** earlier your HTTPRoute showed `ResolvedRefs=True`. What would make it
`ResolvedRefs=False`, and why is that a *route* condition, not a *Gateway* one?

## Observe

- `kubectl get gatewayclass` shows a controller with `ACCEPTED=True` — and the class only
  exists because someone **declared** it; the controller install doesn't create one.
- A valid Gateway reaches `Accepted=True`; on kind `Programmed` stays
  `False (AddressNotAssigned)` because no load balancer hands out an address — the proxy
  still serves via `port-forward`. A `gatewayClassName` no controller owns leaves the CRD
  defaults in place: `Unknown (Pending) Waiting for controller`.
- `/` answers `workshop-web v1`; `/` **with** `x-env: canary` answers `workshop-web v2` —
  a typed header match, no annotations.
- A wrong `backendRef` Service name flips the **HTTPRoute's** `ResolvedRefs` to `False`
  (route condition), while class problems show on the **Gateway's** `Accepted` (infra
  condition).

## Challenge

A teammate's HTTPRoute attaches to your Gateway but traffic never arrives.
Diagnose whether the failure is the GatewayClass, parentRefs, or a backend selector
mismatch — without rewriting the working path rule from Step 4.

**Difficulty:** Intermediate

**Success criteria:** Identify the failing status condition (Accepted, Programmed, or ResolvedRefs),
restore one successful HTTP response from the path-routed backend, and explain which
ownership lane (infra vs app) owned the broken field.

**Hints:** Compare Gateway status.conditions with the HTTPRoute parentRefs and backendRefs;
inspect the GatewayClass name before editing the route.

[Spoiler: challenge solution](./09-gateway-api.solution.md#challenge-solution)

## Verify

Confirm the happy-path Gateway attachment before cleanup.

```bash
kubectl get gatewayclass
kubectl get gateway,httproute -n "$NS"
curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/" || true
```

Expected: a GatewayClass is Accepted, your Gateway/HTTPRoute objects still exist, and a
path- or host-routed request reaches a backend (port-forward is fine on kind).

## Cleanup / reset

```bash
# stop the background port-forward from Step 4:
kill %1 2>/dev/null

kubectl delete -f route-header.yaml -f gateway.yaml -f backends.yaml --ignore-not-found
kubectl delete gateway web-broken --ignore-not-found   # if Step 6 was left mid-way
rm -f gateway-broken.yaml route.yaml route-canary.yaml # local files

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete httproute,gateway,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster --name workshop

# kind only — remove the GatewayClass, the controller, and the CRDs for a clean slate:
# kubectl delete -f gatewayclass.yaml --ignore-not-found
# kubectl delete -f https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml
# kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

## Stretch (optional) — a weighted canary

Split one path across two backends by **weight** — the typed replacement for an
annotation-based canary. Send `/` to `web` and `web2` 90/10 and count the versions in
the response bodies.

```bash
cat > route-canary.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:                     # typed weighted split — no annotation
        - { name: web,  port: 80, weight: 90 }
        - { name: web2, port: 80, weight: 10 }
EOF

kubectl apply -f route-canary.yaml

for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8888/; done \
  | grep '^workshop-web' | sort | uniq -c
```
