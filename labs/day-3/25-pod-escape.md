# Lab 25 — Security & pod escape (S25)

> ## ⛔ STRICTLY DEFENSIVE · KIND-ONLY
>
> This lab performs a **controlled container escape** to teach you how to **block** it. It runs
> **only** in a throwaway **kind** cluster **you own and will delete**.
>
> - **Do NOT run any step against a shared, managed, or production cluster.** The escape Pod
>   reads the node's filesystem — on a real cluster that is a real compromise.
> - Every offensive step is gated by **`context-check.sh`**, which **exits non-zero** unless your
>   current context is a `kind-…` context. Run it before you do anything else.
> - The "attack" is a single **benign read** (`cat /host/etc/os-release`) to *prove* host access.
>   We **never** dump Secrets or credentials, and we **never** write to the host. The danger of
>   doing so is explained in words, not performed.

| | |
| --- | --- |
| **Section** | S25 — Security & pod escape |
| **Environment** | **kind-only · strictly defensive** (no shared-cluster path) |
| **Estimated time** | 30 min |

## Objective

See — in the safest possible way — how two Pod fields (`privileged` + `hostPath: /`) let a
container **escape onto its node**, then **block that exact Pod** with the `restricted` Pod
Security Standard from S17. You will:

1. Prove you're on a kind cluster with a **guard script** before touching anything offensive.
2. In a **permissive** namespace, run the escape Pod and read **one benign node file** to prove
   you're reading the **node's** filesystem — not the container image's.
3. **Delete** the Pod, label the namespace **`enforce=restricted`**, and **re-apply the same Pod**
   → watch **Pod Security Admission reject it at CREATE**, for the privileged/hostPath violations.
4. Apply the **hardened** manifest and confirm the same gate **admits** it.

The lab turns on one contrast: the settings that make an escape possible are **exactly** the ones
`restricted` forbids — and admission blocks them **before the Pod ever exists**.

## Prerequisites

- **Docker + `kind` + `kubectl`**, and rights to create a local cluster. You will create a
  disposable cluster named `escape-lab` and delete it at the end.
- **No shared-cluster path exists for this lab.** The offensive step reads the node filesystem;
  that is only acceptable on a cluster you own. If you can't run kind, **read along** — every step
  has a spoiler with the exact output.
- Internet pull access for `alpine:3.20` (a tiny image with a shell — used for *both* the escape
  Pod and the hardened Pod, so the only thing that changes is the security settings).
- Pod Security Admission is **built into the API server** (stable since v1.25) — nothing to install.

## Files used

- `context-check.sh` — refuses to proceed unless the current context is a `kind-…` context. This is
  the workshop's shared safety guard, kept byte-identical to the tested canonical
  [`infra/context-guard.sh`](../../infra/context-guard.sh).
- `pod-escape.yaml` — the `privileged` + `hostPath: /` Pod. **Dangerous by design.**
- `pod-hardened.yaml` — the same workload, hardened to satisfy `restricted` → admitted.

Everything the lab creates is labelled `app: s25` so cleanup is a single selector — and the whole
cluster is disposable anyway.

---

## Step 0 — a throwaway cluster, and the guard that gates everything

```bash
kind create cluster --name escape-lab
export NS=escape
kubectl create namespace "$NS"
kubectl config set-context --current --namespace="$NS"
kubectl get nodes
```

Now write the guard. **Every offensive step below runs this first.** This is the workshop's
**shared** kind-only safety guard — its canonical, shellcheck'd and bats-tested source of truth
lives at [`infra/context-guard.sh`](../../infra/context-guard.sh); the heredoc below is
byte-identical to it, so the lab stays a standalone, copy-pasteable artifact (ADR 0009) while the
guard is still tested in CI.

```bash
cat > context-check.sh <<'EOF'
#!/usr/bin/env sh
# Refuse to run offensive steps anywhere but a kind cluster you own.
ctx="$(kubectl config current-context 2>/dev/null)"
case "$ctx" in
  kind-*)
    echo "OK: current context is '$ctx' (a kind cluster) — safe to proceed."
    ;;
  *)
    echo "REFUSING: current context is '$ctx', which is NOT a kind- context." >&2
    echo "This lab performs a container escape and must run ONLY in a throwaway kind cluster." >&2
    exit 1
    ;;
esac
EOF
chmod +x context-check.sh

./context-check.sh
```

**Task:** confirm the guard passes on your kind cluster — and understand it would **fail closed**
anywhere else.

<details><summary>Solution / expected output</summary>

```console
$ ./context-check.sh
OK: current context is 'kind-escape-lab' (a kind cluster) — safe to proceed.
```

`kind create cluster --name escape-lab` sets your kubectl context to **`kind-escape-lab`**. The
guard matches `kind-*` and prints `OK`. On any other context (a shared/managed cluster is almost
never named `kind-…`) it prints `REFUSING…` to stderr and **exits 1**, so a copy-pasted step won't
run. It's a **fail-closed** check: unknown context → refuse.
</details>

> **⚠️ Why this guard matters.** The next step deliberately reads the node's filesystem. That's a
> teaching move in a cluster you'll throw away; it's a **security incident** on a shared cluster.
> The context check is the single safety rail that keeps the offensive step where it belongs.
> Never remove it, and never widen it to match a real cluster's context name.

---

## Step 1 — the permissive namespace (the door is open)

`restricted` is opt-in. To *show* the escape first, we explicitly mark this namespace as the
loosest standard, `privileged` — so the API server won't stop the dangerous Pod.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=privileged
kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
```

**Task:** confirm the namespace enforces the `privileged` standard (i.e. no restrictions).

<details><summary>Solution / expected output</summary>

```console
$ kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
"pod-security.kubernetes.io/enforce":"privileged"
```

`enforce: privileged` is the **loosest** Pod Security Standard — it imposes **no** restrictions, so
a `privileged` + `hostPath` Pod is admitted. We label it explicitly (rather than leaning on the
default) so the contrast with `restricted` in Step 3 is unmistakable: **same namespace, one label
changed.**
</details>

> **⚠️ Why this is dangerous in the real world.** A namespace with **no** enforced Pod Security
> Standard is the default on many clusters. It means *any* Pod anyone can create — including one
> with `privileged` + `hostPath` — is accepted. The very first hardening step on any cluster is to
> stop leaving namespaces unlabelled.

---

## Step 2 — the escape: read the node's filesystem from a Pod

Run the guard, then apply the escape Pod.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

cat > pod-escape.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: escape
  labels: { app: s25 }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        privileged: true                 # near-total power on the node
      volumeMounts:
        - name: host
          mountPath: /host               # the node's / is now visible at /host
  volumes:
    - name: host
      hostPath:
        path: /                          # mount the ENTIRE host root
EOF

kubectl apply -f pod-escape.yaml
kubectl wait --for=condition=Ready pod/escape --timeout=60s
```

**Task:** prove you're reading the **node's** filesystem — not the alpine image's — with **one
benign read**. Compare the container's own `/etc/os-release` with the node's at `/host/etc/os-release`.

```bash
echo "== container image OS =="
kubectl exec escape -- cat /etc/os-release | grep -E '^(NAME|PRETTY_NAME)='

echo "== NODE OS (via the hostPath mount) =="
kubectl exec escape -- cat /host/etc/os-release | grep -E '^(NAME|PRETTY_NAME)='

echo "== node's kubernetes dir is right there (listing only — we read nothing sensitive) =="
kubectl exec escape -- ls /host/etc/kubernetes 2>/dev/null || \
  kubectl exec escape -- ls /host/etc | head
```

<details><summary>Solution / expected output</summary>

```console
== container image OS ==
NAME="Alpine Linux"
PRETTY_NAME="Alpine Linux v3.20"

== NODE OS (via the hostPath mount) ==
NAME="Debian GNU/Linux"
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"

== node's kubernetes dir is right there (listing only — we read nothing sensitive) ==
admin.conf
controller-manager.conf
kubelet.conf
manifests
pki
scheduler.conf
```

The container's own OS is **Alpine** (its image), but `/host/etc/os-release` reports **Debian** —
the kind **node**'s OS. Those are two different operating systems: the second read came from the
node's real root filesystem, mounted in by `hostPath: /`. The `ls` shows the node's
`/etc/kubernetes` directory (kubeconfigs, the `pki` cert dir, the static-pod `manifests` dir) is
sitting right there — **we list it to prove reach and stop; we do not open any of it.**
</details>

> **⚠️ Why this is the whole ballgame.** With `/host` = the node's `/`, this same *read-write*
> access reaches, on a real cluster: the **kubelet's client certificate and the cluster CA**
> (`/host/etc/kubernetes/pki`), **every Pod's projected ServiceAccount tokens and Secrets** under
> `/host/var/lib/kubelet/pods/…`, and the **static-pod directory** `/host/etc/kubernetes/manifests`
> — write a manifest there and the kubelet runs it **as root on the node**. `privileged` piles on
> device access and a relaxed seccomp profile. We demonstrate the *access* with one harmless read
> and stop; **do not** read tokens or write anything. The point is made — now we block it.

**Question:** we only ran `sleep` and one `cat`. Which **single setting** most enabled this escape?

<details><summary>Answer</summary>

**`hostPath: { path: / }`** is what actually exposed the node's filesystem — it's the door the read
walked through. `privileged: true` is the bigger *capability* lever in general (device access,
relaxed seccomp, near-all caps, and it's needed to *write* freely across the host), but for *this
specific read* the hostPath mount is the enabler: without it there is no `/host` to read. In
practice they travel together, and — crucially — **`restricted` forbids both.** That's why one
policy closes the whole class of door, which is exactly Step 3.
</details>

> **⚠️ Why this is dangerous.** A single innocuous-looking `hostPath` line — no `privileged`
> needed — can silently hand a Pod the node's whole disk. It's why `hostPath` is treated as a
> `baseline`/`restricted` violation on its own: the volume type *is* the risk, regardless of what
> the container does with it.

---

## Step 3 — the fix: delete first, then let `restricted` reject the same Pod

**Order matters.** Pod Security Admission gates Pods at **CREATE** time only. Labelling the
namespace `restricted` does **not** evict the already-running escape Pod — so we **delete it
first**, then tighten the namespace, then try to re-create the *identical* Pod and watch admission
refuse it.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

# 1) remove the running escape Pod (admission won't touch what already exists)
kubectl delete -f pod-escape.yaml

# 2) tighten the SAME namespace to the restricted standard
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted

# 3) re-apply the EXACT SAME escape manifest
kubectl apply -f pod-escape.yaml
```

**Task:** the re-apply is **rejected**. Read the error — is the Pod created, and which dangerous
settings are named?

```bash
kubectl get pod escape        # is it there?
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f pod-escape.yaml
Error from server (Forbidden): error when creating "pod-escape.yaml": pods "escape" is forbidden:
violates PodSecurity "restricted:latest": privileged (container "shell" must not set
securityContext.privileged=true), allowPrivilegeEscalation != false (container "shell" must set
securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "shell" must
set securityContext.capabilities.drop=["ALL"]), restricted volume types (volume "host" uses
restricted volume type "hostPath"), runAsNonRoot != true (pod or container "shell" must set
securityContext.runAsNonRoot=true), seccompProfile (pod or container "shell" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

$ kubectl get pod escape
Error from server (NotFound): pods "escape" not found
```

The **exact same manifest** that ran in Step 2 is now refused. The message names the two escape
levers directly — **`privileged`** and **`restricted volume types … "hostPath"`** — alongside the
four least-privilege gates from S17. This is **admission** enforcement: the API server rejected the
request, so the Pod was **never created** (`NotFound`). One namespace label closed the door.
</details>

> **⚠️ Why delete-then-relabel (and not relabel-first).** PSA is an **admission** controller — it
> only runs when an object is **created or updated**, never on objects already stored. If you label
> the namespace `restricted` while the escape Pod is running, the Pod **keeps running** — the
> policy doesn't retroactively kill it. That's a real operational gotcha: enforcing `restricted`
> protects you from *new* violating Pods but doesn't remediate existing ones. So we delete first,
> then prove the gate blocks the re-create.

**Question:** the escape Pod named **`privileged`** and **`hostPath`**, yet the error *also* lists
`runAsNonRoot`, `allowPrivilegeEscalation`, `capabilities`, and `seccompProfile`. Why all six?

<details><summary>Answer</summary>

`restricted` is a **superset** of `baseline`. **`baseline`** blocks the obviously-dangerous
host-facing settings — that's where **`privileged`** and **`hostPath`** ("restricted volume types")
come from. **`restricted`** then *adds* the four least-privilege requirements from S17
(`runAsNonRoot`, `allowPrivilegeEscalation: false`, drop `ALL`, `seccompProfile`). The escape Pod
sets none of the four, so it trips **all six** rules at once. Blocking the escape and demanding
least privilege are the same policy — which is why `restricted` is the highest-leverage single
control.
</details>

> **⚠️ Why this matters for defence.** The escape settings (`privileged`, `hostPath`) and the
> least-privilege settings are enforced by the **same** namespace label. You don't choose between
> "block escapes" and "least privilege" — `restricted` gives you both, and a Pod that skips the
> least-privilege fields is treated as just as suspect as one that mounts the host.

---

## Step 4 — the hardened Pod the gate admits

Same workload (alpine running `sleep`), stripped of the escape levers and hardened to satisfy
`restricted`. `alpine` runs happily at **any** UID, so `runAsUser: 1000` won't CrashLoop the way a
root-only image would (the S17 landmine).

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

cat > pod-hardened.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: hardened
  labels: { app: s25 }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000                      # explicit non-root UID (alpine runs at any UID)
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
      # no privileged, no hostPath — the escape levers are gone
EOF

kubectl apply -f pod-hardened.yaml
kubectl get pod hardened -w        # Ctrl-C once it's Running
```

**Task:** confirm the hardened Pod is **admitted and running**, and that it is genuinely non-root
with no view of the host.

```bash
kubectl exec hardened -- id
kubectl exec hardened -- ls /host 2>&1 || true
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f pod-hardened.yaml
pod/hardened created

$ kubectl get pod hardened
NAME       READY   STATUS    RESTARTS   AGE
hardened   1/1     Running   0          8s

$ kubectl exec hardened -- id
uid=1000 gid=0 groups=0

$ kubectl exec hardened -- ls /host
ls: /host: No such file or directory
command terminated with exit code 1
```

The same gate that **rejected** the escape Pod **admits** this one — all six rules pass:
`privileged` unset, no `hostPath` volume, non-root UID **1000**, no priv-esc, all caps dropped,
`RuntimeDefault` seccomp. `id` shows **uid=1000** (not 0), and there is **no `/host`** — the host
filesystem is gone. Same namespace, same policy; the **manifest** met the bar.
</details>

> **⚠️ Why `runAsUser: 1000` here.** `runAsNonRoot: true` is a *promise the image must keep* (the
> S17 landmine): admission only checks the field, but the **kubelet** refuses to start a container
> whose image resolves to UID 0. A root-only image would admit and then **CrashLoop** with
> `container has runAsNonRoot and image will run as root`. `alpine` runs at **any** UID, so pinning
> `runAsUser: 1000` guarantees a non-root user the image actually supports.

**Question:** across the whole lab — which **single defence** was highest-leverage?

<details><summary>Answer</summary>

**Enforcing the `restricted` Pod Security Standard on the namespace** — one label. It's the
highest-leverage control because it blocks the *entire* class of escape at **admission**, before a
violating Pod can exist: it forbids `privileged`, `hostPath` and host namespaces (via `baseline`)
**and** demands least privilege (the four `restricted` fields). No image change, no code change, no
runtime agent — a single namespace label rejected the exact Pod that had just read the node. Pair
it with image hygiene (S02), NetworkPolicy (S18), and scanning/detection for defence in depth, but
if you do **one** thing, label your namespaces `restricted`.
</details>

> **⚠️ Why "highest-leverage" is the point.** Runtime detection catches an escape *after* it
> happens; image scanning catches a *known* CVE. Admission (`restricted`) is the only layer that
> stops the dangerous Pod from **ever existing** — it's proactive, needs no agent, and covers Pods
> you haven't even written yet. That's why it's the first thing to turn on, not the last.

## Expected observations

- A container is a **process on the node's kernel**: `hostPath: /` handed the Pod the **node's**
  filesystem (proved by the Debian-vs-Alpine `os-release` diff), and `privileged` handed it
  near-total power. The escape needed **no exploit** — just two supported Pod fields.
- **Admission gates CREATE, not existing Pods:** labelling `restricted` didn't evict the running
  escape Pod — you had to **delete first**, which is exactly why the fix order is delete → relabel
  → re-apply.
- The **exact same manifest** that ran under `enforce: privileged` is **rejected** under
  `enforce: restricted` — the error names **`privileged`** and **`hostPath`** plus the four S17
  least-privilege gates (six rules), and the Pod is **never created**.
- The **hardened** Pod — same workload, escape levers removed, `restricted`-compliant — is
  **admitted** and runs as **uid 1000** with no `/host`.
- **Highest-leverage defence:** `enforce: restricted` on the namespace, at admission. Everything
  else is defence in depth around it.

## Cleanup / panic reset

```bash
# scoped cleanup — everything this lab made is labelled app=s25
kubectl delete pod -l app=s25 -n "$NS" --ignore-not-found
kubectl delete namespace "$NS" --ignore-not-found
rm -f context-check.sh pod-escape.yaml pod-hardened.yaml

# PANIC RESET (recommended) — the cluster was disposable; throw the whole thing away:
kind delete cluster --name escape-lab
```

> **Panic option: delete the cluster.** Because the escape Pod had the host root mounted read-write,
> the cleanest guarantee that nothing was left behind is to **destroy the kind cluster entirely** —
> `kind delete cluster --name escape-lab`. It was disposable by design. This is the reset to reach
> for if anything felt off, and it's why this lab is kind-only: you can always burn it down.

## Stretch (optional) — soft-launch with `warn` before you `enforce`

On a real cluster you don't flip `enforce=restricted` on a busy namespace blind — you turn on
**`warn`** first to discover what *would* break, fix it, then enforce. Prove the difference against
the escape Pod on a fresh scratch namespace.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }
kubectl create namespace s25-warn
kubectl label namespace s25-warn pod-security.kubernetes.io/warn=restricted
kubectl apply -n s25-warn -f pod-escape.yaml
kubectl get pod escape -n s25-warn
```

<details><summary>What you're looking at</summary>

```console
$ kubectl apply -n s25-warn -f pod-escape.yaml
Warning: would violate PodSecurity "restricted:latest": privileged (container "shell" must not set
securityContext.privileged=true), ... restricted volume types (volume "host" uses restricted volume
type "hostPath"), ... seccompProfile (...)
pod/escape created

$ kubectl get pod escape -n s25-warn
NAME     READY   STATUS    RESTARTS   AGE
escape   1/1     Running   0          6s
```

Under **`warn`**, the API server returns the *same* six-violation list as a **`Warning:`** — but it
**creates the Pod anyway** (there's the escape running again). `warn` is discovery, not a block;
only **`enforce`** rejects. That's the real-world migration play: `warn` (and `audit`) to find
offenders across a namespace, fix them, **then** `enforce`. Because this namespace only `warn`s, the
escape Pod runs — so tear it down: `kubectl delete namespace s25-warn`.
</details>

> **⚠️ Why the stretch stays kind-only too.** `warn` **creates** the Pod — so this scratch namespace
> briefly runs a privileged, host-mounting Pod exactly like Step 2. That's fine in your disposable
> kind cluster and nowhere else. Delete the namespace when done, or just `kind delete cluster`.
