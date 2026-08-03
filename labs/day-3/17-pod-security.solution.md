# Lab 17 — Pod security (S17) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 0 — put the `restricted` bar on your namespace

Pod Security Admission is configured by **labels on the Namespace object**. Which path you take
depends on your environment.

**kind (you own the cluster):** label your namespace yourself.

```bash
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted
```

**Shared cluster (assigned namespace):** labelling a Namespace is a write on a **cluster-scoped**
object, which your in-namespace role usually can't do — **so your namespace has been pre-labelled
`restricted` for you.** Don't run the `label` command; just confirm the labels are present:

```bash
kubectl get namespace "$NS" --show-labels
```

**Task:** confirm all three PSA modes are set to `restricted` on your namespace.

```bash
kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
"pod-security.kubernetes.io/audit":"restricted"
"pod-security.kubernetes.io/enforce":"restricted"
"pod-security.kubernetes.io/warn":"restricted"
```

`enforce` is the only mode that **rejects**; `warn` returns a `Warning:` to `kubectl` and
`audit` writes to the API audit log — both still create the Pod. We set all three so you *see*
the violations (`warn`) as well as *hit* them (`enforce`).

If the `label` command fails on a shared cluster with `namespaces ... is forbidden`, that's
expected — you don't have rights on the Namespace object. Use the pre-labelled namespace, or
switch to kind.
</details>

---

### Step 1 — break: the insecure Pod is refused at the door

```bash
cat > pod-insecure.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      # no securityContext at all
EOF

kubectl apply -f pod-insecure.yaml
```

**Task:** the apply is **rejected**. Read the error — how many rules did it break, did the Pod
get created, and which four fields are named?

```bash
kubectl get pod web        # is it there?
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f pod-insecure.yaml
Error from server (Forbidden): error when creating "pod-insecure.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "web" must
set securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "web"
must set securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "web"
must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "web" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

$ kubectl get pod web
Error from server (NotFound): pods "web" not found
```

Four violations, listed in one message — the exact four fields `restricted` gates:
`allowPrivilegeEscalation`, `capabilities.drop`, `runAsNonRoot`, `seccompProfile`. This is
**admission** enforcement: the API server refused the request, so the Pod was **never created**
(`NotFound`) — there is nothing to restart, nothing to delete. Contrast that with the OOMKill in
Lab 13, where the Pod existed and *then* died.
</details>

**Question:** we applied a **bare Pod** and got the full violation list immediately. What would
have happened if we'd wrapped the same container in a **Deployment**?

<details><summary>Answer</summary>

The **Deployment** would be **admitted** — PSA doesn't check the Deployment, it checks **Pods**.
The Deployment's controller then tries to create Pods from the template, and *those* are rejected
at admission. You'd see a healthy-looking Deployment with `0` ready replicas, and the rejection
would only surface in `kubectl describe rs <name>` / events (`FailedCreate ... violates
PodSecurity`), not at your `apply`. A bare Pod fails **synchronously and loudly**, which is why
this lab uses one — but the same rules apply to every Pod a controller spawns.
</details>

---

### Step 2 — fix: clear the four gates, one at a time

The Pod was never created, so each fix is just another `apply` of the same `web` Pod with one
more field. Watch the violation list shrink by exactly one each time.

**2a — add `runAsNonRoot` (and a real non-root UID):**

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532          # the image's built-in non-root user (distroless "nonroot")
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Expected output — three left</summary>

```console
Error from server (Forbidden): error when creating "pod-step.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (...), unrestricted
capabilities (...), seccompProfile (...)
```

`runAsNonRoot != true` is gone; three violations remain. (Setting `runAsUser: 65532` isn't
required by `restricted` — `runAsNonRoot: true` alone satisfies it — but it makes the non-root
user explicit and guarantees a UID this image can actually run as.)
</details>

> **⚠️ Why this image?** `runAsNonRoot: true` is a *promise the image must keep*. Admission only
> checks that the **field is set**, so it passes — but the **kubelet** checks the image's real
> user at start. Point this Pod at an image whose effective user is **root** — most base images,
> e.g. a stock `busybox` or `debian` — and it would be **admitted** and then fail at start with
> `container has runAsNonRoot and image will run as root` (CreateContainerError →
> CrashLoopBackOff). `workshop-web` ships as the distroless `nonroot` user (UID 65532), so the
> promise holds. This is the **non-root image discipline from S02** paying off.

**2b — add `allowPrivilegeEscalation: false`** (re-apply the whole file with one more field):

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Expected output — two left</summary>

```console
Error from server (Forbidden): ... violates PodSecurity "restricted:latest":
unrestricted capabilities (...), seccompProfile (...)
```

`allowPrivilegeEscalation != false` is cleared; two violations remain.
</details>

**2c — drop all capabilities** (again, the full file plus one field):

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Expected output — one left</summary>

```console
Error from server (Forbidden): ... violates PodSecurity "restricted:latest":
seccompProfile (container "web" must set securityContext.seccompProfile.type to "RuntimeDefault"
or "Localhost")
```

Only `seccompProfile` is left — the last gate.
</details>

**2d — add the seccomp profile → admitted.** Apply the complete hardened manifest:

```bash
cat > pod-hardened.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        seccompProfile:
          type: RuntimeDefault
EOF

kubectl apply -f pod-hardened.yaml
kubectl get pod web -w        # Ctrl-C once it's Running
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f pod-hardened.yaml
pod/web created

$ kubectl get pod web
NAME   READY   STATUS    RESTARTS   AGE
web    1/1     Running   0          12s
```

All four gates pass, PSA admits the Pod, and because the image genuinely runs as non-root the
kubelet is happy too — `1/1 Running`. **The policy never changed; your manifest did.**
</details>

---

### Step 3 — beyond `restricted`: a read-only root filesystem

`readOnlyRootFilesystem: true` is **not** one of the four `restricted` gates — it's extra
defence-in-depth (a foothold can't drop tools or rewrite binaries). But it changes runtime
behaviour: the container can no longer write to its own filesystem, and many apps *need* a few
writable paths. First, see what it costs a **well-built** app — nothing:

```bash
cat > pod-readonly.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web-ro
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
EOF

kubectl apply -f pod-readonly.yaml
kubectl get pod web-ro -w        # Ctrl-C once Running
```

**Task:** the Pod runs — why didn't `readOnlyRootFilesystem` hurt it?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod web-ro
NAME     READY   STATUS    RESTARTS   AGE
web-ro   1/1     Running   0          10s
```

The demo image was **built for this**: it's distroless, logs to stdout, and keeps its state in
memory — it never writes to its own filesystem, so mounting `/` read-only costs it nothing.
That's the goal state for your own images. Most real-world apps aren't there yet, which is the
next beat.
</details>

Now the **break**: a container that writes a PID file at startup — the classic pattern that
`readOnlyRootFilesystem` trips over.

```bash
cat > pod-writer-ro.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: writer-ro
  labels: { app: s17 }
spec:
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "echo $$ > /var/run/app.pid && sleep infinity"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532          # busybox ships as root — pin a non-root UID to pass the gate
        runAsGroup: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
EOF

kubectl apply -f pod-writer-ro.yaml
kubectl get pod writer-ro -w        # Ctrl-C after you see it fail
```

**Task:** this Pod is **admitted** (it satisfies `restricted`) but doesn't stay up. What does
`kubectl logs` say?

```bash
kubectl get pod writer-ro
kubectl logs writer-ro --previous 2>/dev/null || kubectl logs writer-ro
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod writer-ro
NAME        READY   STATUS             RESTARTS      AGE
writer-ro   0/1     CrashLoopBackOff   3 (20s ago)   90s

$ kubectl logs writer-ro
sh: can't create /var/run/app.pid: Read-only file system
```

The Pod **passed admission** — this is a **runtime** failure. The app needs to write its PID
file, but with `readOnlyRootFilesystem: true` the whole root filesystem (including `/var/run`)
is read-only, so the startup command fails → the container exits → `CrashLoopBackOff`.
The error **names the path** it couldn't write — that's your list of what to make writable.
</details>

**Task:** fix it by mounting a **writable `emptyDir`** over the one path the app needs, keeping
the root filesystem read-only everywhere else.

```bash
cat > pod-writer-fixed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: writer-ro
  labels: { app: s17 }
spec:
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "echo $$ > /var/run/app.pid && sleep infinity"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
      volumeMounts:
        - { name: run, mountPath: /var/run }
  volumes:
    - { name: run, emptyDir: {} }
EOF

kubectl delete pod writer-ro --ignore-not-found  # securityContext/volumes are immutable — recreate
kubectl apply -f pod-writer-fixed.yaml
kubectl get pod writer-ro -w        # Ctrl-C once Running
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pod writer-ro
NAME        READY   STATUS    RESTARTS   AGE
writer-ro   1/1     Running   0          15s
```

The `emptyDir` gives the container a small **writable** scratch volume at exactly the path it
needs, while `/` and everything else stays read-only. If an app complains about a *different*
path, read the log line, add one more `emptyDir` mount for it, and re-apply — the method is
always "the error names the path; mount a writable volume there." This is the answer to
"how do I give a read-only-rootfs container a writable spot": **not** by dropping
`readOnlyRootFilesystem`, but by carving out just the paths that must be writable.
</details>

---

### Step 4 — observe: prove it's actually locked down

Two proofs. First, the demo app really is non-root — its image has no shell, so attach a debug
container that shares its PID namespace and read the process list:

```bash
kubectl debug -it web-ro --image=busybox:1.37 --target=web -- ps
```

Second, the writer Pod (busybox — it *has* a shell) shows the read-only root and the carve-out:

```bash
kubectl exec writer-ro -- id
kubectl exec writer-ro -- touch /nope
kubectl exec writer-ro -- touch /var/run/ok
```

**Question:** what UID are the processes, and why does the write to `/` fail while
`/var/run` works?

<details><summary>Answer / expected output</summary>

```console
$ kubectl debug -it web-ro --image=busybox:1.37 --target=web -- ps
PID   USER     TIME  COMMAND
    1 65532     0:00 /workshop-web
...

$ kubectl exec writer-ro -- id
uid=65532 gid=65532 groups=65532

$ kubectl exec writer-ro -- touch /nope
touch: /nope: Read-only file system
command terminated with exit code 1

$ kubectl exec writer-ro -- touch /var/run/ok      # succeeds — the emptyDir carve-out
```

`uid=65532`, not `0` — both containers are **non-root** (the `runAsNonRoot`/`runAsUser`
promise, kept by the image in one case and by `runAsUser` in the other). The write to `/`
fails with **`Read-only file system`** because `readOnlyRootFilesystem: true` mounts the root
read-only; only the `emptyDir` path (`/var/run`) is writable.
</details>

## Stretch (optional) — soft-launch with `warn` before you `enforce`

In the real world you don't flip `enforce=restricted` on a busy namespace blind — you turn on
`warn` first, see what *would* break, fix it, then enforce. Prove the difference on a scratch
namespace (kind, or anywhere you can create namespaces).

```bash
kubectl create namespace psa-demo
kubectl label namespace psa-demo pod-security.kubernetes.io/warn=restricted
# insecure Pod is CREATED, but kubectl prints a warning for each violation:
kubectl run canary --image=ghcr.io/platformrelay/workshop-web:v1 -n psa-demo
kubectl get pod canary -n psa-demo
```

<details><summary>What you're looking at</summary>

```console
$ kubectl run canary --image=ghcr.io/platformrelay/workshop-web:v1 -n psa-demo
Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false (...),
unrestricted capabilities (...), runAsNonRoot != true (...), seccompProfile (...)
pod/canary created

$ kubectl get pod canary -n psa-demo
NAME     READY   STATUS    RESTARTS   AGE
canary   1/1     Running   0          8s
```

Same four violations as Step 1 — but under **`warn`** the Pod is **created anyway** and you just
get a heads-up. That's how you migrate a namespace to `restricted` without an outage: `warn`
(and `audit`) to discover the offenders, fix them, *then* `enforce`. Clean up:
`kind delete cluster` (disposable) or remove the Namespace out-of-band.
</details>

## Expected state / output

- **Admission** enforcement (PSA): a Pod that violates `restricted` is **rejected at `apply`**
  and **never created** — the error lists **every** broken rule at once.
- `restricted` gates exactly **four** fields: `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault|Localhost`. Set them → admitted.
- `runAsNonRoot: true` is checked **twice**: PSA checks the *field* (admission), the kubelet
  checks the *image's real UID* (runtime) — a root image admits then **CrashLoops**.
- `readOnlyRootFilesystem` is **beyond** `restricted`: it's a **runtime** control, and apps that
  write to disk need an `emptyDir` over each writable path.
- **Admission vs runtime** is the mental model: rejected-before-it-exists vs exists-then-fails.

Representative statuses include Ready/Running Pods, NetworkPolicy timeouts, RBAC Forbidden,
Helm revision history, Application Synced/Healthy, Certificate Ready, or Prometheus targets —
compare meaning, not ephemeral names.

## Explanation

PSA evaluates the Pod (or template) at admission. A non-root image alone does not
satisfy restricted — the four securityContext fields must be declared so the API server can
prove the contract before the Pod exists. Restoring those fields therefore admits the object
because the gate sees an explicit least-privilege ask, not because the image happened to be safe.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f <file> -n "$NS"` after fixing the
broken field, or delete only the labelled objects from Cleanup / reset and restart the guided
task. Prefer `kubectl describe` Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl apply -f pod-insecure.yaml --dry-run=server 2>&1 | head -20
# after restoring the four restricted fields on pod-hardened.yaml:
kubectl apply -f pod-hardened.yaml --dry-run=server
kubectl apply -f pod-hardened.yaml
kubectl get pod hardened -n "$NS"
```

### Expected state / output

The insecure apply is rejected and lists the broken restricted rules. After the four
fields are present, dry-run and apply succeed and the Pod reaches Running/Ready under
enforce=restricted.

### Explanation

PSA evaluates the Pod (or template) at admission. A non-root image alone does not
satisfy restricted — the four securityContext fields must be declared so the API server can
prove the contract before the Pod exists. Restoring those fields therefore admits the object
because the gate sees an explicit least-privilege ask, not because the image happened to be safe.

### Hints

Compare the violation list to runAsNonRoot, allowPrivilegeEscalation, capabilities.drop,
and seccompProfile; keep enforce=restricted and use kubectl apply --dry-run=server to confirm.
