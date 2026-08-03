# Lab 17 — Pod security (S17)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S17 — Pod security (securityContext + Pod Security Standards) |
| **Environment** | namespace ✓ / kind ✓ *(namespace path: the `restricted` label is applied for you — see Step 0)* |
| **Estimated time** | 25 min |

## Objective

Meet the `restricted` **Pod Security Standard** from the wrong side. You will drop a bare,
root, no-`securityContext` Pod into a namespace that **enforces** `restricted`, watch **Pod
Security Admission** refuse it *before it is ever created*, then add the **four** fields
`restricted` gates — one at a time — until the same gate **admits** it. Finally you'll turn on
`readOnlyRootFilesystem` (which is **not** part of `restricted`) — see it cost the demo app
*nothing* (it never writes to disk), then watch it break a Pod that **does** write at
**runtime**, and give that app a writable path with an `emptyDir`.

The whole lab turns on one contrast: **admission** enforcement (PSA refuses the Pod up front —
nothing is created) vs **runtime** enforcement (the Pod exists and then misbehaves).

> **Set your namespace once.**
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights needed
  for the harden loop itself.
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1` — the workshop's demo image,
  which **already runs as a non-root user (UID 65532, the distroless `nonroot` user) and listens
  on 8080**, plus `busybox:1.37` for the runtime break. See the callout in Step 2 about why an
  image that ships running as *root* would fail even after you set `runAsNonRoot: true`.
- Pod Security Admission is **built into the API server** (stable since v1.25) — there is no
  controller to install.

## Files used

- `pod-insecure.yaml` — a bare Pod, no `securityContext` → violates `restricted`.
- `pod-hardened.yaml` — the same Pod with the four `restricted` fields set → admitted.
- `pod-readonly.yaml` — hardened **plus** `readOnlyRootFilesystem: true` → still runs (the demo
  app never writes to its root filesystem).
- `pod-writer-ro.yaml` — a Pod that writes a PID file, same hardening → **breaks at runtime**.
- `pod-writer-fixed.yaml` — adds an `emptyDir` mount over the writable path → runs again.

Everything is labelled `app: s17` so cleanup is a single label selector.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./17-pod-security.solution.md#guided-solutions)

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

**Question:** we applied a **bare Pod** and got the full violation list immediately. What would
have happened if we'd wrapped the same container in a **Deployment**?

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

## Observe

- **Admission** enforcement (PSA): a Pod that violates `restricted` is **rejected at `apply`**
  and **never created** — the error lists **every** broken rule at once.
- `restricted` gates exactly **four** fields: `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault|Localhost`. Set them → admitted.
- `runAsNonRoot: true` is checked **twice**: PSA checks the *field* (admission), the kubelet
  checks the *image's real UID* (runtime) — a root image admits then **CrashLoops**.
- `readOnlyRootFilesystem` is **beyond** `restricted`: it's a **runtime** control, and apps that
  write to disk need an `emptyDir` over each writable path.
- **Admission vs runtime** is the mental model: rejected-before-it-exists vs exists-then-fails.

## Challenge

A Deployment's Pods are refused with a multi-rule PodSecurity "restricted" violation list,
even though the image already runs as non-root. Diagnose which of the four restricted fields
are still missing from the Pod template, then restore admission without weakening the
namespace enforce label.

**Difficulty:** Intermediate

**Success criteria:** Identify every missing restricted field named in the admission error output, patch or
re-apply a Pod/Deployment template that includes all four gates, and show apply succeeds
(or dry-run=server admits) while the namespace still enforces restricted.

**Hints:** Compare the violation list to runAsNonRoot, allowPrivilegeEscalation, capabilities.drop,
and seccompProfile; keep enforce=restricted and use kubectl apply --dry-run=server to confirm.

[Spoiler: challenge solution](./17-pod-security.solution.md#challenge-solution)

## Verify

Confirm Pod Security evidence before cleanup.

```bash
kubectl get pod -n "$NS" -l app=s17
kubectl get namespace "$NS" --show-labels | tr ',' '\n' | grep pod-security || true
```

Expected: hardened/read-only/writer-fixed Pods from the guided path still exist (or were
intentionally deleted) and the namespace labels explain admit vs reject behaviour.

## Cleanup / reset

```bash
# scoped cleanup — everything this lab made is labelled app=s17
kubectl delete pod -l app=s17 -n "$NS" --ignore-not-found
rm -f pod-insecure.yaml pod-step.yaml pod-hardened.yaml \
      pod-readonly.yaml pod-writer-ro.yaml pod-writer-fixed.yaml

# kind users: remove the enforce label so later labs' plain Pods aren't rejected
# (leave warn/audit if you like — they never block)
kubectl label namespace "$NS" pod-security.kubernetes.io/enforce- 2>/dev/null || true

# panic reset (namespace): delete everything this lab could have left
# kubectl delete pod --all -n "$NS" --ignore-not-found
# panic reset (kind): kind delete cluster && <recreate>
```

> **Remove the `enforce=restricted` label when you're done (kind).** While it's set, *every* Pod
> in the namespace must be `restricted`-compliant — later labs that apply plain Pods will fail
> with `violates PodSecurity`. On a shared, pre-labelled namespace you can't remove it (and
> shouldn't) — later labs there are expected to ship compliant Pods.

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
