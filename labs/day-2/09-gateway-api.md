# Lab 09 — Gateway API (S09)

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
break the `gatewayClassName` to watch `Accepted` flip. Red-line step **5 of 5** — this
front door **replaces** Lab 08's `ingress.yaml`; the backends do not change.

> **Environment honesty.** Gateway API is **CRDs + a controller**, exactly like Ingress.
>
> - **kind:** you install both yourself (admin) — this path is **kind-only** for the
>   install step.
> - **Shared cluster:** the CRDs and a controller are **pre-provided**; your facilitator
>   gives you the `GatewayClass` name (examples below use `nginx`). You install **nothing**
>   — skip Step 1 and use the shared class name everywhere.
>
> **Delivery-time check.** Pin and re-verify the current **Gateway API** release and the
> **NGINX Gateway Fabric** release (and its exact data-plane Service name) before the
> session — the URLs and the `port-forward` target below are the only version-sensitive
> lines. Every command re-reads state, so a version bump changes URLs, not structure.

## Prerequisites

- Labs 05–08 concepts (Deployment, Service, Ingress). This lab **recreates its own
  backends**, so it does not depend on leftovers from Lab 08.
- kind path: `kind` + a container engine, and admin over your cluster.
- Shared-cluster path: your assigned namespace `$NS` and the pre-installed
  **GatewayClass** name (ask your facilitator).

## Files used

- `backends.yaml` — two nginx Deployments + Services (`web`, `web2`) with distinguishable
  home pages (identical to Lab 08 — the backends the Gateway now fronts).
- `gateway.yaml` — the `Gateway` with an HTTP listener on `:80`.
- `route.yaml` — the `HTTPRoute` that attaches to the Gateway and routes by path.
- `route-header.yaml` — `route.yaml` plus a header match to `web2` (Step 5).
- `gateway-broken.yaml` — a copy with a bad `gatewayClassName` (Step 6).

---

## Step 1 (kind only) — install the CRDs and a controller

The Gateway API types are **not** built into Kubernetes. Install the standard-channel
CRDs, then a conformant controller (NGINX Gateway Fabric — its `GatewayClass` is `nginx`).

```bash
# make sure you are on your workshop cluster / namespace
kubectl create namespace workshop --dry-run=client -o yaml | kubectl apply -f -
kubectl config set-context --current --namespace=workshop
export NS=workshop

# 1a. Gateway API standard-channel CRDs (GatewayClass, Gateway, HTTPRoute — all GA).
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml

# 1b. NGINX Gateway Fabric — creates namespace `nginx-gateway` and the `nginx` GatewayClass.
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v1.6.1/deploy/default/deploy.yaml
kubectl -n nginx-gateway wait --for=condition=available deploy/nginx-gateway --timeout=180s

# Confirm the controller claimed its class:
kubectl get gatewayclass
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get gatewayclass
NAME    CONTROLLER                                   ACCEPTED   AGE
nginx   gateway.nginx.org/nginx-gateway-controller   True       25s
```

`ACCEPTED=True` means a running controller owns the `nginx` class — that name is what your
`Gateway` will reference. If `ACCEPTED` is empty or `False`, the controller pod isn't ready
yet (`kubectl -n nginx-gateway get pods`).
</details>

<details><summary>Shared-cluster path — do this instead of Step 1</summary>

Do **not** install anything. Confirm the CRDs and a controller already exist, and note the
class name:

```console
$ kubectl get gatewayclass
NAME    CONTROLLER                                   ACCEPTED   AGE
nginx   gateway.nginx.org/nginx-gateway-controller   True       40d
```

Use that class name in `gateway.yaml` (replace `nginx` if your cluster's class differs) and
run everything in your assigned namespace `$NS`. Skip every `kind`-specific command below.
</details>

---

## Step 2 — deploy two distinguishable backends

Same backends as Lab 08 — the Gateway fronts the identical Services, proving the red line.

```bash
cat > backends.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata: { name: web-pages }
data:
  web.html: "hello from web (path /)\n"
  web2.html: "hello from web2 (header x-env: canary)\n"
---
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
          image: nginx:1.27
          ports: [ { containerPort: 80 } ]
          volumeMounts:
            - { name: page, mountPath: /usr/share/nginx/html/index.html, subPath: web.html }
      volumes:
        - name: page
          configMap: { name: web-pages }
---
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: web } }
spec:
  selector: { app: web }
  ports: [ { name: http, port: 80, targetPort: 80 } ]
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
          image: nginx:1.27
          ports: [ { containerPort: 80 } ]
          volumeMounts:
            - { name: page, mountPath: /usr/share/nginx/html/index.html, subPath: web2.html }
      volumes:
        - name: page
          configMap: { name: web-pages }
---
apiVersion: v1
kind: Service
metadata: { name: web2, labels: { app: web2 } }
spec:
  selector: { app: web2 }
  ports: [ { name: http, port: 80, targetPort: 80 } ]
EOF

kubectl apply -f backends.yaml
kubectl rollout status deploy/web && kubectl rollout status deploy/web2
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f backends.yaml
configmap/web-pages created
deployment.apps/web created
service/web created
deployment.apps/web2 created
service/web2 created
$ kubectl rollout status deploy/web && kubectl rollout status deploy/web2
deployment "web" successfully rolled out
deployment "web2" successfully rolled out
```

Each Deployment serves a one-line page so you can tell which backend answered.
</details>

---

## Step 3 — apply the Gateway (the entry point)

The `Gateway` is the infra-owned door: one HTTP listener on port 80. By default a listener
admits `HTTPRoutes` from the **same namespace**, so no extra `allowedRoutes` is needed here.

```bash
cat > gateway.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: nginx          # must match `kubectl get gatewayclass`
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway.yaml
kubectl get gateway web -o wide
```

**Task:** did the Gateway reach `PROGRAMMED=True`? What does that mean?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get gateway web -o wide
NAME   CLASS   ADDRESS      PROGRAMMED   AGE
web    nginx   10.96.1.20   True         15s
```

`PROGRAMMED=True` means the controller turned your Gateway into **real data-plane config**
(an nginx instance is now listening). On kind the `ADDRESS` is an in-cluster IP (no cloud
load balancer), which is fine — you'll reach it with `port-forward` in Step 4. If
`PROGRAMMED` stays empty, the controller hasn't accepted the Gateway — jump to Step 6, that's
exactly the failure it teaches. Full detail lives in the conditions:

```console
$ kubectl describe gateway web | sed -n '/Conditions/,/Listeners/p'
  Conditions:
    Type: Accepted     Status: True   Reason: Accepted
    Type: Programmed   Status: True   Reason: Programmed
```

</details>

---

## Step 4 — apply the HTTPRoute and route by path

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
kubectl get httproute web

# Reach the Gateway. port-forward works the same on kind and shared clusters:
kubectl -n nginx-gateway port-forward deploy/nginx-gateway 8080:80 >/tmp/pf.log 2>&1 &
sleep 2
curl -H 'Host: web.example.com' http://localhost:8080/
```

**Task:** which backend answers, and what does `kubectl get httproute web` show under the
Gateway?

<details><summary>Solution / expected output</summary>

```console
$ curl -H 'Host: web.example.com' http://localhost:8080/
hello from web (path /)

$ kubectl describe httproute web | sed -n '/Parents/,/Events/p'
  Parents:
    Conditions:
      Type: Accepted        Status: True   Reason: Accepted
      Type: ResolvedRefs    Status: True   Reason: ResolvedRefs
```

`/` routes to the `web` Service — the same backend the Ingress fronted, now behind a
Gateway + HTTPRoute. `ResolvedRefs=True` confirms every `backendRef` pointed at a real
Service and port. (`port-forward` runs in the background; stop it later with
`kill %1` or the cleanup section.)

> If you use a **shared cluster**, replace the `port-forward` line with the address your
> facilitator gave you: `curl http://web.example.com/` (real DNS supplies the `Host`), or
> `curl --resolve web.example.com:80:<gateway-ip> http://web.example.com/`.
</details>

**Question:** the HTTPRoute lists `hostnames: [web.example.com]`. What happens to a request
whose `Host` header is something else?

<details><summary>Answer</summary>

```console
$ curl -H 'Host: nope.example.com' http://localhost:8080/
404 Not Found
```

The listener admits the request, but no `HTTPRoute` hostname matches, so nothing routes —
you get a `404`. `hostnames` on the route narrows which hosts its rules apply to, the same
way an Ingress rule's `host` did.
</details>

---

## Step 5 — add a typed header match

Under Ingress a canary needed vendor annotations. Here it's a **typed field**: add a rule
that matches the header `x-env: canary` and sends those requests to `web2`. The
header+path rule is **more specific**, so it wins over the plain `/` rule regardless of order.

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

curl -H 'Host: web.example.com' http://localhost:8080/                       # no header
curl -H 'Host: web.example.com' -H 'x-env: canary' http://localhost:8080/    # with header
```

**Task:** which backend answers each request?

<details><summary>Solution / expected output</summary>

```console
$ curl -H 'Host: web.example.com' http://localhost:8080/
hello from web (path /)
$ curl -H 'Host: web.example.com' -H 'x-env: canary' http://localhost:8080/
hello from web2 (header x-env: canary)
```

Same path `/`, two outcomes — the request carrying `x-env: canary` matches the more specific
rule and lands on `web2`; everything else falls through to `web`. That header-based split is
a first-class, validated field. Under Ingress it would have been an untyped nginx annotation.
</details>

---

## Step 6 — break it: a `gatewayClassName` nobody owns

Like an Ingress with the wrong class, a Gateway pointing at a class no controller owns just
sits there. Prove it.

```bash
cat > gateway-broken.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: nginx-typo     # no controller owns this class
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway-broken.yaml
kubectl get gateway web -o wide
```

**Task:** does the apply succeed? What is the Gateway's status now?

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f gateway-broken.yaml
gateway.networking.k8s.io/web configured
$ kubectl get gateway web -o wide
NAME   CLASS        ADDRESS   PROGRAMMED   AGE
web    nginx-typo             <no value>   6m

$ kubectl get gatewayclass
NAME    CONTROLLER                                   ACCEPTED   AGE
nginx   gateway.nginx.org/nginx-gateway-controller   True       9m
# there is no "nginx-typo" GatewayClass — so nothing owns this Gateway
```

The manifest applies fine — it's schema-valid — but the class `nginx-typo` doesn't exist, so
**no controller reconciles the Gateway**: no `ADDRESS`, `PROGRAMMED` blank, and its
`status.conditions` stay **empty** — there's no owner to write them. That's the Gateway API
version of Ingress's silent empty `ADDRESS`, and the tell is `kubectl get gatewayclass`: the
class you named isn't there. *(Some controllers instead publish an `Accepted=False` condition
here; either way there's no address and nothing routes.)* The **typed** "why" shows up for
things a controller **does** reconcile — you'll see that next as `ResolvedRefs=False`.
</details>

**Fix it:** re-apply the good Gateway and confirm it programs and routes again.

```bash
kubectl apply -f gateway.yaml
kubectl get gateway web -o wide
curl -H 'Host: web.example.com' -H 'x-env: canary' http://localhost:8080/
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f gateway.yaml
gateway.networking.k8s.io/web configured
$ kubectl get gateway web -o wide
NAME   CLASS   ADDRESS      PROGRAMMED   AGE
web    nginx   10.96.1.20   True         7m
$ curl -H 'Host: web.example.com' -H 'x-env: canary' http://localhost:8080/
hello from web2 (header x-env: canary)
```

Restoring `gatewayClassName: nginx` lets the controller re-accept and re-program the Gateway;
the HTTPRoute (untouched) routes again, header match included.
</details>

**Question:** earlier your HTTPRoute showed `ResolvedRefs=True`. What would make it
`ResolvedRefs=False`, and why is that a *route* condition, not a *Gateway* one?

<details><summary>Answer</summary>

```console
# point a backendRef at a Service that doesn't exist:
$ kubectl patch httproute web --type=json \
  -p='[{"op":"replace","path":"/spec/rules/1/backendRefs/0/name","value":"web-oops"}]'
$ kubectl describe httproute web | grep -A2 ResolvedRefs
    Type: ResolvedRefs   Status: False   Reason: BackendNotFound
    Message: backend Service "web-oops" not found
```

`ResolvedRefs` is about whether the **route's `backendRefs`** resolve to real Services/ports,
which is the **app team's** concern — so it lives on the HTTPRoute, not the Gateway. `Accepted`
(does a controller own the class, is the listener valid) is the **infra** concern and lives on
the Gateway. Two conditions, two owners — the same role split the whole section is about. Undo
with `kubectl apply -f route-header.yaml`.
</details>

## Expected observations

- `kubectl get gatewayclass` shows a controller with `ACCEPTED=True`.
- A valid Gateway reaches `PROGRAMMED=True`; a `gatewayClassName` no controller owns leaves it
  **unreconciled** — no address, empty status — the Gateway API echo of Ingress's silent empty
  `ADDRESS` (the tell is `kubectl get gatewayclass`).
- `/` routes to `web`; `/` **with** `x-env: canary` routes to `web2` — a typed header match.
- A wrong `backendRef` Service name flips the **HTTPRoute's** `ResolvedRefs` to `False`
  (route condition), while class problems flip the **Gateway's** `Accepted` (infra condition).

## Cleanup / panic reset

```bash
# stop the background port-forward from Step 4:
kill %1 2>/dev/null

kubectl delete -f route-header.yaml -f gateway.yaml -f backends.yaml --ignore-not-found
rm -f gateway-broken.yaml route.yaml   # local files
# full namespace reset:
kubectl delete httproute,gateway,svc,deploy,rs,pod,configmap --all -n "$NS" --ignore-not-found

# kind only — remove the controller and the CRDs for a clean slate:
# kubectl delete -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v1.6.1/deploy/default/deploy.yaml
# kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
# or just: kind delete cluster --name workshop
```

## Stretch (optional) — a weighted canary

Split one path across two backends by **weight** — the typed replacement for the
`canary-weight` annotation. Send `/` to `web` and `web2` 90/10 and watch the split.

```bash
kubectl patch httproute web --type=json -p='[
  {"op":"replace","path":"/spec/rules/1/backendRefs","value":[
    {"name":"web","port":80,"weight":90},
    {"name":"web2","port":80,"weight":10}
  ]}
]'

for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8080/; done | sort | uniq -c
```

<details><summary>Solution / what you're looking at</summary>

```console
$ for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8080/; done | sort | uniq -c
  18 hello from web (path /)
   2 hello from web2 (header x-env: canary)
```

Roughly 90/10 across 20 requests (small samples vary). `weight` is a validated integer field
on each `backendRef`, so traffic-splitting is portable and schema-checked — no controller
annotation, no guessing at the format. Undo with `kubectl apply -f route-header.yaml`.
</details>
