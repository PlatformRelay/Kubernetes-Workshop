# Lab 08 — Ingress (S08)

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

## Step 1 (kind only) — install the Contour ingress controller

The version is pinned to match `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml

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
**hostPorts 80/443** on the node; your Lab 00 kind config maps those to `localhost:80/443`,
which is how your curls will get in.
</details>

<details><summary>Shared-cluster path — do this instead of Steps 1–2</summary>

Do **not** install anything. Confirm the controller's class exists, and note its name:

```console
$ kubectl get ingressclass
NAME      CONTROLLER                             PARAMETERS   AGE
contour   projectcontour.io/ingress-controller   <none>       30d
```

Use that class name in `ingress.yaml` (replace `contour` if your cluster's class differs),
and use the **hostnames your facilitator assigned** instead of `web.example.com` /
`web2.example.com`. Skip every `kind`-specific command below.
</details>

---

## Step 2 (kind only) — create the IngressClass

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f ingressclass.yaml
ingressclass.networking.k8s.io/contour created
$ kubectl get ingressclass
NAME      CONTROLLER                             PARAMETERS   AGE
contour   projectcontour.io/ingress-controller   <none>       5s
```

The `contour` **IngressClass** now exists — that *name* is what your Ingress will reference
in `ingressClassName`. The `controller:` string records which implementation owns the class.
</details>

**Question:** how does Contour decide which Ingresses are *its*? (Hint: it's the name.)

<details><summary>Answer</summary>

By **class name**. Without extra configuration, Contour accepts every Ingress whose
`ingressClassName` (or legacy annotation) is **`contour`** — or that sets **no class at
all**. It doesn't even require the IngressClass *object* to exist to route traffic; the
object is the cluster's public record of the class (it's what `kubectl get ingressclass`
shows, and where a default class would be marked). Other controllers are stricter — always
check `kubectl get ingressclass` first on an unfamiliar cluster. Step 6 shows what happens
when the name doesn't match anything.
</details>

---

## Step 3 — deploy two distinguishable backends

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

## Step 4 — add the Ingress

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
Lab 00's kind config maps those to `localhost`. On a cloud or shared cluster, `ADDRESS`
fills in with the load-balancer address after a few seconds.

`describe` is the real health check here: each host resolved to its backend **endpoints on
:8080** — the controller accepted the class, and the Services resolved.
</details>

---

## Step 5 — route by host

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

<details><summary>Solution / expected output</summary>

```console
$ curl -sH 'Host: web.example.com'  http://localhost/
workshop-web v1
pod: web-6f8c9d7b4-x2lqp
requests served: 1
ready: true
$ curl -sH 'Host: web2.example.com' http://localhost/
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

```console
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: nope.example.com' http://localhost/
404
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

## Step 6 — break it twice: one loud failure, one silent

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

**Break 2 (silent).** Now point `ingressClassName` at a class **nobody owns**:

```bash
kubectl patch ingress web --type=merge -p '{"spec":{"ingressClassName":"legacy"}}'
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: web.example.com' http://localhost/
```

**Task:** the patch succeeded — so why is the curl a 404? Where is the error message?

<details><summary>Solution / expected output</summary>

```console
$ kubectl patch ingress web --type=merge -p '{"spec":{"ingressClassName":"legacy"}}'
ingress.networking.k8s.io/web patched
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: web.example.com' http://localhost/
404
```

**There is no error message — anywhere.** The manifest is perfectly valid, so the API server
accepts it. But no controller owns a class called `legacy`, so Contour simply stops
reconciling this Ingress and withdraws its routes. The object sits there looking healthy
while routing nothing — the *silent* failure mode from the slides, and the first thing to
check when "the Ingress doesn't work": does `ingressClassName` match
`kubectl get ingressclass`?
</details>

**Fix both:** re-apply the good manifest and confirm routing recovers.

```bash
kubectl apply -f ingress.yaml
curl -sH 'Host: web.example.com' http://localhost/ | head -1
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f ingress.yaml
ingress.networking.k8s.io/web configured
$ curl -sH 'Host: web.example.com' http://localhost/ | head -1
workshop-web v1
```

Restoring `ingressClassName: contour` lets the controller claim the Ingress again; it
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

## Expected observations

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

## Cleanup / panic reset

```bash
kubectl delete -f ingress.yaml -f backends.yaml --ignore-not-found
rm -f ingress-no-pathtype.yaml   # the broken copy never applied; just a local file
kubectl delete secret web-tls --ignore-not-found   # TLS Secret from the stretch (if you did it)
rm -f tls.key tls.crt                              # self-signed cert files from the stretch
# full namespace reset:
kubectl delete ingress,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found

# kind only — remove the IngressClass and the Contour install for a clean slate:
kubectl delete -f ingressclass.yaml --ignore-not-found
kubectl delete -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml --ignore-not-found
```

## Stretch 1 (optional) — TLS termination

Create a self-signed cert as a Secret and reference it in the Ingress.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=web.example.com"
kubectl create secret tls web-tls --cert=tls.crt --key=tls.key
kubectl patch ingress web --type=merge \
  -p '{"spec":{"tls":[{"hosts":["web.example.com"],"secretName":"web-tls"}]}}'
curl -sk -H 'Host: web.example.com' https://localhost/ | head -1
```

<details><summary>Solution / what you're looking at</summary>

```console
$ curl -sk -H 'Host: web.example.com' https://localhost/ | head -1
workshop-web v1
```

The controller now terminates TLS on :443 using your Secret (`-k` skips verification because
the cert is self-signed). Once a host has TLS, the controller may **redirect** plain-HTTP
requests for it to HTTPS — try `curl -i -H 'Host: web.example.com' http://localhost/` and
read the status code. Real clusters use cert-manager to issue trusted certs automatically.
Clean up with the panic reset above.
</details>

## Stretch 2 (optional, read-only) — preview the Gateway API translation

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

<details><summary>Answer (shape of the output — details vary by tool version)</summary>

You get a **`Gateway`** (the entry point — one HTTP listener) and **`HTTPRoute`** resources
(the rules). Your `host:` values become HTTPRoute **`hostnames`**, each `path`/`pathType`
becomes a typed **`matches`** entry, and each `backend.service` becomes a **`backendRefs`**
entry — same Services, same ports. That's the whole point of the bridge: the routing rules
you wrote today survive the move to Gateway API. Don't apply the output — Lab 09 builds the
Gateway API stack properly, with a controller behind it.

If the tool isn't installed, skip this — it's a preview of the next section, not a
dependency.
</details>
