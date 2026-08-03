# Lab 20 — Helm (S20)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S20 — Helm |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Package the familiar `web` app as a **chart**, install it as a **release**, override its
values, **upgrade** through a couple of revisions, then deliberately **break** an upgrade and
**roll back**. By the end you'll be able to say exactly what a *revision* stores and what
*rollback* restores — and you'll have proven that `helm install` is just "render the template
with values, then apply the result."

The whole lab turns on one idea: **a chart is a template, a release is an installed instance,
and every install/upgrade/rollback is a numbered, reversible revision.**

## Prerequisites

- `helm` v3.8+ (the workshop pins **Helm 3.21.x** via `mise`; `helm version` should print
  `v3.8` or newer — OCI support, used in the stretch, is GA from 3.8).
- `kubectl`, and a place to install into:
  - **namespace path:** your assigned namespace on the shared cluster (Helm needs no
    cluster-admin — it applies as *you*, with your RBAC).
  - **kind path:** a local cluster (`kind create cluster`).
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1` / `:v2`.

> **Helm is a client.** There is no server component (no "Tiller" since Helm 3). `helm install`
> renders the chart on your machine and applies the result with your kubeconfig — if you can't
> `kubectl apply` it, neither can Helm.

## Files used

You'll create a tiny chart called `demo-app` (four files). It renders to the exact `web`
Deployment + Service from Day 1 — a chart is your same manifests, parameterised.

- `demo-app/Chart.yaml` — chart identity + `apiVersion: v2`.
- `demo-app/values.yaml` — the default knobs (`replicaCount`, `image.*`, `service.port`).
- `demo-app/templates/deployment.yaml` — the `web` Deployment with `{{ .Values.* }}` holes.
- `demo-app/templates/service.yaml` — the matching Service.
- `values-prod.yaml` — an override values file for the upgrade step.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./20-helm.solution.md#guided-solutions)

### Step 0 — pick a namespace

### namespace path (shared cluster)

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
helm version        # expect v3.8+ (workshop pins Helm 3.21.x)
```

### kind path

```bash
kind create cluster --name helm-lab
export NS=default
helm version
```

---

### Step 1 — build the chart

Create the four chart files. The `{{ … }}` placeholders are **Helm template directives**, not
shell — the quoted heredoc (`<<'EOF'`) keeps your shell from touching them.

```bash
mkdir -p demo-app/templates

cat > demo-app/Chart.yaml <<'EOF'
apiVersion: v2
name: demo-app
description: A minimal web app packaged as a Helm chart
type: application
version: 0.1.0
appVersion: "v1"
EOF

cat > demo-app/values.yaml <<'EOF'
replicaCount: 1
image:
  repository: ghcr.io/platformrelay/workshop-web
  tag: "v1"
service:
  port: 80
EOF

cat > demo-app/templates/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 8080
EOF

cat > demo-app/templates/service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 8080
EOF
```

**Task:** lint the chart and confirm it's structurally valid.

```bash
helm lint demo-app
```

---

### Step 2 — render before you install (`helm template`)

`helm template` renders the chart to plain manifests **client-side** — it never contacts the
cluster. This is how you *see what Helm would apply* before applying it.

```bash
helm template web demo-app
```

**Task:** confirm the rendered Deployment has `name: web`, `replicas: 1`, and the `:v1`
image — i.e. the values flowed in.

**Question:** how is `helm template` different from `helm install --dry-run=server`?

---

### Step 3 — install the release (revision 1)

```bash
helm install web demo-app
helm list
kubectl get deploy,svc,pods -l app=web
```

**Task:** confirm one release named `web` at revision 1, and that its Pod is Running.

---

### Step 4 — override values and upgrade (revisions 2 & 3)

Same template, new values → a new revision. Override two ways: inline with `--set`, and with a
values **file**.

```bash
# revision 2: scale up inline
helm upgrade web demo-app --set replicaCount=3

# revision 3: bump the image tag via a values file
cat > values-prod.yaml <<'EOF'
replicaCount: 3
image:
  tag: "v2"
EOF
helm upgrade web demo-app -f values-prod.yaml

helm history web
```

**Task:** confirm three revisions, and that the live Deployment now runs 3 replicas on `:v2`.

```bash
kubectl get deploy web -o jsonpath='{.spec.replicas} {.spec.template.spec.containers[0].image}{"\n"}'
```

**Question:** revision 3 only set `image.tag`, yet `replicas` stayed 3. Why didn't it fall back
to the `values.yaml` default of 1?

---

### Step 5 — break an upgrade, then roll back

Upgrade to a values set that can't run — an image tag that doesn't exist — and watch the new
Pods fail. Then roll back to the last good revision.

```bash
helm upgrade web demo-app --set image.tag=9.9.9-nope
kubectl get pods -l app=web
```

**Task:** observe the new Pod stuck pulling the bad image (`ErrImagePull` / `ImagePullBackOff`).

**Task:** roll back to the last good revision (3) and confirm recovery.

```bash
helm rollback web 3
helm history web
kubectl get pods -l app=web
```

**Question (required):** what does a revision actually store, and what does `helm rollback`
restore?

---

### Step 6 — where the history lives (optional read)

```bash
kubectl get secret -l owner=helm -l name=web
```

## Observe

- **A chart is a template; a release is an instance.** `helm template` rendered the chart to the
  exact `web` Deployment + Service from Day 1 — client-side, no cluster.
- **`helm install` = render + apply as you.** No server component; your RBAC applies.
- **Values flow in and are overridable:** `--set` (inline) and `-f` (a file) both feed
  `.Values`; upgrade **reuses prior values** and merges overrides on top.
- **Every change is a numbered revision** (`helm history`); a revision is a full **snapshot**
  (manifests + values + metadata), stored as a `helm.sh/release.v1` `Secret`.
- **A Helm "success" isn't app health:** the bad-tag upgrade "deployed" but the Pod was
  `ImagePullBackOff` — check `kubectl get pods`.
- **`rollback N` rolls *forward* to an old state:** it replays revision N as a *new* revision and
  never destroys history.

## Challenge

A helm upgrade reports Deployed but the app Pods are ImagePullBackOff. Diagnose Helm
release success versus REST workload health, roll back to the last known-good revision, and
prove the release history kept the failed revision.

**Difficulty:** Intermediate

**Success criteria:** Identify the failing Pod status with kubectl, use helm history to name the bad
revision, helm rollback to a prior revision so Pods become Ready, and show history still lists
the failed revision after rollback.

**Hints:** Compare helm status with kubectl get pods -l app=web; use helm history and
helm rollback <revision> rather than uninstalling the release.

[Spoiler: challenge solution](./20-helm.solution.md#challenge-solution)

## Verify

Confirm Helm release evidence before cleanup.

```bash
helm list -n "$NS"
helm history web -n "$NS" | head
kubectl get deploy,svc,pods -n "$NS" -l app=web
```

Expected: the release still exists (or you note the revision you will uninstall) and Pods match
the revision you intend to keep.

## Cleanup / reset

```bash
# one command removes the workload AND all the revision history
helm uninstall web

# if you did the OCI stretch: remove the second release and the local registry
helm uninstall web2 2>/dev/null || true      # the release installed from oci://localhost:5000
docker rm -f registry 2>/dev/null || true    # the throwaway registry:2 container

# tidy the local files
rm -rf demo-app values-prod.yaml demo-app-*.tgz

# confirm nothing is left
helm list
kubectl get deploy,svc,pods -l app=web
```

## Stretch (optional) — ship the chart to an OCI registry

Charts are OCI artifacts, so they live in the **same kind of registry as your images**. Package
the chart and push it, then install straight from the `oci://` URL — no `helm repo add`.

```bash
# run a throwaway local registry (kind/Docker)
docker run -d -p 5000:5000 --name registry registry:2

# package the chart into a versioned .tgz, then push it
helm package demo-app
helm push demo-app-0.1.0.tgz oci://localhost:5000/charts

# install a fresh release straight from the registry URL
helm install web2 oci://localhost:5000/charts/demo-app --version 0.1.0
helm list
```
