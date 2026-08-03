# Lab 08 — Ingress (S08) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

Set the same explicit environment variables as the participant lab before running any step:

```bash
# Local kind defaults; shared-cluster learners replace all four values as instructed.
export LAB_ENV=kind
export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"
export WEB_HOST=web.example.com
export WEB2_HOST=web2.example.com
case "$LAB_ENV" in kind|shared) ;; *) echo "LAB_ENV must be kind or shared" >&2; false ;; esac
if [ "$LAB_ENV" = shared ]; then
  kubectl get ingressclass "$INGRESS_CLASS" >/dev/null || {
    echo "Ask the facilitator for an existing permitted IngressClass" >&2
    false
  }
fi
```

### Step 1 (kind only) — install the Contour ingress controller

The version is pinned to match `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n projectcontour rollout status deployment/contour --timeout=180s
deployment "contour" successfully rolled out
$ kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
daemon set "envoy" successfully rolled out
$ kubectl -n projectcontour get pods
NAME                            READY   STATUS      RESTARTS   AGE
contour-58f6f9b7d4-8xkvq        1/1     Running     0          90s
contour-58f6f9b7d4-tzstx        1/1     Running     0          90s
contour-certgen-v1-33-5-w6c8h   0/1     Completed   0          90s
envoy-m5kwp                     2/2     Running     0          90s
```

Two halves, matching the slide's mental model: **contour** (the controller — watches Ingress
objects) and **envoy** (the data plane — actually proxies traffic). The `contour-certgen`
Job runs once to wire TLS between them and then shows `Completed`. The envoy DaemonSet binds
**hostPorts 80/443** on the node; your Lab 00 kind config maps those to `127.0.0.1:80/443`,
which is how your curls will get in.
</details>

<details><summary>Shared-cluster path — do this instead of Steps 1–2</summary>

Do **not** install or patch anything. Confirm the facilitator-approved class exists:

```console
$ kubectl get ingressclass
NAME      CONTROLLER                             PARAMETERS   AGE
contour   projectcontour.io/ingress-controller   <none>       30d
```

Set `INGRESS_CLASS`, `WEB_HOST`, and `WEB2_HOST` to the facilitator-provided values. This is the
safe alternative when policy prevents arbitrary classes: skip every step labelled `kind only`;
the shared path never creates, patches, or deletes cluster-scoped resources.
</details>

---

### Step 2 (kind only) — create the IngressClass

The quickstart has no class object. Create the generated class whose name matches the controller
argument added in Step 1:

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f ingressclass.yaml
ingressclass.networking.k8s.io/contour created
$ kubectl get ingressclass "$INGRESS_CLASS"
NAME                            CONTROLLER                             PARAMETERS   AGE
platformrelay-lab08-a1b2c3d4   projectcontour.io/ingress-controller   <none>       5s
```

The generated **IngressClass** now exists — that *name* is what your Ingress will reference
in `ingressClassName`. The `controller:` string records which implementation owns the class.
</details>

**Question:** how does Contour decide which Ingresses are *its*? (Hint: it's the name.)

<details><summary>Answer</summary>

By **class name**. The `--ingress-class-name=$INGRESS_CLASS` argument restricts this lab's Contour
instance to the generated name, and the IngressClass object publishes the same contract through
the Kubernetes API. The preflight prevents the lab from claiming an existing name. On a shared
cluster you reuse the facilitator-approved class instead of changing controller configuration.
</details>

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

Each pod answers every request with a body like `workshop-web v1` / `workshop-web v2` plus
its pod name — no ConfigMap tricks needed to tell the backends apart.
</details>

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
  ingressClassName: ${INGRESS_CLASS}
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # everything on this host → the v1 backend
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: ${WEB2_HOST}
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get ingress web
NAME   CLASS     HOSTS                              ADDRESS   PORTS   AGE
web    contour   web.example.com,web2.example.com             80      15s

$ kubectl describe ingress web
Name:             web
Ingress Class:    contour
Rules:
  Host              Path  Backends
  ----              ----  --------
  web.example.com
                    /   web:80 (10.244.0.11:8080,10.244.0.12:8080)
  web2.example.com
                    /   web2:80 (10.244.0.13:8080,10.244.0.14:8080)
...
```

**On kind, `ADDRESS` stays empty — and that's expected, not broken.** Contour publishes the
external IP of its `envoy` Service (type `LoadBalancer`) into the Ingress status, and on a
kind cluster there is no load-balancer provider, so that Service sits at `<pending>` forever.
Traffic still flows: the envoy DaemonSet listens on the node's ports 80/443 directly, and
Lab 00's kind config maps those to `127.0.0.1`. On a cloud or shared cluster, `ADDRESS`
fills in with the load-balancer address after a few seconds.

`describe` is the real health check here: each host resolved to its backend **endpoints on
:8080** — the controller accepted the class, and the Services resolved.
</details>

---

### Step 5 — route by host

Send requests to the one entry point; the `Host` header decides which backend answers.

```bash
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/
else
  curl -fsS "http://$WEB_HOST/"
  curl -fsS "http://$WEB2_HOST/"
fi
```

**Task:** which version answers each hostname? How can you tell?

<details><summary>Solution / expected output</summary>

Representative kind output (the exported kind defaults are shown here):

```console
$ curl -sH 'Host: web.example.com'  http://127.0.0.1/
workshop-web v1
pod: web-6f8c9d7b4-x2lqp
requests served: 1
ready: true
$ curl -sH 'Host: web2.example.com' http://127.0.0.1/
workshop-web v2
pod: web2-7b9d5c6f8-lm4tt
requests served: 1
ready: true
```

The body says it outright: `workshop-web v1` came from the `web` Service,
`workshop-web v2` from `web2` — one Ingress, one IP, host-based fan-out to two Services.
The pod name confirms *which replica* served you; curl a host twice and watch it alternate.
(The `Host:` header is how the controller picks the rule; on the shared cluster real DNS
supplies it, so you curl the hostname directly. `curl --resolve web.example.com:80:<ip>` is
the trick when DNS isn't wired up.)
</details>

**Question:** what does a request for a host the Ingress does **not** define return?

<details><summary>Answer</summary>

```bash
if [ "$LAB_ENV" = kind ]; then
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: nope.example.com' http://127.0.0.1/
else
  # Use an unassigned host only when the facilitator confirms it resolves to this ingress endpoint.
  echo "Ask the facilitator for the shared-cluster unmatched-host check"
fi
```

**404** — straight from the proxy. No rule matched the host and this Ingress defines no
`defaultBackend`, so there is nothing to route to. An Ingress only handles hosts/paths you
declare; everything else dies at the front door.
</details>

**Question:** older tutorials route by *path* on one host (`/` → v1, `/v2` → v2). Why does
this lab route by host instead?

<details><summary>Answer</summary>

Because Ingress forwards the path **as-is** — and our app only serves `/`. With a
`path: /v2` rule, the request arriving at `web2` still has the path `/v2`, and the backend
answers **404**. For path fan-out you either need backends that actually serve those paths,
or a **path rewrite on the way through** — and a rewrite is *not expressible in the Ingress
spec*. It only exists as controller-specific annotations, which is exactly the "annotation
sprawl" pain-point on the slides. Gateway API (next section) makes rewrites a **typed
field** (`URLRewrite` filter).
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f ingress-no-pathtype.yaml
The Ingress "web" is invalid: spec.rules[0].http.paths[0].pathType: Required value: pathType must be specified
```

The manifest is **rejected at apply time** — a schema validation failure, not a runtime 404.
Nothing changes on the cluster: your working Ingress from Step 4 is still serving. Because
`pathType` has no server-side default, an old example that omits it (they were legal in the
long-gone `extensions/v1beta1` API) will not apply on a modern cluster.
</details>

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

<details><summary>Solution / expected output</summary>

Representative kind output:

```console
$ kubectl patch ingress web --type=merge -p '{"spec":{"ingressClassName":"platformrelay-lab08-a1b2c3d4-unowned"}}'
ingress.networking.k8s.io/web patched
$ curl -sS -o /dev/null -w 'http=%{http_code}\n' -H 'Host: web.example.com' http://127.0.0.1/ ; echo "curl exit=$?"
curl: (56) Recv failure: Connection reset by peer
http=000
curl exit=56
```

This is the real 2026-08-03 kind/Contour replay. A 404 is also valid when the data plane
keeps a default virtual host. The manifest is schema-valid, so the API server accepts it;
no controller owns the generated `-unowned` class, Contour withdraws the route, and the symptom
is controller-dependent. Diagnose by comparing `ingressClassName` with
`kubectl get ingressclass`, then inspect Ingress events and controller logs.
</details>

**Fix both:** re-apply the good manifest and confirm routing recovers.

```bash
kubectl apply -f ingress.yaml
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/ | head -1
else
  curl -fsS "http://$WEB_HOST/" | head -1
fi
```

<details><summary>Solution / expected output</summary>

Representative kind output:

```console
$ kubectl apply -f ingress.yaml
ingress.networking.k8s.io/web configured
$ curl -sH 'Host: web.example.com' http://127.0.0.1/ | head -1
workshop-web v1
```

Restoring `ingressClassName: $INGRESS_CLASS` lets the selected controller claim the Ingress again; it
re-programs envoy within a second or two. (Break 1 never touched the live object — the API
server rejected it outright — so the class patch was the only thing to undo.)
</details>

**Question:** you could also *mistype* the pathType — `pathType: Prefixx`. Loud or silent?

<details><summary>Answer</summary>

```console
$ kubectl apply -f - <<'EOF'
... pathType: Prefixx ...
EOF
The Ingress "web" is invalid: spec.rules[0].http.paths[0].pathType: Unsupported value: "Prefixx": supported values: "Exact", "ImplementationSpecific", "Prefix"
```

Loud — rejected by the same schema validation, and the mistype error is even more helpful:
it **lists the three valid values**. Rule of thumb: mistakes *inside the schema* fail loud
at apply; mistakes *about the world around the object* (a class nobody owns, a Service that
doesn't exist) fail silent at runtime.
</details>

## Expected state / output

- The controller is **two halves**: a `contour` Deployment (watches the API) and an `envoy`
  DaemonSet (moves the packets) — matching the object-vs-engine mental model.
- The quickstart ships **no IngressClass**; you created the matchmaker yourself, and
  `kubectl get ingressclass` now proves who owns the `contour` name.
- On kind the Ingress **`ADDRESS` stays empty** (the envoy `LoadBalancer` Service is
  `<pending>` — no LB provider), yet routing **works** via the node's ports 80/443 mapped to
  `127.0.0.1`. Empty ADDRESS ≠ broken; `describe` + `curl` are the truth.
- `$WEB_HOST` answers **`workshop-web v1`**, `$WEB2_HOST` answers
  **`workshop-web v2`** — host-based fan-out, provable from the response body.
- An undeclared host returns **404** from the proxy.
- A missing (or mistyped) `pathType` is **rejected at apply time** — loud. A wrong
  `ingressClassName` applies cleanly and just **stops routing** — silent.

## Explanation

The Ingress object declares host/path routing, but it only works because a matching
IngressClass and controller
turn that declaration into proxy configuration. Schema mistakes fail loudly at admission;
environment mistakes such as an unowned class fail at runtime. TLS routing additionally
uses SNI before HTTP headers exist.

## Troubleshooting and recovery

If the Ingress applies but does not route, compare
`spec.ingressClassName` with `kubectl get ingressclass` and inspect controller events.
For local kind, restore the known-good object with `kubectl apply -f ingress.yaml`.
On a shared cluster, do not install or remove the controller; ask the facilitator for the
assigned class and hostnames.

## Challenge solution

### Commands / manifest

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=$WEB_HOST" \
  -addext "subjectAltName=DNS:$WEB_HOST"
kubectl create secret tls web-tls -n "$NS" --cert=tls.crt --key=tls.key
kubectl patch ingress web -n "$NS" --type=merge \
  -p "{\"spec\":{\"tls\":[{\"hosts\":[\"$WEB_HOST\"],\"secretName\":\"web-tls\"}]}}"
case "$LAB_ENV" in
  kind) curl --noproxy '*' -sk --resolve "$WEB_HOST:443:127.0.0.1" "https://$WEB_HOST/" ;;
  shared) curl --noproxy '*' -sk "https://$WEB_HOST/" ;;
esac
```

### Expected state / output

HTTPS returns `workshop-web v1`, proving that TLS terminates at the selected Ingress route.

### Explanation

On kind, `--resolve` supplies both the connection address and TLS SNI; a Host header alone is too
late for certificate selection. On a shared cluster, the facilitator-provided DNS name supplies both.

### Hints

Branch on `LAB_ENV`; kind needs `curl --resolve` for DNS and SNI, while shared clusters use the
facilitator-provided DNS host directly.

### Optional extension answer

`ingress2gateway` is not installed or pinned by the bootstrap, so its preview is deliberately not
part of challenge verification. When an approved version is already available, inspect its output
for Gateway API resource kinds and `hostnames`; do not assert a fixed resource count across versions.
