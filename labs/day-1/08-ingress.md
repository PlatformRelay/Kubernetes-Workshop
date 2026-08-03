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
- Lab 00 complete: `$NS` is set and is your default namespace
  (`kubectl config view --minify | grep namespace:` shows it).
- kind path: the Lab 00 `workshop` cluster (created from `infra/kind/cluster.yaml`, which
  maps container ports 80/443 to `127.0.0.1:80/443`) and admin over it.
- Shared-cluster path: your assigned namespace `$NS`, the ingress controller's
  **class name**, and two assigned **DNS hostnames** that resolve to the ingress endpoint.

Choose exactly one environment and set all four variables. Shared-cluster learners must
replace the placeholders with values from the facilitator; do not reuse the kind examples.

```bash
# Local kind: generate a workshop-specific class name for this disposable cluster.
export LAB_ENV=kind
export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"
export WEB_HOST=web.example.com
export WEB2_HOST=web2.example.com

# Shared cluster (use these four lines instead, with real assigned values):
# export LAB_ENV=shared
# export INGRESS_CLASS=<facilitator-provided-class>
# export WEB_HOST=<assigned-v1-dns-hostname>
# export WEB2_HOST=<assigned-v2-dns-hostname>

case "$LAB_ENV" in kind|shared) ;; *) echo "LAB_ENV must be kind or shared" >&2; false ;; esac
if [ "$LAB_ENV" = shared ]; then
  kubectl get ingressclass "$INGRESS_CLASS" >/dev/null || {
    echo "Ask the facilitator for an existing permitted IngressClass" >&2
    false
  }
fi
```

## Files used

- `backends.yaml` — two Deployments + Services: `web` (image `workshop-web:v1`) and `web2`
  (image `workshop-web:v2`). The workshop image is a tiny Go server on **:8080** whose
  response body prints its **version**, pod name, request count, and readiness — so you can
  always tell which backend answered.
- `ingressclass.yaml` — the generated workshop-specific IngressClass (kind path; Step 2).
- `ingress.yaml` — the Ingress routing `$WEB_HOST` → `web` and `$WEB2_HOST` → `web2`
  (the manifest the slide magic-move builds).
- `ingress-no-pathtype.yaml` — a deliberately broken copy with `pathType` removed (Step 6).

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./08-ingress.solution.md#guided-solutions)

### Step 1 (kind only) — install the Contour ingress controller

The version is pinned to match `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

First prove the generated class is not already claimed by either an IngressClass object or a
controller argument. Stop instead of taking over a collision. Then install Contour and configure
this lab's controller to watch only that class.

```bash
if kubectl get ingressclass "$INGRESS_CLASS" >/dev/null 2>&1 ||
   kubectl get deployment -A \
     -o jsonpath='{range .items[*]}{range .spec.template.spec.containers[*].args}{.}{"\n"}{end}{end}' \
     | grep -Fx -- "--ingress-class-name=$INGRESS_CLASS"; then
  echo "Ingress class collision: $INGRESS_CLASS" >&2
  false
fi

kubectl apply -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml
kubectl -n projectcontour patch deployment contour --type=json \
  -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--ingress-class-name=$INGRESS_CLASS\"}]"

# Wait until both halves are ready: the contour controller (Deployment)
# and the envoy data plane (DaemonSet):
kubectl -n projectcontour rollout status deployment/contour --timeout=180s
kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
kubectl -n projectcontour get pods
```

---

### Step 2 (kind only) — create the IngressClass

The Contour quickstart ships no IngressClass object. Create the generated matchmaker now; its
name is also the class argument you added to this lab's Contour Deployment:

```bash
cat > ingressclass.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: ${INGRESS_CLASS}
spec:
  controller: projectcontour.io/ingress-controller
EOF

kubectl apply -f ingressclass.yaml
kubectl get ingressclass "$INGRESS_CLASS"
kubectl -n projectcontour get deployment contour \
  -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -F -- "--ingress-class-name=$INGRESS_CLASS"
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
cat > ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: ${INGRESS_CLASS}  # must match `kubectl get ingressclass`
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # everything on this host → the v1 backend
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: ${WEB2_HOST}           # second site, same single entry point
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
if [ "$LAB_ENV" = kind ]; then
  # Envoy is published on loopback; Host selects the Ingress rule.
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/
else
  # Assigned DNS names resolve to the facilitator-managed ingress endpoint.
  curl -fsS "http://$WEB_HOST/"
  curl -fsS "http://$WEB2_HOST/"
fi
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
cat > ingress-no-pathtype.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: ${INGRESS_CLASS}
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # pathType deliberately omitted
            backend: { service: { name: web, port: { number: 80 } } }
EOF

kubectl apply -f ingress-no-pathtype.yaml
```

**Task:** does the apply succeed? What is the error, and which line is it about?

**Break 2 (silent).** Now point `ingressClassName` at a generated class **nobody owns**:

```bash
UNOWNED_CLASS="${INGRESS_CLASS}-unowned"
kubectl get ingressclass "$UNOWNED_CLASS" --ignore-not-found
kubectl patch ingress web --type=merge \
  -p "{\"spec\":{\"ingressClassName\":\"$UNOWNED_CLASS\"}}"
if [ "$LAB_ENV" = kind ]; then
  curl -sS -o /dev/null -w 'http=%{http_code}\n' \
    -H "Host: $WEB_HOST" http://127.0.0.1/ ; echo "curl exit=$?"
else
  curl -sS -o /dev/null -w 'http=%{http_code}\n' \
    "http://$WEB_HOST/" ; echo "curl exit=$?"
fi
```

**Task:** the patch succeeded but routing stopped. Depending on the controller's current
configuration, curl may receive a 404 or a reset (`http=000`). Why did the API accept the
change, and where would you diagnose it?

**Fix both:** re-apply the good manifest and confirm routing recovers.

```bash
kubectl apply -f ingress.yaml
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/ | head -1
else
  curl -fsS "http://$WEB_HOST/" | head -1
fi
```

**Question:** you could also *mistype* the pathType — `pathType: Prefixx`. Loud or silent?

## Observe

- The controller is **two halves**: a `contour` Deployment (watches the API) and an `envoy`
  DaemonSet (moves the packets) — matching the object-vs-engine mental model.
- The quickstart ships **no IngressClass**; on kind you generated an unclaimed workshop-specific
  name, configured Contour to watch it, and created the matching class object. On shared clusters,
  you reused only the facilitator-approved existing class.
- On kind the Ingress **`ADDRESS` stays empty** (the envoy `LoadBalancer` Service is
  `<pending>` — no LB provider), yet routing **works** via the node's ports 80/443 mapped to
  `127.0.0.1`. Empty ADDRESS ≠ broken; `describe` + `curl` are the truth.
- `$WEB_HOST` answers **`workshop-web v1`**, `$WEB2_HOST` answers
  **`workshop-web v2`** — host-based fan-out, provable from the response body.
- An undeclared host returns **404** from the proxy.
- A missing (or mistyped) `pathType` is **rejected at apply time** — loud. A wrong
  `ingressClassName` applies cleanly and just **stops routing** — silent.

## Challenge

Create a self-signed cert as a Secret and reference it in the Ingress.

**Difficulty:** Advanced

**Success criteria:** Prove HTTPS reaches the correct backend in your selected environment,
report the returned application version, and explain why TLS needs SNI rather than only an
HTTP Host header.

**Hints:** Branch on `LAB_ENV`; kind needs `curl --resolve` for DNS and SNI, while shared
clusters use the facilitator-provided DNS host directly.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=$WEB_HOST" \
  -addext "subjectAltName=DNS:$WEB_HOST"
kubectl create secret tls web-tls -n "$NS" --cert=tls.crt --key=tls.key
kubectl patch ingress web -n "$NS" --type=merge \
  -p "{\"spec\":{\"tls\":[{\"hosts\":[\"$WEB_HOST\"],\"secretName\":\"web-tls\"}]}}"
if [ "$LAB_ENV" = kind ]; then
  curl --noproxy '*' -sk --resolve "$WEB_HOST:443:127.0.0.1" \
    "https://$WEB_HOST/" | head -1
else
  curl -sk "https://$WEB_HOST/" | head -1
fi
```

[Spoiler: challenge solution](./08-ingress.solution.md#challenge-solution)

### Extension 2 (optional, read-only) — preview the Gateway API translation

This extension is **not part of the challenge success criteria or verification**. The bootstrap
does not install or pin this tool, and output shape can vary by version; skip it when unavailable.

The retirement slide's bridge is a real tool: **`ingress2gateway`**
([kubernetes-sigs/ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway))
mechanically converts Ingress resources into Gateway API resources. If you have it
installed, run it against your manifest — it changes nothing on the cluster:

```bash
# Providers are named for the annotation dialects the tool can translate; our
# Ingress uses only spec fields, so the provider choice here only tells the tool
# which ingress class name to read:
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class="$INGRESS_CLASS" --input-file ingress.yaml
```

**Task:** which Gateway API kinds appear in the output, and where did your two `host:`
rules go?

## Verify

Verify the live object and both routes before cleanup.

```bash
kubectl get ingress web -n "$NS"
if [ "$LAB_ENV" = kind ]; then
  curl --noproxy '*' -fkSs --resolve "$WEB_HOST:443:127.0.0.1" \
    "https://$WEB_HOST/" | head -1
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/ | head -1
else
  curl -fkSs "https://$WEB_HOST/" | head -1
  curl -fsS "http://$WEB2_HOST/" | head -1
fi
```

Expected: the Ingress exists; the two requests print `workshop-web v1` and
`workshop-web v2` respectively.

## Cleanup / reset

```bash
kubectl delete -f ingress.yaml -f backends.yaml -n "$NS" --ignore-not-found
rm -f ingress-no-pathtype.yaml   # the broken copy never applied; just a local file
kubectl delete secret web-tls -n "$NS" --ignore-not-found   # TLS Secret from the Challenge (Verify needs HTTPS)
rm -f tls.key tls.crt                              # self-signed cert files from the Challenge
# full namespace reset:
kubectl delete ingress,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found

# kind only — remove cluster-scoped resources that this lab installed:
if [ "$LAB_ENV" = kind ]; then
  kubectl delete -f ingressclass.yaml --ignore-not-found
  kubectl delete -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml --ignore-not-found
fi
```
