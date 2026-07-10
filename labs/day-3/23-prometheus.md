# Lab 23 — Prometheus Operator (S23)

| | |
| --- | --- |
| **Section** | S23 — Prometheus Operator |
| **Environment** | **kind ✓** (self-install the stack) / namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Install **`kube-prometheus-stack`** (the Prometheus Operator + a Prometheus + Grafana +
kube-state-metrics + node-exporter) into a kind cluster, deploy a small app that exposes real
Prometheus metrics on **`/metrics`**, and wire it in with a **`ServiceMonitor`** — the S22 operator
pattern made concrete: you declare monitoring **intent** as a CR, and the operator **generates the
scrape config**.

Then the point of the whole lab: **break** the ServiceMonitor with a **mismatched label selector**
so the target never appears, **diagnose** it on the Prometheus **`/targets`** page, **fix** the
selector, and watch the target go **UP**. Finish with one **PromQL** query.

The lab turns on one idea: **you never edit `prometheus.yml`.** You apply a ServiceMonitor; the
operator resolves the Service's endpoints and writes the scrape config for you. When a target is
missing, you debug the **selectors**, not the config file.

> **Two selector layers — keep them apart.** (1) **Prometheus → ServiceMonitor discovery:** this
> Prometheus only adopts ServiceMonitors carrying the label `release: monitoring`. (2)
> **ServiceMonitor → Service target selection:** `spec.selector.matchLabels` picks the Service. The
> deliberate **break** in Step 3–4 is on layer (2). Layer (1)'s `release: monitoring` label is
> present and correct the whole time — if you drop it, the monitor is ignored for a *different*
> reason.
>
> This works with the SM in `demo` and Prometheus in `monitoring` because the chart's default
> `serviceMonitorNamespaceSelector` is empty (`{}` = *all namespaces*). If a facilitator scopes
> their Prometheus to its own namespace, put the app, Service, and ServiceMonitor **in that
> namespace** instead. (Confirm the default on the chart version you install — see the flags at the
> bottom.)

## Prerequisites

- **kind path (recommended):** Docker + `kind` + `kubectl` + `helm` v3.8+, and rights to create a
  local cluster. You'll make a throwaway cluster named `monitoring`.
- **Shared-cluster path (read-only):** your assigned namespace on a cluster where a facilitator has
  already installed `kube-prometheus-stack`. You can't install cluster-wide CRDs or an operator
  yourself, so here you **only observe** a running stack's targets and run queries. Prefer kind.
- Internet pull access for `quay.io/brancz/prometheus-example-app` and the chart's images.

> **On Apple Silicon / arm64:** use the app image tag **`v0.6.0`** (multi-arch). The older
> `v0.5.0` is amd64-only and will `CrashLoopBackOff` / `exec format error` on arm64 kind nodes.

## Files used

- `app.yaml` — the `sample-app` Deployment + Service. The Service exposes a **named** port
  (`name: web`) — the ServiceMonitor references that **name**.
- `servicemonitor.yaml` — a `ServiceMonitor` (`monitoring.coreos.com/v1`). Applied first with a
  **broken** target selector, then patched to the correct one.

Everything you add carries the label `lab: s23` and lives in a `demo` namespace, so cleanup is by
selector plus one namespace delete.

---

## Step 0 — a cluster with the stack

### kind path (do this)

```bash
kind create cluster --name monitoring
kubectl get nodes
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get nodes
NAME                       STATUS   ROLES           AGE   VERSION
monitoring-control-plane   Ready    control-plane   40s   v1.3x.x
```

A one-node kind cluster is plenty for this lab. The stack you install next runs the Prometheus
Operator plus a small Prometheus, Grafana, kube-state-metrics, and node-exporter.
</details>

Add the Helm repo and install the stack into its own `monitoring` namespace. The release name
`monitoring` is what makes the Prometheus adopt ServiceMonitors labelled `release: monitoring`.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --wait --timeout 10m
```

**Task:** confirm the release is deployed and the operator Pod is Running.

```bash
helm list -n monitoring
kubectl get pods -n monitoring
```

<details><summary>Solution / expected output</summary>

```console
$ helm list -n monitoring
NAME        NAMESPACE   REVISION  STATUS    CHART                          APP VERSION
monitoring  monitoring  1         deployed  kube-prometheus-stack-xx.x.x   v0.xx.x

$ kubectl get pods -n monitoring
NAME                                                     READY   STATUS    RESTARTS   AGE
monitoring-kube-prometheus-operator-xxxxxxxxx-xxxxx      1/1     Running   0          2m
prometheus-monitoring-kube-prometheus-prometheus-0       2/2     Running   0          2m
alertmanager-monitoring-kube-prometheus-alertmanager-0   2/2     Running   0          2m
monitoring-grafana-xxxxxxxxxxx-xxxxx                      3/3     Running   0          2m
monitoring-kube-state-metrics-xxxxxxxxx-xxxxx            1/1     Running   0          2m
monitoring-prometheus-node-exporter-xxxxx                1/1     Running   0          2m
```

The **operator** Pod is the controller; `prometheus-…-0` is the Prometheus **StatefulSet** the
operator created from a `Prometheus` CR. `kube-state-metrics` and `node-exporter` are the two
standard sources — each already has its own ServiceMonitor, so the stack is scraping cluster + node
health before you add anything.
</details>

> **node-exporter may CrashLoop on some kind setups** (it mounts the host rootfs, which a container
> runtime can restrict). It's harmless to this lab — your app's ServiceMonitor doesn't depend on it.
> If it's the only red Pod, carry on.

### Shared-cluster path (read-only)

A facilitator has installed the stack already. You just point at it and observe — skip the
`helm install`, and in later steps read the pre-applied ServiceMonitor and query the facilitator's
Prometheus instead of applying your own objects.

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
# find the monitoring namespace / Prometheus your facilitator points you at
kubectl get servicemonitor -A | head
```

Follow the rest by **reading** the manifests and spoilers and by running the `/targets` and PromQL
steps against the facilitator's Prometheus — the *objects and queries* are identical; only who
applied them differs.

---

## Step 1 — confirm the operator installed its CRDs

The operator is only useful because it registered new **kinds**. Check them.

```bash
kubectl get crd | grep monitoring.coreos.com
```

<details><summary>Solution / expected output</summary>

```console
alertmanagers.monitoring.coreos.com              2026-...
podmonitors.monitoring.coreos.com                2026-...
probes.monitoring.coreos.com                     2026-...
prometheuses.monitoring.coreos.com               2026-...
prometheusrules.monitoring.coreos.com            2026-...
servicemonitors.monitoring.coreos.com            2026-...
thanosrulers.monitoring.coreos.com               2026-...
```

These are the CRDs from the slides (`servicemonitors`, `podmonitors`, `prometheuses`,
`alertmanagers`, plus a few more). Every one is group `monitoring.coreos.com` — this is the API the
operator added. `kubectl get servicemonitor -A` now works exactly like `kubectl get pod`.
</details>

---

## Step 2 — deploy an app that exposes `/metrics` on a NAMED port

The app is `prometheus-example-app`: it serves `/metrics` on port **8080** and exposes the counter
**`http_requests_total`** (perfect for a `rate()` query). Note the Service gives its port a
**name** — `web` — because the ServiceMonitor will reference that **name**, not the number.

```bash
kubectl create namespace demo

cat > app.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  replicas: 1
  selector: { matchLabels: { app: sample-app } }
  template:
    metadata:
      labels: { app: sample-app, lab: s23 }
    spec:
      containers:
        - name: app
          image: quay.io/brancz/prometheus-example-app:v0.6.0
          ports:
            - name: web
              containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  selector: { app: sample-app }
  ports:
    - name: web          # ← the NAMED port the ServiceMonitor references
      port: 8080
      targetPort: web
EOF

kubectl apply -f app.yaml
kubectl -n demo rollout status deploy/sample-app
```

**Task:** confirm the app serves metrics. Port-forward the Service and curl `/metrics`.

```bash
kubectl -n demo port-forward svc/sample-app 8080:8080 >/tmp/pf-app.log 2>&1 &
APP_PF=$!
sleep 2
curl -s http://localhost:8080/metrics | grep '^http_requests_total'
# stop this port-forward before moving on
kill "$APP_PF" 2>/dev/null
```

<details><summary>Solution / expected output</summary>

```console
$ curl -s http://localhost:8080/metrics | grep '^http_requests_total'
http_requests_total{code="200",method="get"} 1
```

The app exposes `http_requests_total` (a **counter**), labelled by HTTP `code` and `method`. Right
now the count is tiny — that curl to `/metrics` doesn't hit the counted `/` handler. You'll generate
real traffic in Step 6 before querying. The Service's port is **named** `web`, and `targetPort: web`
points at the container's named port — the whole chain is by name.
</details>

---

## Step 3 — wire it in (the WRONG way, on purpose)

Apply a ServiceMonitor whose **target selector is deliberately wrong** — it selects
`app: sample-APP-typo`, which no Service has. Layer (1) is correct (it carries
`release: monitoring`, so this Prometheus *will* adopt it); only layer (2) is broken.

```bash
cat > servicemonitor.yaml <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  namespace: demo
  labels:
    release: monitoring          # (1) discovery: this Prometheus adopts the monitor
    lab: s23
spec:
  selector:
    matchLabels:
      app: sample-APP-typo       # (2) BREAK: no Service has this label
  endpoints:
    - port: web                  # (3) the Service's named port
      path: /metrics
EOF

kubectl apply -f servicemonitor.yaml
kubectl -n demo get servicemonitor
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n demo get servicemonitor
NAME         AGE
sample-app   10s
```

The object applies cleanly — the API server never validates that the selector matches anything
(just like a Service with a selector that matches no Pods applies fine). The operator adopts it
(layer 1 is correct), but it resolves **zero** Services (layer 2 is wrong), so it generates a scrape
job with **no targets**. Nothing tells you on the command line; you diagnose it in Prometheus.
</details>

---

## Step 4 — break: diagnose on the Prometheus `/targets` page

Port-forward the Prometheus web UI and look at **`/targets`** — the page that lists every scrape
target and its health. Because our selector matches no Service, our app is **not there** (or shows
with **no** active target).

```bash
# the Prometheus Service name is release-dependent; find it, then forward it
kubectl -n monitoring get svc | grep prometheus
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 \
  >/tmp/pf-prom.log 2>&1 &
PROM_PF=$!
sleep 2
echo "open http://localhost:9090/targets"
```

**Task:** open <http://localhost:9090/targets> in a browser. Look for a scrape pool named for our
ServiceMonitor (`serviceMonitor/demo/sample-app/0`). It shows **0 targets** — our app never appears
as **UP**.

<details><summary>Solution / expected output</summary>

On `/targets`, the built-in pools (`node-exporter`, `kube-state-metrics`, `apiserver`, …) are
**UP**, but **our app is nowhere to be seen as UP**. You should see the scrape pool for our monitor
with **no active target**:

```text
serviceMonitor/demo/sample-app/0 (0 / 0 up)
```

The operator adopted the ServiceMonitor (layer 1 is correct) but found **no Service** matching
`app: sample-APP-typo`, so it produced a scrape job with an **empty target list**.

> The precise `/targets` rendering — whether the pool shows as "0 / 0 up" or isn't listed at all
> until it has a live target — **varies by Prometheus build**. Don't anchor your diagnosis on that;
> anchor it on the deterministic fact below. Confirm the exact wording on a rehearsal run.
</details>

**Question:** the ServiceMonitor applied with no error and the operator adopted it, yet the app
never appears **UP**. Where is the fault — and how is this failure different from *forgetting* the
`release: monitoring` label?

<details><summary>Answer</summary>

The fault is **layer (2): ServiceMonitor → Service selection.** The object applied cleanly
(`kubectl -n demo get servicemonitor` lists it), so the problem isn't syntax or discovery — it's
that `spec.selector.matchLabels` (`app: sample-APP-typo`) matches **no Service**, so the operator
has no endpoints to scrape and the target never comes **UP**. That's a different layer from
**discovery**: if you'd dropped `release: monitoring`, the stack's Prometheus would **never adopt
the monitor at all** — no scrape job would be generated for it, so there'd be nothing on `/targets`
for it whatsoever.

The reliable way to tell them apart (independent of `/targets` UI quirks):

- **Wrong `spec.selector` (this break):** the SM is adopted but selects no Service → a scrape job
  with **no live target**. Cross-check with `kubectl -n demo get endpoints sample-app` (the Service
  *does* have endpoints) vs. the SM's selector — they don't match.
- **Missing `release` label:** the SM is **never adopted** → no scrape job at all. Cross-check by
  confirming the label is absent from `kubectl -n demo get servicemonitor sample-app -o yaml`.

Debugging rule: **adopted-but-no-target → fix the ServiceMonitor→Service selector; not-adopted →
fix the discovery label** (or the Prometheus's `serviceMonitorSelector`).
</details>

---

## Step 5 — fix: match the selector to the Service's labels

Patch the selector to the label the Service actually carries (`app: sample-app`). Nothing else
changes.

```bash
kubectl -n demo patch servicemonitor sample-app --type=merge \
  -p '{"spec":{"selector":{"matchLabels":{"app":"sample-app"}}}}'
```

**Task:** wait ~30 s (the operator regenerates config and Prometheus reloads), then refresh
<http://localhost:9090/targets>. Our target now shows **UP**.

<details><summary>Solution / expected output</summary>

Within a reload cycle, the pool flips to a live target:

```text
serviceMonitor/demo/sample-app/0 (1 / 1 up)
  Endpoint                          State   Labels
  http://10.244.x.x:8080/metrics    UP      job="sample-app" ...
```

The operator saw the edited ServiceMonitor, resolved `app: sample-app` to the `sample-app` Service,
looked up that Service's **endpoints** (the running Pod), and wrote a scrape job pointing at the
Pod's `:8080/metrics`. **You never touched `prometheus.yml`.** If it's still 0/0, give it another
reload cycle or confirm the `port: web` name matches the Service's port name (see the next
question).
</details>

**Question (required):** why must the ServiceMonitor's `endpoints[].port` be `web` (a **name**), not
`8080` (a number)?

<details><summary>Answer</summary>

Because the field is defined as the **name of a port on the Service**, not a raw port number. A
Kubernetes Service can expose several named ports, and the same numeric port can appear under
different names on different Services — so the ServiceMonitor references a port by the **stable
name** (`web`) the Service assigns it. The operator looks up the Service's `spec.ports[]`, finds the
entry whose `name` is `web`, and scrapes that. That's exactly why the Service in Step 2 gives its
port `name: web`. If you write a **number** there, the operator can't match it to a named port and
the target won't appear — a subtle failure that looks just like the Step-4 break. (`PodMonitor`
differs — it can take a raw `targetPort` number — but `ServiceMonitor.endpoints[].port` is a
**name**.)
</details>

---

## Step 6 — generate load, then run a PromQL query

`http_requests_total` barely moves until the app serves real requests, and `rate()` needs a couple
of data points in its window. Generate traffic against the app's `/` handler, wait for a scrape or
two, then query.

```bash
# forward the app again and hammer the counted "/" endpoint
kubectl -n demo port-forward svc/sample-app 8080:8080 >/tmp/pf-app.log 2>&1 &
APP_PF=$!
sleep 2
for i in $(seq 1 200); do curl -s -o /dev/null http://localhost:8080/ ; done
kill "$APP_PF" 2>/dev/null

# give Prometheus ~30s (the default scrape interval) to pick up the increase
sleep 40
```

**Task:** in the Prometheus UI (<http://localhost:9090/graph>) — or via the HTTP API below — run:

```promql
rate(http_requests_total{code="200"}[5m])
```

```bash
# same query from the CLI (the Prometheus port-forward from Step 4 is still running)
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_requests_total{code="200"}[5m])' | \
  python3 -m json.tool
```

<details><summary>Solution / expected output</summary>

```console
{
    "status": "success",
    "data": {
        "resultType": "vector",
        "result": [
            {
                "metric": {
                    "__name__": "http_requests_total",
                    "code": "200",
                    "method": "get",
                    "job": "sample-app",
                    "namespace": "demo",
                    "pod": "sample-app-xxxxxxxxx-xxxxx"
                },
                "value": [ 1718000000, "0.66" ]
            }
        ]
    }
}
```

The `value` is `[timestamp, "<per-second rate>"]` — here **~0.66 requests/sec** for `code="200"`,
averaged over the trailing 5 minutes (200 requests spread across the window). The raw counter
(`http_requests_total`) only ever climbs; **`rate(counter[5m])`** turns it into the useful
per-second rate and handles counter resets. Add `sum(rate(http_requests_total[5m]))` to get total
**traffic** across all Pods — golden signal #2 in one line. (The exact number depends on timing; any
non-zero rate proves the scrape → query path works.)
</details>

## Expected observations

- **You never edited scrape config.** You applied a `ServiceMonitor`; the operator resolved the
  Service's endpoints and generated the Prometheus scrape job — the S22 operator pattern for real.
- **Two selector layers, two different failures:** a wrong `spec.selector` (layer 2) → the scrape
  pool **exists but is empty** (0 targets); a missing `release: monitoring` label (layer 1) → the
  pool **doesn't exist at all**. `/targets` tells them apart.
- **`endpoints[].port` is a NAME, not a number** — it must match a named port on the Service, which
  is why the Service names its port `web`.
- **A counter is read with `rate()`:** `http_requests_total` only goes up; `rate(…[5m])` gives the
  per-second rate — the raw value is rarely what you want.
- **The stack scrapes cluster + node health out of the box** via `kube-state-metrics` and
  `node-exporter`, each with its own pre-applied ServiceMonitor.

## Cleanup / panic reset

```bash
# stop any port-forwards still running in this shell
kill "$PROM_PF" "$APP_PF" 2>/dev/null; true

# scoped cleanup — everything you added carries lab: s23
kubectl -n demo delete servicemonitor -l lab=s23 --ignore-not-found
kubectl -n demo delete deploy,svc -l lab=s23 --ignore-not-found
kubectl delete namespace demo --ignore-not-found

# remove the whole stack
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring --ignore-not-found

rm -f app.yaml servicemonitor.yaml

# panic reset (kind): throw the whole cluster away
# kind delete cluster --name monitoring
```

> On the **kind** path the fastest reset is `kind delete cluster --name monitoring` — the cluster
> was disposable. On the **shared** path you created nothing (read-only), so there's nothing to
> clean.

## Stretch (optional) — see the operator regenerate config as Pods churn

The operator's whole job is keeping the scrape config in sync as Pods come and go. Prove it: scale
the app and watch the target count on `/targets` follow.

```bash
kubectl -n demo scale deploy/sample-app --replicas=3
kubectl -n demo rollout status deploy/sample-app
# refresh http://localhost:9090/targets
```

<details><summary>What you should see</summary>

The `serviceMonitor/demo/sample-app/0` pool grows from **1/1 up** to **3/3 up** — one target per
Pod endpoint — with **no** change to any ServiceMonitor and **no** hand-edited config. You changed
the Deployment's replica count; the Service's endpoints changed; the operator noticed and
regenerated the scrape config. That is the reconcile loop from S22/S03 running under monitoring:

```text
serviceMonitor/demo/sample-app/0 (3 / 3 up)
```

Scale back with `kubectl -n demo scale deploy/sample-app --replicas=1` and the pool shrinks to 1/1.
This is exactly why static scrape config can't survive Kubernetes — and why the operator exists.
</details>

## Facilitator notes — verify on a rehearsal run

This lab was authored without a live cluster. Confirm these before delivery (they can drift with
chart/Prometheus versions):

- **`/targets` rendering of the broken pool** — whether a ServiceMonitor that selects no Service
  shows as `0 / 0 up` or is absent until it has a live target. Diagnosis in Step 4 is anchored on
  `kubectl get servicemonitor`/`endpoints`, not on the UI, precisely because of this.
- **Namespace discovery** — the break→fix relies on the chart's default
  `serviceMonitorNamespaceSelector: {}` (all namespaces) so an SM in `demo` is seen by Prometheus in
  `monitoring`. Confirm, or co-locate everything in one namespace.
- **Prometheus Service name** — `monitoring-kube-prometheus-prometheus` is release-name-dependent;
  the lab finds it with `kubectl -n monitoring get svc | grep prometheus`.
- **App image tag** — `quay.io/brancz/prometheus-example-app:v0.6.0` (multi-arch). Confirm it still
  serves `http_requests_total` on `:8080/metrics`.
- **PromQL result labels** — the sample output uses `method="get"` (lowercase) and a `~0.66/s` rate;
  exact values depend on load timing.
