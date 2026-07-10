# Lab 20 — Helm (S20)

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

- `helm` v3.8+ (this lab was authored against **Helm 4**; `helm version` should print `v3.8`
  or newer — OCI support, used in the stretch, is GA from 3.8).
- `kubectl`, and a place to install into:
  - **namespace path:** your assigned namespace on the shared cluster (Helm needs no
    cluster-admin — it applies as *you*, with your RBAC).
  - **kind path:** a local cluster (`kind create cluster`).
- Internet pull access for `nginxinc/nginx-unprivileged:1.27` / `:1.29`.

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

## Step 0 — pick a namespace

### namespace path (shared cluster)

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
helm version        # expect v3.8+ (authored against Helm 4)
```

### kind path

```bash
kind create cluster --name helm-lab
export NS=default
helm version
```

<details><summary>Solution / expected output</summary>

```console
$ helm version
version.BuildInfo{Version:"v4.x.x", GitCommit:"…", GitTreeState:"clean", GoVersion:"go1.2x"}
```

Any `v3.8+` is fine. Helm reads the **same kubeconfig** as `kubectl`, so whatever context and
namespace `kubectl` is pointing at is where your release lands. That's why we set the namespace
first.
</details>

---

## Step 1 — build the chart

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
appVersion: "1.27"
EOF

cat > demo-app/values.yaml <<'EOF'
replicaCount: 1
image:
  repository: nginxinc/nginx-unprivileged
  tag: "1.27"
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

<details><summary>Solution / expected output</summary>

```console
==> Linting demo-app
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

`helm lint` checks chart structure and template syntax **without a cluster**. The `icon`
INFO is advisory (a chart icon URL for UIs), not an error — `0 chart(s) failed` is what
matters.
</details>

---

## Step 2 — render before you install (`helm template`)

`helm template` renders the chart to plain manifests **client-side** — it never contacts the
cluster. This is how you *see what Helm would apply* before applying it.

```bash
helm template web demo-app
```

**Task:** confirm the rendered Deployment has `name: web`, `replicas: 1`, and the `:1.27`
image — i.e. the values flowed in.

<details><summary>Solution / expected output</summary>

```console
---
# Source: demo-app/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
---
# Source: demo-app/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: "nginxinc/nginx-unprivileged:1.27"
          ports:
            - containerPort: 8080
```

Because we passed the release name `web`, every `{{ .Release.Name }}` rendered as `web`, and
`{{ .Values.replicaCount }}` / `{{ .Values.image.* }}` came straight from `values.yaml`. The
output is the **exact `web` Deployment + Service** you built by hand on Day 1 — that's the whole
point: a chart is your manifests with the varying bits pulled out.
</details>

**Question:** how is `helm template` different from `helm install --dry-run=server`?

<details><summary>Answer</summary>

`helm template` is **100% client-side** — it renders and prints, and never talks to the API
server (works with no cluster at all). `helm install --dry-run=server` renders **and** sends the
result to the API server so it runs real **validation + admission** (schema, Pod Security from
S17, webhooks), then discards it — no release is stored. So: `template` = "what would it
render?"; `--dry-run=server` = "would the cluster actually accept it?". Neither one installs.
</details>

---

## Step 3 — install the release (revision 1)

```bash
helm install web demo-app
helm list
kubectl get deploy,svc,pods -l app=web
```

**Task:** confirm one release named `web` at revision 1, and that its Pod is Running.

<details><summary>Solution / expected output</summary>

```console
$ helm install web demo-app
NAME: web
LAST DEPLOYED: ...
NAMESPACE: <your-ns>
STATUS: deployed
REVISION: 1
TEST SUITE: None

$ helm list
NAME  NAMESPACE  REVISION  UPDATED  STATUS    CHART           APP VERSION
web   <your-ns>  1         ...      deployed  demo-app-0.1.0  1.27

$ kubectl get deploy,svc,pods -l app=web
NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/web   1/1     1            1           20s
NAME          TYPE        CLUSTER-IP     ...   PORT(S)
service/web   ClusterIP   10.x.x.x       ...   80/TCP
NAME                   READY   STATUS    RESTARTS   AGE
pod/web-xxxxxxxxx-xxxxx  1/1   Running   0          20s
```

`helm install <release> <chart>` rendered the chart and applied it as release **web**, revision
**1**, status **deployed**. Helm added its own tracking labels to the objects; our
`app: web` label is what we filter on. If `helm install` errors with *"invalid ownership
metadata"*, a plain `web` Deployment from an earlier lab still exists — delete it
(`kubectl delete deploy,svc web`) and re-install, since Helm won't adopt objects it didn't create.
</details>

---

## Step 4 — override values and upgrade (revisions 2 & 3)

Same template, new values → a new revision. Override two ways: inline with `--set`, and with a
values **file**.

```bash
# revision 2: scale up inline
helm upgrade web demo-app --set replicaCount=3

# revision 3: bump the image tag via a values file
cat > values-prod.yaml <<'EOF'
replicaCount: 3
image:
  tag: "1.29"
EOF
helm upgrade web demo-app -f values-prod.yaml

helm history web
```

**Task:** confirm three revisions, and that the live Deployment now runs 3 replicas on `:1.29`.

```bash
kubectl get deploy web -o jsonpath='{.spec.replicas} {.spec.template.spec.containers[0].image}{"\n"}'
```

<details><summary>Solution / expected output</summary>

```console
$ helm history web
REVISION  UPDATED  STATUS      CHART           APP VERSION  DESCRIPTION
1         ...      superseded  demo-app-0.1.0  1.27         Install complete
2         ...      superseded  demo-app-0.1.0  1.27         Upgrade complete
3         ...      deployed    demo-app-0.1.0  1.27         Upgrade complete

$ kubectl get deploy web -o jsonpath='{.spec.replicas} {.spec.template.spec.containers[0].image}{"\n"}'
3 nginxinc/nginx-unprivileged:1.29
```

Each `helm upgrade` re-rendered the **same** template with new values and stored a **new
revision**; earlier revisions become `superseded` but are **kept**. Note `APP VERSION` stays
`1.27` — that's `appVersion` from `Chart.yaml` (the app the chart *describes*), independent of
the running image `tag` we overrode. `--set` and `-f` do the same job; `-f` is how you keep a
per-environment values file in Git.
</details>

**Question:** revision 3 only set `image.tag`, yet `replicas` stayed 3. Why didn't it fall back
to the `values.yaml` default of 1?

<details><summary>Answer</summary>

`helm upgrade` **reuses the previous release's values** and merges your new overrides on top —
it does not reset to `values.yaml` defaults. Revision 2 had set `replicaCount=3`; revision 3's
`-f values-prod.yaml` also carried `replicaCount: 3`, so replicas stayed 3 while the tag moved.
(If you ever want a clean slate from chart defaults, `helm upgrade --reset-values`; to reuse
prior values explicitly, `--reuse-values`.)
</details>

---

## Step 5 — break an upgrade, then roll back

Upgrade to a values set that can't run — an image tag that doesn't exist — and watch the new
Pods fail. Then roll back to the last good revision.

```bash
helm upgrade web demo-app --set image.tag=9.9.9-nope
kubectl get pods -l app=web
```

**Task:** observe the new Pod stuck pulling the bad image (`ErrImagePull` / `ImagePullBackOff`).

<details><summary>Solution / expected output</summary>

```console
$ helm upgrade web demo-app --set image.tag=9.9.9-nope
Release "web" has been upgraded. Happy Helming!
...
REVISION: 4

$ kubectl get pods -l app=web
NAME                   READY   STATUS             RESTARTS   AGE
web-xxxxxxxxx-xxxxx    1/1     Running            0          5m     # old, still up
web-yyyyyyyyy-yyyyy    0/1     ImagePullBackOff   0          20s    # new, can't pull
```

`helm upgrade` **succeeded as a Helm operation** — it applied the manifest and stored revision
4. But the *workload* is unhealthy: the Deployment's rolling update brought up a new Pod that
can't pull `:9.9.9-nope`, so it's stuck `ImagePullBackOff`. The old Pod keeps serving (rolling
update won't kill it until the new one is Ready — the S06 lesson). "helm says deployed" ≠ "the
app is healthy" — always check the Pods.
</details>

**Task:** roll back to the last good revision (3) and confirm recovery.

```bash
helm rollback web 3
helm history web
kubectl get pods -l app=web
```

<details><summary>Solution / expected output</summary>

```console
$ helm rollback web 3
Rollback was a success! Happy Helming!

$ helm history web
REVISION  UPDATED  STATUS      CHART           APP VERSION  DESCRIPTION
1         ...      superseded  demo-app-0.1.0  1.27         Install complete
2         ...      superseded  demo-app-0.1.0  1.27         Upgrade complete
3         ...      superseded  demo-app-0.1.0  1.27         Upgrade complete
4         ...      superseded  demo-app-0.1.0  1.27         Upgrade complete
5         ...      deployed    demo-app-0.1.0  1.27         Rollback to 3

$ kubectl get pods -l app=web
NAME                   READY   STATUS    RESTARTS   AGE
web-xxxxxxxxx-xxxxx    1/1     Running   0          6m
```

Look closely at the history: rollback created a **new revision 5** (`Rollback to 3`) — it did
**not** delete revision 4 or "move back" to 3. It re-applied revision 3's stored manifests
(`:1.29`, 3 replicas), the bad Pod is gone, and the app is healthy again. Everything is still in
the history, so you can roll forward again.
</details>

**Question (required):** what does a revision actually store, and what does `helm rollback`
restore?

<details><summary>Answer</summary>

A **revision is a snapshot**, not a diff: it stores the **rendered manifests** + the **values**
that produced them + the **chart metadata** for that install/upgrade. Helm persists each one as
a `Secret` of type `helm.sh/release.v1` in the release's namespace (see Step 6). `helm rollback
N` reads revision **N's** stored snapshot and **re-applies it as a brand-new, higher-numbered
revision** — so it restores the *manifests and values* of revision N exactly, while **keeping
the whole history intact** (nothing is deleted, and you can roll forward again). That's why Helm
rollback is safe and auditable.
</details>

---

## Step 6 — where the history lives (optional read)

```bash
kubectl get secret -l owner=helm -l name=web
```

<details><summary>Solution / expected output</summary>

```console
NAME                          TYPE                 DATA   AGE
sh.helm.release.v1.web.v1     helm.sh/release.v1   1      8m
sh.helm.release.v1.web.v2     helm.sh/release.v1   1      6m
sh.helm.release.v1.web.v3     helm.sh/release.v1   1      5m
sh.helm.release.v1.web.v4     helm.sh/release.v1   1      2m
sh.helm.release.v1.web.v5     helm.sh/release.v1   1      30s
```

One `Secret` per revision, right there in your namespace — this **is** the release history
(that's why Helm needs no server database). Delete these and you'd lose the ability to
`helm history`/`rollback`. `helm uninstall` removes them along with the workload.
</details>

## Expected observations

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

## Cleanup / panic reset

```bash
# one command removes the workload AND all the revision history
helm uninstall web

# tidy the local files
rm -rf demo-app values-prod.yaml demo-app-*.tgz

# confirm nothing is left
helm list
kubectl get deploy,svc,pods -l app=web
```

<details><summary>Expected</summary>

```console
$ helm uninstall web
release "web" uninstalled
```

`helm list` shows no `web` release and the `app=web` objects are gone. On **kind** the fastest
reset is to throw the cluster away: `kind delete cluster --name helm-lab`.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ helm package demo-app
Successfully packaged chart and saved it to: .../demo-app-0.1.0.tgz

$ helm push demo-app-0.1.0.tgz oci://localhost:5000/charts
Pushed: localhost:5000/charts/demo-app:0.1.0
Digest: sha256:...

$ helm install web2 oci://localhost:5000/charts/demo-app --version 0.1.0
NAME: web2
STATUS: deployed
REVISION: 1
```

The key contrast with a classic repo: **no `helm repo add`**. An OCI chart is referenced by its
`oci://…` URL directly (with `--version`), because the registry already knows how to serve
artifacts by tag/digest. This is the recommended distribution model today — one registry, one
auth story for both images and charts. Clean up: `helm uninstall web2`, then
`docker rm -f registry`.

> **Non-enforcing / restricted namespace:** if a namespace enforces PSA `restricted` (from
> S17), the plain chart still admits — `nginx-unprivileged` runs as non-root UID 101. If you
> swap in a root image, add the `securityContext` from Lab 17 to `values.yaml`/the template.
</details>
