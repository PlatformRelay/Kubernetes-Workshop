# Lab 10 — ConfigMap & Secret (S10) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 1 — a ConfigMap, consumed as environment variables

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
  VERSION: "config-v1"    # the demo app prints $VERSION in its response body
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
  replicas: 1                      # one replica → one Pod answers every request
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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config   # every key becomes an env var
EOF

kubectl apply -f configmap.yaml
kubectl apply -f deployment-env.yaml
kubectl rollout status deploy/web
```

**Task:** confirm the env vars actually reached the container. The demo app prints its
`VERSION` env var in its own response body, so fetch it (you will reuse these two lines
all lab — Pod IPs change on every rollout, so always re-read `POD_IP` first):

```bash
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080"
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080"
workshop-web config-v1
pod: web-5f6c8b9d4-abcde
requests served: 1
ready: true
```

The first line says **`config-v1`** — the image was built as `v1`, but the ConfigMap's
`VERSION` key overrode it via the environment. That one line is proof the injection worked.
`envFrom` + `configMapRef` maps **each key** of the ConfigMap to an env var of the same
name (so `LOG_LEVEL` is set too — `kubectl describe pod -l app=s10` shows the
`Environment Variables from: web-config ConfigMap` wiring). Use `valueFrom` +
`configMapKeyRef` instead when you want just one key, possibly under a different variable
name.
</details>

**Question:** where do the env var **names** come from — the ConfigMap keys, or something
you set on the container?

<details><summary>Answer</summary>

With `envFrom`, the variable names **are** the ConfigMap keys verbatim (`VERSION`,
`LOG_LEVEL`). That's why keys meant for `envFrom` must be valid env var names. With
`valueFrom.configMapKeyRef` you pick both the source key **and** the target variable name,
so you can rename or expose only one key.
</details>

---

### Step 2 — mount the SAME ConfigMap as files

The same object, a second way in. Mount it as a **whole directory** (no `subPath`) so each
key becomes a file — and so it stays **updatable** later. The demo app's image is
**distroless** (no shell, no `ls`/`cat`), so the manifest also adds a tiny **toolbox**
sidecar that mounts the same volume — that is the honest way to look at mounted files.

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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config
          volumeMounts:
            - name: config
              mountPath: /etc/web-config     # whole directory — NOT subPath
        - name: toolbox                      # the app image has no shell —
          image: busybox:1.37                # this sidecar is our window in
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: config
              mountPath: /etc/web-config
      volumes:
        - name: config
          configMap:
            name: web-config
EOF

kubectl apply -f deployment-mounted.yaml
kubectl rollout status deploy/web
```

**Task:** list the mounted files and read one — from the **toolbox** container
(`-c toolbox`).

```bash
kubectl exec deploy/web -c toolbox -- ls /etc/web-config
kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -c toolbox -- ls /etc/web-config
LOG_LEVEL
VERSION
$ kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
config-v1
```

Each ConfigMap **key** is projected as a **file** whose contents are the value. Both
containers mount the same volume, so what the toolbox sees is exactly what the app sees.
Because we mounted the whole directory (no `subPath`), Kubernetes keeps this directory in
sync with the object — you'll use that in Step 4.
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

### Step 3 — a Secret, consumed as an env var, then decoded

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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
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
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
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

# the wiring, as the kubelet sees it:
kubectl describe pod -l app=s10 | grep -A2 'API_TOKEN'
```

**Task:** read the Secret straight from the API and recover the plaintext.

```bash
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl describe pod -l app=s10 | grep -A2 'API_TOKEN'
      API_TOKEN:  <set to the key 'API_TOKEN' in secret 'web-secret'>  Optional: false
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
czNjcjN0
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
s3cr3t
```

Note what `describe` shows: the **reference** (`<set to the key … in secret …>`), never
the value — one of the Secret's handling guarantees. But the value itself is hardly
guarded: the stored value is `czNjcjN0` — plain **base64**, reversible by anyone with `get` on the
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

### Step 4 — rotate a value: what updates, what doesn't

Change the ConfigMap and watch three different outcomes from one edit. This is the whole
point of the section.

```bash
# change VERSION from "config-v1" to "config-v2"
kubectl patch configmap web-config --type merge -p '{"data":{"VERSION":"config-v2"}}'

# (a) the env var — the app prints $VERSION in its response body; read it immediately
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
```

**Task:** did the env var change?

<details><summary>Solution / expected output</summary>

```console
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
workshop-web config-v1
```

**No.** Environment variables are read **once**, when the container starts. Editing the
ConfigMap changed the object, not the running process — the response body still says
`config-v1`. The old value persists until the Pod is recreated.
</details>

```bash
# (b) the directory-mounted file — give the kubelet up to ~90s, then read it
sleep 90
kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
```

**Task:** did the mounted file change?

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
config-v2
```

**Yes** — but not instantly. The kubelet resyncs whole-directory ConfigMap mounts on its
own cycle (typically under ~90s). If it still shows `config-v1`, wait a little longer and
re-run; it is **not** broken. (A `subPath` mount would have stayed `config-v1` forever.)
So the same Pod now holds **both** truths at once: env says `config-v1`, file says
`config-v2`.
</details>

```bash
# (c) force new Pods so the ENV picks up the change — the checksum-annotation trick
kubectl patch deploy web -p \
  '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
kubectl rollout status deploy/web

# new Pod → new IP → re-read it, then fetch again
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
```

**Task:** after the rollout, what does the env var read?

<details><summary>Solution / expected output</summary>

```console
$ kubectl patch deploy web -p '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
deployment.apps/web patched
$ kubectl rollout status deploy/web
deployment "web" successfully rolled out
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
workshop-web config-v2
```

Changing the **pod template** (here, a `checksum/config` annotation) makes the Deployment
roll out new Pods, and new Pods read the current ConfigMap — so the response body now says
`config-v2`. `kubectl rollout restart deploy/web` does the same thing manually; the
annotation is the version you can automate.
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

### Stretch (optional) — an immutable ConfigMap

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

## Expected state / output

- `envFrom` maps every ConfigMap key to an env var; `valueFrom` maps one key. The injected
  `VERSION` is visible in the app's own response body (`workshop-web config-v1`).
- The same ConfigMap mounted as a **directory** projects one file per key — read through
  the `toolbox` sidecar, because the distroless app image has no shell.
- A Secret value read from the API is **base64** (`czNjcjN0` → `s3cr3t`) — encoding, not
  encryption; `describe` shows only the reference, never the value.
- Editing a ConfigMap: **env var unchanged** (body still `config-v1`), **directory-mounted
  file updates** in ~60–90s, and a **pod-template change** (checksum annotation /
  `rollout restart`) is what refreshes the env (body becomes `config-v2`).

Representative statuses include Running/Complete/Failed Pods, Bound PVCs, Accepted
Gateway conditions, or numeric HPA TARGETS — compare meaning, not ephemeral names.

## Explanation

Environment variables are resolved once when the container starts, so ConfigMap or
Secret edits do not rewrite a running process's env. File mounts without subPath are
projected and eventually refresh; subPath mounts freeze like env. A checksum annotation
or explicit rollout recreates Pods so they pick up the new data.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f <file> -n "$NS"` after fixing the
broken field, or delete only the labelled objects from Cleanup / reset and restart the guided
task. Prefer `kubectl describe` Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl exec deploy/web -n "$NS" -- wget -qO- http://127.0.0.1:8080/ 2>/dev/null || true
kubectl get configmap web-config -n "$NS" -o yaml
kubectl rollout restart deploy/web -n "$NS"
kubectl rollout status deploy/web -n "$NS"
kubectl get pods -n "$NS" -l app=s10
```

### Expected state / output

The first exec prints the pre-rotation value. After rollout restart the new value is
present in the recreated Pod. A whole-directory mounted file would refresh in place
without recreating the Pod; env values stay frozen for the Pod lifetime.

### Explanation

Environment variables are resolved once when the container starts, so ConfigMap or
Secret edits do not rewrite a running process's env. File mounts without subPath are
projected and eventually refresh; subPath mounts freeze like env. A checksum annotation
or explicit rollout recreates Pods so they pick up the new data.

### Hints

Compare kubectl exec printenv with a file under the ConfigMap volume; look for
subPath in the mount and for a checksum annotation on the Pod template.
