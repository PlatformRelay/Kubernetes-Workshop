# Lab 25 — Security & pod escape (S25) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 0 — a throwaway cluster, and the guard that gates everything

```bash
export WORKSHOP_CLUSTER_NAME=escape-lab
kind create cluster --name "$WORKSHOP_CLUSTER_NAME"
```

Now write the guard. Its `--claim` mode can establish the ownership marker on an existing disposable
cluster, but only **after** the exact context, loopback API endpoint, local kind provider, and node
metadata have all passed. The endpoint must equal the server in kind's own generated kubeconfig.
Every later offensive step runs the stricter read-only check in the `escape` namespace.

```bash
cat > context-check.sh <<'EOF'
#!/usr/bin/env sh
# Fail closed unless this is the exact, locally owned disposable kind cluster.

set -eu

marker_name="platformrelay-workshop-ownership"
claim_marker=false

refuse() {
  echo "REFUSING: $*" >&2
  echo "This lab performs a container escape and must run ONLY in a disposable kind cluster you own." >&2
  exit 1
}

case "${1:-}" in
  "") ;;
  --claim) claim_marker=true ;;
  *) refuse "unknown option '$1'" ;;
esac
[ "$#" -le 1 ] || refuse "too many arguments"

expected_cluster="${WORKSHOP_CLUSTER_NAME:-workshop}"
printf '%s\n' "$expected_cluster" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$' || \
  refuse "WORKSHOP_CLUSTER_NAME is not a safe kind cluster name"
expected_context="kind-${expected_cluster}"
expected_node="${expected_cluster}-control-plane"
expected_namespace="${WORKSHOP_LAB_NAMESPACE:-escape}"
printf '%s\n' "$expected_namespace" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || \
  refuse "WORKSHOP_LAB_NAMESPACE is not a safe Kubernetes namespace name"

if ! context="$(kubectl config current-context 2>/dev/null)" || [ -z "$context" ]; then
  refuse "kubectl has no readable current context"
fi
if ! cluster="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.cluster}' 2>/dev/null)" || [ -z "$cluster" ]; then
  refuse "kubectl cannot resolve the current kubeconfig cluster"
fi
if ! server="$(kubectl config view --minify -o 'jsonpath={.clusters[0].cluster.server}' 2>/dev/null)" || [ -z "$server" ]; then
  refuse "kubectl cannot resolve the current cluster server"
fi
if ! namespace="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.namespace}' 2>/dev/null)"; then
  refuse "kubectl cannot resolve the current namespace"
fi
namespace="${namespace:-default}"

[ "$context" = "$expected_context" ] || \
  refuse "context must be exactly '$expected_context'"
[ "$cluster" = "$expected_context" ] || \
  refuse "kubeconfig cluster must be exactly '$expected_context'"
printf '%s\n' "$server" | LC_ALL=C grep -Eq '^https://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+$' || \
  refuse "API server is not a loopback kind endpoint"
printf '%s\n' "$namespace" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || \
  refuse "current namespace is not a safe Kubernetes namespace name"
if [ "$claim_marker" = true ]; then
  [ "$namespace" = default ] || \
    refuse "marker claim must start in the 'default' namespace"
else
  [ "$namespace" = "$expected_namespace" ] || \
    refuse "current namespace must be exactly '$expected_namespace'"
fi

echo "Resolved Kubernetes target:"
echo "  context: $context"
echo "  cluster: $cluster"
echo "  server: $server"
echo "  namespace: $namespace"

if ! local_clusters="$(kind get clusters 2>/dev/null)"; then
  refuse "kind cannot enumerate local clusters"
fi
printf '%s\n' "$local_clusters" | grep -Fxq "$expected_cluster" || \
  refuse "'$expected_cluster' is not a cluster owned by the local kind provider"

if ! kind_kubeconfig="$(kind get kubeconfig --name "$expected_cluster" 2>/dev/null)"; then
  refuse "kind cannot read the canonical kubeconfig for '$expected_cluster'"
fi
kind_server="$(printf '%s\n' "$kind_kubeconfig" | awk '$1 == "server:" { print $2; exit }')"
[ -n "$kind_server" ] || refuse "kind kubeconfig has no API server"
[ "$server" = "$kind_server" ] || \
  refuse "current API server does not match kind's '$expected_cluster' kubeconfig"

if ! kind_nodes="$(kind get nodes --name "$expected_cluster" 2>/dev/null)"; then
  refuse "kind cannot resolve nodes for '$expected_cluster'"
fi
printf '%s\n' "$kind_nodes" | grep -Fxq "$expected_node" || \
  refuse "kind does not report the expected control-plane node '$expected_node'"

if ! node_identity="$(kubectl get node "$expected_node" -o 'jsonpath={.metadata.labels.kubernetes\.io/hostname}|{.spec.providerID}' 2>/dev/null)"; then
  refuse "kubectl cannot read the expected kind node identity"
fi
case "$node_identity" in
  "$expected_node|kind://"*"/$expected_cluster/$expected_node") ;;
  *) refuse "node metadata does not identify the expected kind provider/cluster" ;;
esac

if ownership_cluster="$(kubectl --namespace kube-system get configmap "$marker_name" -o 'jsonpath={.data.cluster}' 2>&1)"; then
  [ "$ownership_cluster" = "$expected_cluster" ] || \
    refuse "ownership marker belongs to '$ownership_cluster', not '$expected_cluster'"
else
  expected_not_found="Error from server (NotFound): configmaps \"$marker_name\" not found"
  [ "$ownership_cluster" = "$expected_not_found" ] || \
    refuse "ownership marker lookup failed without the exact NotFound response"
  [ "$claim_marker" = true ] || \
    refuse "workshop ownership marker is missing; recreate the cluster or run this guard once with --claim"
  kubectl create configmap "$marker_name" \
    --namespace kube-system \
    --from-literal="cluster=$expected_cluster" >/dev/null || \
    refuse "could not create the workshop ownership marker"
  echo "Ownership marker created for disposable cluster '$expected_cluster'."
fi

echo "OK: disposable workshop kind cluster identity verified — safe to proceed."
EOF
chmod +x context-check.sh

./context-check.sh --claim

export NS=escape
kubectl create namespace "$NS"
kubectl config set-context --current --namespace="$NS"
kubectl get nodes

./context-check.sh
```

**Task:** confirm the guard passes on your kind cluster — and understand it would **fail closed**
anywhere else.

<details><summary>Solution / expected output</summary>

```console
$ ./context-check.sh --claim
Resolved Kubernetes target:
  context: kind-escape-lab
  cluster: kind-escape-lab
  server: https://127.0.0.1:54321
  namespace: default
Ownership marker created for disposable cluster 'escape-lab'.
OK: disposable workshop kind cluster identity verified — safe to proceed.
```

The port is assigned dynamically, so yours will differ. A name beginning with `kind-` is not enough:
the guard also verifies the exact kubeconfig cluster and namespace, the API server from kind's own
kubeconfig, kind's local cluster/node inventory, the node's kind provider ID, and the ownership
marker. Any missing or ambiguous evidence prints `REFUSING…` and exits 1. The normal
`./context-check.sh` path never creates or changes anything.
</details>

> **⚠️ Why this guard matters.** The next step deliberately reads the node's filesystem. That's a
> teaching move in a cluster you'll throw away; it's a **security incident** on a shared cluster.
> The context check is the single safety rail that keeps the offensive step where it belongs.
> Never remove it, and never widen it to match a real cluster's context name.

---

### Step 1 — the permissive namespace (the door is open)

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

### Step 2 — the escape: read the node's filesystem from a Pod

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
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

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

### Step 3 — the fix: delete first, then let `restricted` reject the same Pod

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

### Step 4 — the hardened Pod the gate admits

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
escape Pod runs — so tear it down: Namespace delete is forbidden here; use
`kind delete cluster` (disposable) or remove the Namespace out-of-band.
</details>

> **⚠️ Why the stretch stays kind-only too.** `warn` **creates** the Pod — so this scratch namespace
> briefly runs a privileged, host-mounting Pod exactly like Step 2. That's fine in your disposable
> kind cluster and nowhere else. Delete the namespace when done, or just `kind delete cluster`.

## Expected state / output

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

Representative statuses include Ready/Running Pods, NetworkPolicy timeouts, RBAC Forbidden,
Helm revision history, Application Synced/Healthy, Certificate Ready, or Prometheus targets —
compare meaning, not ephemeral names.

## Explanation

Pod Security Admission evaluates CREATE/UPDATE, not existing Pods, so enforce
is not a runtime kill switch. The safe remediation order is delete the dangerous workload, then
rely on restricted to keep it from returning — which is why the lab is kind-only and disposable.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f <file> -n "$NS"` after fixing the
broken field, or delete only the labelled objects from Cleanup / reset and restart the guided
task. Prefer `kubectl describe` Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
./context-check.sh
kubectl get pod -n "$NS" -l app=s25
kubectl label --overwrite namespace "$NS" pod-security.kubernetes.io/enforce=restricted
kubectl get pod -n "$NS" -l app=s25   # still Running — admission does not evict
kubectl delete pod -n "$NS" -l app=s25
kubectl apply -f pod-escape.yaml      # expect REJECTED
kubectl apply -f pod-hardened.yaml    # expect admitted
```

### Expected state / output

The running escape Pod survives the label change. After delete, pod-escape.yaml is
rejected naming privileged/hostPath (and related) rules; pod-hardened.yaml is created and runs
without host mounts.

### Explanation

Pod Security Admission evaluates CREATE/UPDATE, not existing Pods, so enforce
is not a runtime kill switch. The safe remediation order is delete the dangerous workload, then
rely on restricted to keep it from returning — which is why the lab is kind-only and disposable.

### Hints

Stay inside the context-check.sh guard; use kubectl get pod -w around the label
change; compare the restricted violation list to privileged and hostPath.
