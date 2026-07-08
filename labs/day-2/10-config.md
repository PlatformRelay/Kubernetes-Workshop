# Lab 10 — ConfigMap & Secret (S10)

| | |
| --- | --- |
| **Section** | S10 — ConfigMap & Secret |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin, no CRDs)* |
| **Estimated time** | 25 min |

## Objective

Separate configuration from the image. You will inject a **ConfigMap** as environment
variables and as mounted files, inject a **Secret** and decode it (proving base64 is not
encryption), then **rotate** a value and watch exactly what does and doesn't change — env
frozen at start, a directory-mounted file updating on its own, and a checksum annotation
forcing a fresh rollout. This is the first Day-2 *layering* lab: it takes the same
`web` app and makes it configurable.

> **Set your namespace once.** Everything below runs in your assigned namespace (or a kind
> cluster). Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–06 concepts (Pod, Deployment). This lab **creates its own** `web` Deployment, so
  it does not depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights,
  no add-ons, no CRDs — the namespace and kind paths are **identical**.

## Files used

- `configmap.yaml` — the `web-config` ConfigMap (two keys).
- `deployment-env.yaml` — the `web` Deployment consuming the ConfigMap as **env** (`envFrom`).
- `deployment-mounted.yaml` — same Deployment, ConfigMap **also mounted as files**.
- `secret.yaml` — the `web-secret` Secret.
- `deployment-secret.yaml` — final Deployment: env + mounted files + a **Secret env var**.

Everything is labelled `app: s10` so cleanup is a single label selector.

---

## Step 1 — a ConfigMap, consumed as environment variables

Create the ConfigMap, then a Deployment that pulls **every** key in as an env var with
`envFrom`.

```bash
cat > configmap.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  labels:
    app: s10
data:
  GREETING: "hi"
  LOG_LEVEL: "info"
EOF

cat > deployment-env.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1                      # one replica → `exec` is unambiguous
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: web-config   # every key becomes an env var
EOF

kubectl apply -f configmap.yaml
kubectl apply -f deployment-env.yaml
kubectl rollout status deploy/web
```

**Task:** confirm the container actually has `GREETING` and `LOG_LEVEL` in its environment.

```bash
kubectl exec deploy/web -- printenv GREETING LOG_LEVEL
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -- printenv GREETING LOG_LEVEL
hi
info
```

`envFrom` + `configMapRef` maps **each key** of the ConfigMap to an env var of the same
name. (Use `valueFrom` + `configMapKeyRef` instead when you want just one key, possibly
under a different variable name.)
</details>

**Question:** where do the env var **names** come from — the ConfigMap keys, or something
you set on the container?

<details><summary>Answer</summary>

With `envFrom`, the variable names **are** the ConfigMap keys verbatim (`GREETING`,
`LOG_LEVEL`). That's why keys meant for `envFrom` must be valid env var names. With
`valueFrom.configMapKeyRef` you pick both the source key **and** the target variable name,
so you can rename or expose only one key.
</details>

---

## Step 2 — mount the SAME ConfigMap as files

The same object, a second way in. Mount it as a **whole directory** (no `subPath`) so each
key becomes a file — and so it stays **updatable** later.

```bash
cat > deployment-mounted.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: web-config
          volumeMounts:
            - name: config
              mountPath: /etc/web-config     # whole directory — NOT subPath
      volumes:
        - name: config
          configMap:
            name: web-config
EOF

kubectl apply -f deployment-mounted.yaml
kubectl rollout status deploy/web
```

**Task:** list the mounted files and read one.

```bash
kubectl exec deploy/web -- ls /etc/web-config
kubectl exec deploy/web -- cat /etc/web-config/GREETING
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -- ls /etc/web-config
GREETING
LOG_LEVEL
$ kubectl exec deploy/web -- cat /etc/web-config/GREETING
hi
```

Each ConfigMap **key** is projected as a **file** whose contents are the value. Because we
mounted the whole directory (no `subPath`), Kubernetes keeps this directory in sync with
the object — you'll use that in Step 4.
</details>

**Question:** we mounted at `/etc/web-config` without `subPath`. Why does that matter for
what comes later?

<details><summary>Answer</summary>

A **whole-directory** ConfigMap mount is refreshed by the kubelet when the object changes
(within ~60–90s). A **`subPath`** mount copies the file **once** at mount time and then
**never** updates — it behaves like an env var. If you need live updates from a mounted
file, do **not** use `subPath`.
</details>

---

## Step 3 — a Secret, consumed as an env var, then decoded

Sensitive values go in a Secret. Add one key to the container as `API_TOKEN`, then prove
the value is only **base64-encoded**, not encrypted.

```bash
cat > secret.yaml <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: web-secret
  labels:
    app: s10
type: Opaque
stringData:
  API_TOKEN: "s3cr3t"              # stringData: you write plaintext; k8s stores base64
EOF

cat > deployment-secret.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: web-config
          env:
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: web-secret
                  key: API_TOKEN
          volumeMounts:
            - name: config
              mountPath: /etc/web-config
      volumes:
        - name: config
          configMap:
            name: web-config
EOF

kubectl apply -f secret.yaml
kubectl apply -f deployment-secret.yaml
kubectl rollout status deploy/web

kubectl exec deploy/web -- printenv API_TOKEN
```

**Task:** read the Secret straight from the API and recover the plaintext.

```bash
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -- printenv API_TOKEN
s3cr3t
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
czNjcjN0
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
s3cr3t
```

The stored value is `czNjcjN0` — plain **base64**, reversible by anyone with `get` on the
Secret. A Secret is **not** encrypted at the API. Its real protections are **RBAC** (who
may read it) and **etcd encryption-at-rest** (who may read the disk). `stringData` is a
write-time convenience — you write plaintext, the API stores base64 under `data`.
</details>

**Question:** so what does putting a value in a Secret (vs a ConfigMap) actually buy you?

<details><summary>Answer</summary>

Handling, not cryptography: Secrets are gated by RBAC separately from ConfigMaps, kept out
of most log/describe output, can be encrypted at rest in etcd, and carry a `type`
(`Opaque`, `kubernetes.io/tls`, `kubernetes.io/dockerconfigjson`) that tells consumers what
they hold. The value itself is still base64 — treat "can `get secrets`" as "can read every
secret".
</details>

---

## Step 4 — rotate a value: what updates, what doesn't

Change the ConfigMap and watch three different outcomes from one edit. This is the whole
point of the section.

```bash
# change GREETING from "hi" to "hello"
kubectl patch configmap web-config --type merge -p '{"data":{"GREETING":"hello"}}'

# (a) the env var — read it immediately
kubectl exec deploy/web -- printenv GREETING
```

**Task:** did the env var change?

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -- printenv GREETING
hi
```

**No.** Environment variables are read **once**, when the container starts. Editing the
ConfigMap changed the object, not the running process. The old value persists until the
Pod is recreated.
</details>

```bash
# (b) the directory-mounted file — give the kubelet up to ~90s, then read it
sleep 90
kubectl exec deploy/web -- cat /etc/web-config/GREETING
```

**Task:** did the mounted file change?

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -- cat /etc/web-config/GREETING
hello
```

**Yes** — but not instantly. The kubelet resyncs whole-directory ConfigMap mounts on its
own cycle (typically under ~90s). If it still shows `hi`, wait a little longer and re-run;
it is **not** broken. (A `subPath` mount would have stayed `hi` forever.)
</details>

```bash
# (c) force new Pods so the ENV picks up the change — the checksum-annotation trick
kubectl patch deploy web -p \
  '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
kubectl rollout status deploy/web
kubectl exec deploy/web -- printenv GREETING
```

**Task:** after the rollout, what does the env var read?

<details><summary>Solution / expected output</summary>

```console
$ kubectl patch deploy web -p '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
deployment.apps/web patched
$ kubectl rollout status deploy/web
deployment "web" successfully rolled out
$ kubectl exec deploy/web -- printenv GREETING
hello
```

Changing the **pod template** (here, a `checksum/config` annotation) makes the Deployment
roll out new Pods, and new Pods read the current ConfigMap — so the env var is now `hello`.
`kubectl rollout restart deploy/web` does the same thing manually; the annotation is the
version you can automate.
</details>

**Question (headline):** why did the env var not change but the mounted file did?

<details><summary>Answer</summary>

They have different update models. **Env vars** are materialised **once** at container
start and never re-read — the only way to change them is to replace the Pod. A
**whole-directory file mount** is **kept in sync** by the kubelet, so it reflects the new
value after a short delay without any restart. (Had we used `subPath`, the file would
behave like the env var — frozen.)
</details>

**Question:** in production, what would you put in that `checksum/config` annotation so a
rollout happens automatically whenever the config changes?

<details><summary>Answer</summary>

A **hash of the ConfigMap/Secret contents** (e.g. `sha256sum` of the rendered manifest).
When the config changes, the hash changes, the pod-template annotation changes, and a
normal rolling update ships the new value — no manual step. Helm (`checksum/config:
{{ include ... | sha256sum }}`) and Kustomize (hashed ConfigMap names via
`configMapGenerator`) both automate exactly this.
</details>

## Expected observations

- `envFrom` maps every ConfigMap key to an env var; `valueFrom` maps one key.
- The same ConfigMap mounted as a **directory** projects one file per key.
- A Secret value read from the API is **base64** (`czNjcjN0` → `s3cr3t`) — encoding, not
  encryption.
- Editing a ConfigMap: **env var unchanged**, **directory-mounted file updates** in
  ~60–90s, and a **pod-template change** (checksum annotation / `rollout restart`) is what
  refreshes the env.

## Cleanup / panic reset

```bash
# scoped cleanup — everything this lab made is labelled app=s10
kubectl delete configmap,secret,deployment -l app=s10 -n "$NS" --ignore-not-found
rm -f configmap.yaml deployment-env.yaml deployment-mounted.yaml secret.yaml deployment-secret.yaml

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete deploy,rs,pod,configmap,secret --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

## Stretch (optional) — an immutable ConfigMap

Prove that `immutable: true` blocks in-place edits, so a new value means a new object.

```bash
cat > configmap-immutable.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config-v1
  labels:
    app: s10
immutable: true
data:
  GREETING: "locked"
EOF

kubectl apply -f configmap-immutable.yaml
# now try to change it in place:
kubectl patch configmap web-config-v1 --type merge -p '{"data":{"GREETING":"nope"}}'
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl patch configmap web-config-v1 --type merge -p '{"data":{"GREETING":"nope"}}'
The ConfigMap "web-config-v1" is invalid: data: Forbidden: field is immutable when
`immutable` is set
```

The API **rejects** the edit — an immutable object's `data` can never change. To roll a new
value you create `web-config-v2` and repoint the Deployment. The payoff: the kubelet stops
watching immutable objects (less API load at scale) and no accidental edit can silently
reconfigure live Pods. Clean up: `kubectl delete configmap web-config-v1 -n "$NS"`.
</details>
