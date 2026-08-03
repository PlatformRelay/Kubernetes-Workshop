# Lab 08 — Ingress (S08)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S08 — Ingress *(red line 4/5)* |
| **Environment** | namespace ✓ / kind ✓ *(ingress controller required)* |
| **Estimated time** | 25 min |

## Objective

Put an **Ingress** in front of your Services to route external HTTP by **host** to two
backends, and learn the hard truth that an `Ingress` object does nothing without a
**controller** running behind it. Red-line step **4 of 5**: the Ingress is the north-south
entry point in front of the Lab 07 Service pattern.

The controller in this lab is **Contour** (CNCF, Envoy-based). The Ingress *API* is frozen
but stable and everywhere; its long-time reference controller (ingress-nginx) was retired in
March 2026, so the controller behind the API is now a choice you make — here, Contour.

> **Environment honesty.** Ingress needs a cluster-wide **ingress controller**.
>
> - **kind:** you install one yourself (admin) — Contour, from a pinned quickstart. Your
>   Lab 00 cluster already publishes ports 80/443 to `localhost`, so no cluster rebuild is
>   needed.
> - **Shared cluster:** the controller already exists; your facilitator gives you
>   **hostnames** that route to it. You do **not** install anything.
>
> Follow the path for your environment; both converge on the same Ingress manifest and the
> same curls.

## Prerequisites

- Labs 05–07 concepts (Deployment + Service). This lab **recreates its own backends**, so it
  does not depend on leftovers from Lab 07.
- kind path: the Lab 00 `workshop` cluster (created from `infra/kind/cluster.yaml`, which
  maps container ports 80/443 to `localhost:80/443`) and admin over it.
- Shared-cluster path: your assigned namespace `$NS`, the ingress controller's
  **class name**, and your two assigned **hostnames** (ask your facilitator; examples below
  use `web.example.com` and `web2.example.com`).

## Files used

- `backends.yaml` — two Deployments + Services: `web` (image `workshop-web:v1`) and `web2`
  (image `workshop-web:v2`). The workshop image is a tiny Go server on **:8080** whose
  response body prints its **version**, pod name, request count, and readiness — so you can
  always tell which backend answered.
- `ingressclass.yaml` — the `contour` IngressClass (kind path; Step 2).
- `ingress.yaml` — the Ingress routing `web.example.com` → `web` and `web2.example.com` →
  `web2` (the manifest the slide magic-move builds).
- `ingress-no-pathtype.yaml` — a deliberately broken copy with `pathType` removed (Step 6).

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./08-ingress.solution.md#guided-solutions)

### Step 1 (kind only) — install the Contour ingress controller

The version is pinned to match `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml

# Wait until both halves are ready: the contour controller (Deployment)
# and the envoy data plane (DaemonSet):
kubectl -n projectcontour rollout status deployment/contour --timeout=180s
kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
kubectl -n projectcontour get pods
```

---

### Step 2 (kind only) — create the IngressClass

Run `kubectl get ingressclass` right now: **it's empty.** The Contour quickstart ships the
controller but **no IngressClass object** — the matchmaker between your Ingress and the
controller is something you declare. Create it:

```bash
cat > ingressclass.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: contour
spec:
  controller: projectcontour.io/ingress-controller
EOF

kubectl apply -f ingressclass.yaml
kubectl get ingressclass
```

**Question:** how does Contour decide which Ingresses are *its*? (Hint: it's the name.)

---

### Step 3 — deploy two distinguishable backends

`web` runs the workshop image at **v1**, `web2` the same image at **v2**. The server listens
on **8080** in the container; each Service exposes it as port **80** (`port: 80` →
`targetPort: 8080`) — so everything downstream talks to the Service port.

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

### Step 4 — add the Ingress

One Ingress, one entry point, **two hosts**: the `Host` header decides which Service gets
the request.

```bash
cat > ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostnames
      http:
        paths:
          - path: /                # everything on this host → the v1 backend
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: web2.example.com       # second site, same single entry point
      http:
        paths:
          - path: /                # → the v2 backend
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
EOF

kubectl apply -f ingress.yaml
kubectl get ingress web
kubectl describe ingress web      # confirm the rules, pathType, and backends
```

> This is the same manifest the slide magic-move builds up field by field. Each rule's
> `backend` points at a **Service** (never a Pod directly), and the port number **80** is
> the *Service* port — the Service maps it to the container's 8080. Every path **must**
> carry a `pathType` — Step 6 proves what happens when it doesn't.

---

### Step 5 — route by host

Send requests to the one entry point; the `Host` header decides which backend answers.

```bash
# kind path (envoy published on localhost:80 via the Lab 00 port mappings):
curl -sH 'Host: web.example.com'  http://localhost/
curl -sH 'Host: web2.example.com' http://localhost/

# Shared-cluster path (real hostnames resolve to the ingress load balancer):
# curl http://web.example.com/        # substitute your assigned hostnames
# curl http://web2.example.com/
```

**Task:** which version answers each hostname? How can you tell?

**Question:** what does a request for a host the Ingress does **not** define return?

**Question:** older tutorials route by *path* on one host (`/` → v1, `/v2` → v2). Why does
this lab route by host instead?

---

### Step 6 — break it twice: one loud failure, one silent

**Break 1 (loud).** `pathType` has **no default** — the API server requires it on every
path. Prove it: write a copy of the Ingress with the field removed and try to apply it.

```bash
cat > ingress-no-pathtype.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /                # pathType deliberately omitted
            backend: { service: { name: web, port: { number: 80 } } }
EOF

kubectl apply -f ingress-no-pathtype.yaml
```

**Task:** does the apply succeed? What is the error, and which line is it about?

**Break 2 (silent).** Now point `ingressClassName` at a class **nobody owns**:

```bash
kubectl patch ingress web --type=merge -p '{"spec":{"ingressClassName":"legacy"}}'
curl -sS -o /dev/null -w 'http=%{http_code}\n' \
  -H 'Host: web.example.com' http://localhost/ ; echo "curl exit=$?"
```

**Task:** the patch succeeded but routing stopped. Depending on the controller's current
configuration, curl may receive a 404 or a reset (`http=000`). Why did the API accept the
change, and where would you diagnose it?

**Fix both:** re-apply the good manifest and confirm routing recovers.

```bash
kubectl apply -f ingress.yaml
curl -sH 'Host: web.example.com' http://localhost/ | head -1
```

**Question:** you could also *mistype* the pathType — `pathType: Prefixx`. Loud or silent?

## Observe

- The controller is **two halves**: a `contour` Deployment (watches the API) and an `envoy`
  DaemonSet (moves the packets) — matching the object-vs-engine mental model.
- The quickstart ships **no IngressClass**; you created the matchmaker yourself, and
  `kubectl get ingressclass` now proves who owns the `contour` name.
- On kind the Ingress **`ADDRESS` stays empty** (the envoy `LoadBalancer` Service is
  `<pending>` — no LB provider), yet routing **works** via the node's ports 80/443 mapped to
  `localhost`. Empty ADDRESS ≠ broken; `describe` + `curl` are the truth.
- `web.example.com` answers **`workshop-web v1`**, `web2.example.com` answers
  **`workshop-web v2`** — host-based fan-out, provable from the response body.
- An undeclared host returns **404** from the proxy.
- A missing (or mistyped) `pathType` is **rejected at apply time** — loud. A wrong
  `ingressClassName` applies cleanly and just **stops routing** — silent.

## Challenge

Create a self-signed cert as a Secret and reference it in the Ingress.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=web.example.com"
kubectl create secret tls web-tls --cert=tls.crt --key=tls.key
kubectl patch ingress web --type=merge \
  -p '{"spec":{"tls":[{"hosts":["web.example.com"],"secretName":"web-tls"}]}}'
curl --noproxy '*' -sk --resolve web.example.com:443:127.0.0.1 \
  https://web.example.com/ | head -1
```

[Spoiler: challenge solution](./08-ingress.solution.md#challenge-solution)

### Extension 2 (optional, read-only) — preview the Gateway API translation

The retirement slide's bridge is a real tool: **`ingress2gateway`**
([kubernetes-sigs/ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway))
mechanically converts Ingress resources into Gateway API resources. If you have it
installed, run it against your manifest — it changes nothing on the cluster:

```bash
# Providers are named for the annotation dialects the tool can translate; our
# Ingress uses only spec fields, so the provider choice here only tells the tool
# which ingress class name to read:
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class=contour --input-file ingress.yaml
```

**Task:** which Gateway API kinds appear in the output, and where did your two `host:`
rules go?

## Verify

Verify the live object and both routes before cleanup.

```bash
kubectl get ingress web -n "$NS"
# kind path:
if kubectl get secret web-tls -n "$NS" >/dev/null 2>&1; then
  curl --noproxy '*' -fkSs --resolve web.example.com:443:127.0.0.1 \
    https://web.example.com/ | head -1
else
  curl -fsS -H 'Host: web.example.com' http://localhost/ | head -1
fi
curl -fsS -H 'Host: web2.example.com' http://localhost/ | head -1
# shared path: use the two hostnames assigned by the facilitator instead.
```

Expected: the Ingress exists; the two requests print `workshop-web v1` and
`workshop-web v2` respectively.

## Cleanup / reset

```bash
kubectl delete -f ingress.yaml -f backends.yaml -n "$NS" --ignore-not-found
rm -f ingress-no-pathtype.yaml   # the broken copy never applied; just a local file
kubectl delete secret web-tls -n "$NS" --ignore-not-found   # TLS Secret from the stretch (if you did it)
rm -f tls.key tls.crt                              # self-signed cert files from the stretch
# full namespace reset:
kubectl delete ingress,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found

# kind only — remove the IngressClass and the Contour install for a clean slate:
kubectl delete -f ingressclass.yaml --ignore-not-found
kubectl delete -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml --ignore-not-found
```
