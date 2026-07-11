# Lab 08 — Ingress (S08)

| | |
| --- | --- |
| **Section** | S08 — Ingress *(red line 4/5)* |
| **Environment** | namespace ✓ / kind ✓ *(ingress controller required)* |
| **Estimated time** | 25 min |

## Objective

Put an **Ingress** in front of your Services to route external HTTP by **host and path** to
two backends, and learn the hard truth that an `Ingress` object does nothing without a
**controller** running behind it. Red-line step **4 of 5**: the Ingress is the north-south
entry point in front of the Lab 07 Service.

> **Environment honesty.** Ingress needs a cluster-wide **ingress controller**.
>
> - **kind:** you install one yourself (admin) — this path recreates your kind cluster with
>   an ingress-ready config, so it is **kind-only** for the install step.
> - **Shared cluster:** the controller already exists; your facilitator gives you a
>   **hostname** that routes to it. You do **not** install anything.
>
> Follow the path for your environment; both converge on the same Ingress manifest and the
> same curls.

## Prerequisites

- Labs 05–07 concepts (Deployment + Service). This lab **recreates its own backends**, so it
  does not depend on leftovers from Lab 07.
- kind path: `kind` + a container engine, and admin over your cluster.
- Shared-cluster path: your assigned namespace `$NS`, the ingress controller's
  **class name**, and your assigned **hostname** (ask your facilitator; examples below use
  `web.example.com`).

## Files used

- `backends.yaml` — two nginx Deployments + Services (`web`, `web2`) with distinguishable
  home pages (via a small ConfigMap — previewed here, taught fully in Lab 10).
- `ingress.yaml` — the Ingress routing `/` → `web` and `/v2` → `web2` (the manifest the
  slide magic-move builds).
- `ingress-no-pathtype.yaml` — a deliberately broken copy with `pathType` removed (Step 5).

---

## Step 1 (kind only) — recreate the cluster with ingress enabled, install the controller

The Lab 00 kind cluster has no ingress plumbing. Recreate it with a port mapping and the
`ingress-ready` node label, then install ingress-nginx.

```bash
cat > kind-ingress.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: workshop
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - { containerPort: 80,  hostPort: 80,  protocol: TCP }
      - { containerPort: 443, hostPort: 443, protocol: TCP }
EOF

kind delete cluster --name workshop
kind create cluster --config kind-ingress.yaml
kubectl create namespace workshop
kubectl config set-context --current --namespace=workshop
export NS=workshop

# Install the ingress controller. Re-verify the current ingress-nginx release at delivery time.
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.2/deploy/static/provider/kind/deploy.yaml

# Wait until it is ready to admit Ingresses:
kubectl -n ingress-nginx wait --for=condition=available deploy/ingress-nginx-controller --timeout=180s
kubectl -n ingress-nginx wait --for=condition=ready pod \
  -l app.kubernetes.io/component=controller --timeout=180s
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n ingress-nginx wait --for=condition=available deploy/ingress-nginx-controller --timeout=180s
deployment.apps/ingress-nginx-controller condition met

$ kubectl get ingressclass
NAME    CONTROLLER             PARAMETERS   AGE
nginx   k8s.io/ingress-nginx   <none>       40s
```

The `nginx` **IngressClass** now exists — that name is what your Ingress will reference. The
`extraPortMappings` publish the controller on your machine's `localhost:80`.
</details>

<details><summary>Shared-cluster path — do this instead of Step 1</summary>

Do **not** install anything. Confirm the controller and its class exist, and note the name:

```console
$ kubectl get ingressclass
NAME     CONTROLLER             PARAMETERS   AGE
nginx    k8s.io/ingress-nginx   <none>       30d
```

Use that class name in `ingress.yaml` (replace `nginx` if your cluster's class differs), and
use the **hostname your facilitator assigned** instead of `web.example.com`. Skip every
`kind`-specific command below.
</details>

---

## Step 2 — deploy two distinguishable backends

```bash
cat > backends.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-pages
data:
  web.html: "hello from web (path /)\n"
  web2.html: "hello from web2 (path /v2)\n"
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

Each Deployment serves a one-line page so you can tell which backend answered. (The
`configMap` volume mount is Lab 10 material — here it is just provided boilerplate.)
</details>

---

## Step 3 — add the Ingress

`pathType: Prefix` matches `/` and everything under it; the more specific `/v2` rule wins for
those requests.

```bash
cat > ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx          # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostname
      http:
        paths:
          - path: /v2              # more specific rule — wins for /v2*
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
          - path: /                # catch-all — everything else
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
EOF

kubectl apply -f ingress.yaml
kubectl get ingress web
kubectl describe ingress web      # confirm the rules, pathType, and assigned address
```

> This is the same manifest the slide magic-move builds up field by field. Each path's
> `backend` points at a **Service** (never a Pod directly), and every path **must** carry a
> `pathType` — Step 5 proves what happens when it doesn't.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get ingress web
NAME   CLASS   HOSTS             ADDRESS      PORTS   AGE
web    nginx   web.example.com   localhost    80      15s

$ kubectl describe ingress web
Name:             web
Ingress Class:    nginx
Rules:
  Host             Path  Backends
  ----             ----  --------
  web.example.com
                   /v2   web2:80 (10.244.0.11:80,10.244.0.12:80)
                   /     web:80  (10.244.0.9:80,10.244.0.10:80)
...
```

`ADDRESS` populates once the controller programs the rule (a few seconds). `describe` echoes
each path with its resolved backend endpoints and confirms `pathType` was accepted. An empty
`CLASS` or a missing `ADDRESS` that never fills is almost always a wrong `ingressClassName` or
no controller — the #1 Ingress gotcha.
</details>

---

## Step 4 — route by path

Send requests for the host; the path decides which backend answers.

```bash
# kind path (controller published on localhost:80 via extraPortMappings):
curl -H 'Host: web.example.com' http://localhost/
curl -H 'Host: web.example.com' http://localhost/v2

# Shared-cluster path (real hostname resolves to the ingress load balancer):
# curl http://web.example.com/        # substitute your assigned hostname
# curl http://web.example.com/v2
```

**Task:** which backend answers `/` and which answers `/v2`?

<details><summary>Solution / expected output</summary>

```console
$ curl -H 'Host: web.example.com' http://localhost/
hello from web (path /)
$ curl -H 'Host: web.example.com' http://localhost/v2
hello from web2 (path /v2)
```

`/` routes to the `web` Service, `/v2` to `web2` — one Ingress, one hostname, path-based
fan-out to two Services. (The `Host:` header is how the controller picks the rule; on the
shared cluster real DNS supplies it, so you curl the hostname directly. `curl --resolve
web.example.com:80:<ingress-ip>` is the trick when DNS isn't wired up.)
</details>

**Question:** what does a request for a host the Ingress does **not** define return?

<details><summary>Answer</summary>

```console
$ curl -H 'Host: nope.example.com' http://localhost/
<html><head><title>404 Not Found</title></head>...
```

The controller's **default backend** answers with `404 Not Found` — no rule matched the host,
so there is nothing to route to. An Ingress only handles hosts/paths you declare; everything
else falls through to the default backend.
</details>

---

## Step 5 — break it: forget `pathType`

`pathType` has **no default** — the API server requires it on every path. Prove it: write a
copy of the Ingress with the field removed and try to apply it.

```bash
cat > ingress-no-pathtype.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx
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

The manifest is **rejected at apply time** — this is a schema validation failure, not a
runtime 404. Nothing changes on the cluster: your working Ingress from Step 3 is still serving.
Because `pathType` has no server-side default, an old example that omits it (they were legal
in the deprecated `extensions/v1beta1` API) will not apply on a modern cluster.
</details>

**Fix it:** re-apply the good manifest and confirm routing still works.

```bash
kubectl apply -f ingress.yaml
kubectl describe ingress web | grep -A4 Rules
curl -H 'Host: web.example.com' http://localhost/v2
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f ingress.yaml
ingress.networking.k8s.io/web configured
$ curl -H 'Host: web.example.com' http://localhost/v2
hello from web2 (path /v2)
```

Restoring `pathType: Prefix` makes the manifest valid again; the controller re-programs the
rule and `/v2` routes to `web2` as before.
</details>

**Question:** you could also *mistype* it — `pathType: Prefixx`. Same category of error?

<details><summary>Answer</summary>

```console
$ kubectl apply -f - <<'EOF'
... pathType: Prefixx ...
EOF
The Ingress "web" is invalid: spec.rules[0].http.paths[0].pathType: Unsupported value: "Prefixx": supported values: "Exact", "ImplementationSpecific", "Prefix"
```

Yes — both are rejected by the same schema validation, and the mistype error is even more
helpful: it **lists the three valid values**. Whenever an Ingress won't apply, read the
`spec.rules[...].pathType` line in the error first.
</details>

## Expected observations

- `kubectl get ingressclass` shows a controller class; the Ingress gets an `ADDRESS`.
- `/` returns the `web` page, `/v2` returns the `web2` page — path routing works.
- An undeclared host returns the controller's **404 default backend**.
- A manifest missing (or mistyping) `pathType` is **rejected at apply time** — schema
  validation, not a runtime error.
- The Ingress object alone does nothing until a controller programs it (visible if you ever
  see `ADDRESS` stay empty).

## Cleanup / panic reset

```bash
kubectl delete -f ingress.yaml -f backends.yaml --ignore-not-found
rm -f ingress-no-pathtype.yaml   # the broken copy never applied; just a local file
kubectl delete secret web-tls --ignore-not-found   # TLS Secret from the stretch (if you did it)
rm -f tls.key tls.crt                              # self-signed cert files from the stretch
# full namespace reset:
kubectl delete ingress,svc,deploy,rs,pod,configmap --all -n "$NS" --ignore-not-found

# kind only — the controller lives in its own namespace; remove it if you want a clean slate:
# kubectl delete namespace ingress-nginx
# or just: kind delete cluster --name workshop
```

## Stretch (optional)

Add TLS termination. Create a self-signed cert as a Secret and reference it in the Ingress.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=web.example.com"
kubectl create secret tls web-tls --cert=tls.crt --key=tls.key
kubectl patch ingress web --type=merge \
  -p '{"spec":{"tls":[{"hosts":["web.example.com"],"secretName":"web-tls"}]}}'
curl -k -H 'Host: web.example.com' https://localhost/
```

<details><summary>Solution / what you're looking at</summary>

```console
$ curl -k -H 'Host: web.example.com' https://localhost/
hello from web (path /)
```

The controller now terminates TLS using your Secret (`-k` skips verification because the cert
is self-signed). Real clusters use cert-manager to issue trusted certs automatically. Clean
up the Secret and cert files with the panic reset above plus `rm tls.key tls.crt`.
</details>
