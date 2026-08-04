# Lab 09 — Gateway API (S09) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       10s
```

`ACCEPTED=True` means a running controller owns the `eg` class — that name is what your
`Gateway` will reference. If `ACCEPTED` stays `Unknown`, the controller isn't ready yet
(`kubectl -n envoy-gateway-system get pods`) or the `controllerName` doesn't match the
one the controller announces.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f backends.yaml
deployment.apps/web created
service/web created
deployment.apps/web2 created
service/web2 created
$ kubectl rollout status deploy/web && kubectl rollout status deploy/web2
deployment "web" successfully rolled out
deployment "web2" successfully rolled out
```

Each Service listens on port **80** and targets the container's **8080** — `web` serves
`workshop-web v1`, `web2` serves `v2`, so every response names the backend that answered.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get gateway web
NAME   CLASS   ADDRESS   PROGRAMMED   AGE
web    eg                False        15s

$ kubectl get gateway web -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) The Gateway has been scheduled by Envoy Gateway
Programmed=False (AddressNotAssigned) No addresses have been assigned to the Gateway
```

`Accepted=True` — the controller claimed your Gateway and provisioned a data plane for
it: look in the controller's namespace and you'll find a dedicated proxy Service (and
Deployment) that this Gateway now owns:

```console
$ kubectl get svc -n envoy-gateway-system
NAME                        TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
envoy-gateway               ClusterIP      10.96.24.13    <none>        18000/TCP,…    5m
envoy-workshop-web-5c866941 LoadBalancer   10.96.101.87   <pending>     80:31627/TCP   20s
```

`Programmed=False (AddressNotAssigned)` is kind being kind: the provisioned Service is
type `LoadBalancer`, and a kind cluster has no load-balancer controller to hand out an
external IP — `EXTERNAL-IP` stays `<pending>`, so the Gateway never gets an address.
The proxy is still running and configured; you'll reach it with `port-forward` in
Step 4. **This is the observability win already:** instead of an Ingress's silent empty
`ADDRESS`, you get a typed condition with a reason that says exactly what's missing.
On a cloud or shared cluster the LB assigns an address and `PROGRAMMED` flips `True`.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) Route is accepted
ResolvedRefs=True (ResolvedRefs) Resolved all the Object references for the Route

$ curl -H 'Host: web.example.com' http://localhost:8888/
workshop-web v1
pod: web-6f7c9b7f4d-x2m4q
requests served: 1
ready: true
```

`/` routes to the `web` Service — the same backend the Ingress fronted, now behind a
Gateway + HTTPRoute, and the body says so: `workshop-web v1` plus the pod that served
you. `Accepted=True` means a Gateway admitted the route; `ResolvedRefs=True` confirms
every `backendRef` pointed at a real Service and port. (`port-forward` runs in the
background; stop it later with `kill %1` or the cleanup section.)

> If you use a **shared cluster**, replace the `port-forward` line with the address your
> facilitator gave you: `curl http://web.example.com/` (real DNS supplies the `Host`), or
> `curl --resolve web.example.com:80:<gateway-address> http://web.example.com/`.
</details>

**Question:** the HTTPRoute lists `hostnames: [web.example.com]`. What happens to a request
whose `Host` header is something else?

<details><summary>Answer</summary>

```console
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: nope.example.com' http://localhost:8888/
404
```

The listener admits the request, but no `HTTPRoute` hostname matches, so nothing routes —
you get a `404`. `hostnames` on the route narrows which hosts its rules apply to, the same
way an Ingress rule's `host` did.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ curl -sH 'Host: web.example.com' http://localhost:8888/ | head -1
workshop-web v1
$ curl -sH 'Host: web.example.com' -H 'x-env: canary' http://localhost:8888/ | head -1
workshop-web v2
```

Same path `/`, two outcomes — the request carrying `x-env: canary` matches the more
specific rule and lands on `web2` (which answers `workshop-web v2`); everything else
falls through to `web`. That header-based split is a first-class, validated field.
Under Ingress it would have been an untyped controller annotation — if your controller
supported it at all.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f gateway-broken.yaml
gateway.gateway.networking.k8s.io/web-broken created
$ kubectl get gateway web-broken
NAME         CLASS     ADDRESS   PROGRAMMED   AGE
web-broken   eg-typo             Unknown      10s

$ kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=Unknown (Pending) Waiting for controller
Programmed=Unknown (Pending) Waiting for controller

$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       9m
# there is no "eg-typo" GatewayClass — so nothing owns this Gateway
```

The manifest applies fine — it's schema-valid — but the class `eg-typo` doesn't exist, so
**no controller reconciles the Gateway**. Those `Unknown (Pending) Waiting for controller`
conditions are **defaults baked into the CRD itself** — no controller ever touched this
object. Compare Step 3: there the controller *replaced* them with `Accepted=True`. That's
the Gateway API version of Ingress's silent empty `ADDRESS`, except the status names the
problem, and the tell is `kubectl get gatewayclass`: the class you named isn't there.
</details>

**Fix it:** point the broken Gateway at the real class and watch the controller claim it.

```bash
kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'

# it now has its own data plane too — then remove it, one front door is enough:
kubectl delete gateway web-broken
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
gateway.gateway.networking.k8s.io/web-broken patched
$ kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'
Accepted=True (Accepted)
Programmed=False (AddressNotAssigned)
$ kubectl delete gateway web-broken
gateway.gateway.networking.k8s.io/web-broken deleted
```

The moment a real class name appears, the controller accepts the Gateway and provisions
a data plane for it — `Waiting for controller` becomes `Accepted=True` within seconds
(`Programmed` again reports the honest kind reason: no load balancer, no address). Your
original `web` Gateway and its route were never affected.
</details>

**Question:** earlier your HTTPRoute showed `ResolvedRefs=True`. What would make it
`ResolvedRefs=False`, and why is that a *route* condition, not a *Gateway* one?

<details><summary>Answer</summary>

```console
# point a backendRef at a Service that doesn't exist:
$ kubectl patch httproute web --type=json \
  -p='[{"op":"replace","path":"/spec/rules/1/backendRefs/0/name","value":"web-oops"}]'
$ kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) Route is accepted
ResolvedRefs=False (BackendNotFound) service workshop/web-oops not found
```

`ResolvedRefs` is about whether the **route's `backendRefs`** resolve to real Services/ports,
which is the **app team's** concern — so it lives on the HTTPRoute, not the Gateway. `Accepted`
(does a controller own the class, is the listener valid) is the **infra** concern and lives on
the Gateway. Two conditions, two owners — the same role split the whole section is about. Undo
with `kubectl apply -f route-header.yaml`.
</details>

### Stretch (optional) — a weighted canary

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

<details><summary>Solution / what you're looking at</summary>

```console
$ for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8888/; done \
    | grep '^workshop-web' | sort | uniq -c
  18 workshop-web v1
   2 workshop-web v2
```

Roughly 90/10 across 20 requests (small samples vary) — the split is readable straight
off the version line each backend prints. `weight` is a validated integer field on each
`backendRef`, so traffic-splitting is portable and schema-checked — no controller
annotation, no guessing at the format. Undo with `kubectl apply -f route-header.yaml`.
</details>

## Expected state / output

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

Representative statuses include Running/Complete/Failed Pods, Bound PVCs, Accepted
Gateway conditions, or numeric HPA TARGETS — compare meaning, not ephemeral names.

## Explanation

Gateway API separates infra ownership (GatewayClass / Gateway listeners) from app
ownership (HTTPRoute parentRefs and backendRefs). Traffic fails closed until the
controller accepts the attachment and resolves backends, so reading status.conditions
identifies the lane before you rewrite routing rules.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

If the Gateway stays unprogrammed or the HTTPRoute never Accepts, read
`kubectl describe gateway -n "$NS"` and `kubectl describe httproute -n "$NS"` for the failing
condition (Accepted, Programmed, or ResolvedRefs). Restore a known-good attachment with
`kubectl apply -f route.yaml -n "$NS"` after correcting `parentRefs` / `gatewayClassName`, then
retry `curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/"`. Delete only named lab
objects from Cleanup / reset — do not run live namespaced `--all` deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl get gatewayclass
kubectl get gateway -n "$NS" -o yaml | sed -n '/status:/,$p'
kubectl get httproute -n "$NS" -o yaml | sed -n '/status:/,$p'
kubectl apply -f route.yaml -n "$NS"
curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/web" || \
  kubectl -n "$NS" port-forward svc/web 8080:8080
```

### Expected state / output

The HTTPRoute reports Accepted=True and ResolvedRefs=True. A path-routed request
returns the web backend body (or port-forward reaches it). The diagnosis names which
status condition failed and whether the broken field lived on the Gateway (infra) or
HTTPRoute (app).

### Explanation

Gateway API separates infra ownership (GatewayClass / Gateway listeners) from app
ownership (HTTPRoute parentRefs and backendRefs). Traffic fails closed until the
controller accepts the attachment and resolves backends, so reading status.conditions
identifies the lane before you rewrite routing rules.

### Hints

Compare Gateway status.conditions with the HTTPRoute parentRefs and backendRefs;
inspect the GatewayClass name before editing the route.
