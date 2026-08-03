# Lab 26 — Best practices capstone (S26)

<!-- lab-contract:v1 -->

> **This is the course capstone.** You are handed one deliberately **flawed** manifest set and a
> **production-readiness checklist**. Audit the manifest against the checklist, fix every issue, and
> prove the result would be admitted by a `restricted` namespace. No new concepts — this ties
> together S02, S13, S14, S17, S18, S21, and S23.

| | |
| --- | --- |
| **Section** | S26 — Best practices (capstone) |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 40 min |

## Objective

Turn a flawed `web` Deployment into a production-ready one, **one checklist line per fix**. You will:

1. **Self-audit** the flawed manifest — list every issue *before* revealing the answer key (~10 problems).
2. **Fix each issue** — probes, resources, restricted `securityContext`, a PodDisruptionBudget, a
   digest pin, a NetworkPolicy, graceful shutdown, recommended labels, HA + topology spread.
3. **Validate** the fixed set with `kubectl apply --dry-run=server`, then confirm a `restricted`
   namespace **admits** the fixed Deployment.
4. **Classify** each fix as **availability**, **security**, or **cost** — and confirm the fixed
   manifests cover the whole checklist.

The whole lab turns on one idea: everything you learned this course is **one list you run against
every manifest** — and one un-hardened Deployment fails a dozen lines of it at once.

## Prerequisites

- A cluster where you can create a namespace and (for the restricted check) label it — a **kind**
  cluster or an assigned namespace on a shared cluster both work.
- `kubectl` configured. Pod Security Admission is **built into the API server** (stable since v1.25).
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1` — the workshop's demo image,
  distroless and non-root (UID **65532**), listening on **8080** (so it actually runs under
  `restricted`, unlike an image that ships as root).
- **No cluster-admin needed.** Everything is namespace-scoped.

## Files used

- `flawed-deployment.yaml` — the un-hardened `web` Deployment. Fails most of the checklist.
- `fixed-deployment.yaml` — the hardened Deployment (the answer).
- `fixed-pdb.yaml` — the PodDisruptionBudget (a separate object).
- `fixed-netpol.yaml` — the default-deny + allow NetworkPolicy (separate objects).
- `PRODUCTION-CHECKLIST.md` — the checklist you audit against, written to keep.

Everything is labelled `app.kubernetes.io/name: web` (and the flawed one `app: s26`) so cleanup is a
single selector.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./26-capstone.solution.md#guided-solutions)

### Step 0 — a namespace and the checklist you audit against

```bash
export NS=s26
kubectl create namespace "$NS"
kubectl config set-context --current --namespace="$NS"
```

Write the checklist to keep — this is the **repo artifact** from the slides.

```bash
cat > PRODUCTION-CHECKLIST.md <<'EOF'
# Production-readiness checklist

## Availability
- [ ] Probes: readiness (gate traffic), liveness (restart wedged), startup (slow boot)   [S14]
- [ ] Resources: requests (reserve) + limits (cap)                                        [S13]
- [ ] PodDisruptionBudget: keep minAvailable up through voluntary disruptions             [availability]
- [ ] Anti-affinity / topologySpreadConstraints: replicas across nodes                    [availability]
- [ ] Rollout strategy + revisionHistoryLimit                                             [S06]
- [ ] More than one replica                                                               [availability]

## Security
- [ ] Recommended labels: app.kubernetes.io/{name,instance,version,part-of,managed-by}    [hygiene]
- [ ] Immutable image digest (@sha256:…), not a movable tag                               [S02]
- [ ] Restricted securityContext: runAsNonRoot, no priv-esc, drop ALL, seccomp            [S17]
- [ ] NetworkPolicy: default-deny, then explicit allow                                    [S18]
- [ ] Config/secret hygiene: externalized, least privilege                                [S11/S12]

## Operations
- [ ] GitOps delivery: manifest in Git, agent reconciles                                  [S21]
- [ ] Observability: /metrics + a ServiceMonitor selecting by label                       [S23]
- [ ] Graceful shutdown: terminationGracePeriodSeconds + preStop                          [graceful shutdown]
- [ ] Cost: right-size requests to real usage                                             [cost]
EOF

cat PRODUCTION-CHECKLIST.md
```

**Task:** confirm the checklist is written — you'll tick these off as you fix the manifest.

---

### Step 1 — read the flawed manifest and audit it yourself

Write the flawed Deployment. **Read it before you read the answer key.**

```bash
cat > flawed-deployment.yaml <<'EOF'
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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
EOF

cat flawed-deployment.yaml
```

**Task:** audit this manifest against `PRODUCTION-CHECKLIST.md`. **Write down every issue you find**
before opening the spoiler. Aim for ten.

> **Why audit before revealing.** The professional skill this capstone builds is *reading a manifest
> against a checklist* — spotting the omissions. On the job nobody hands you an answer key; the
> checklist is the answer key. Do the audit cold, then compare.

**Question:** the flawed manifest **applies cleanly** with `kubectl apply` on a default namespace —
so why is it "wrong"?

---

### Step 2 — fix it: the hardened Deployment (one fix per issue)

Write the fixed Deployment. Every field below closes exactly one audit item.

```bash
cat > fixed-deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app.kubernetes.io/name: web            # ⑧ recommended labels (hygiene)
    app.kubernetes.io/instance: web
    app.kubernetes.io/version: "v1"
    app.kubernetes.io/part-of: workshop
    app.kubernetes.io/managed-by: argocd
spec:
  replicas: 3                              # ⑨ HA — more than one replica
  revisionHistoryLimit: 5                  # ⑩ trim old ReplicaSets
  strategy:                                # ⑩ controlled rollout
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: web
  template:
    metadata:
      labels:
        app.kubernetes.io/name: web        # matches PDB / topologySpread / NetworkPolicy selectors
        app.kubernetes.io/instance: web
        app.kubernetes.io/version: "v1"
        app.kubernetes.io/part-of: workshop
        app.kubernetes.io/managed-by: argocd
    spec:
      terminationGracePeriodSeconds: 30    # ⑦ graceful shutdown (grace window)
      securityContext:                     # ③ restricted — pod-level fields
        runAsNonRoot: true
        runAsUser: 65532                   # the image's built-in non-root UID (distroless nonroot)
        seccompProfile:
          type: RuntimeDefault
      topologySpreadConstraints:           # ⑨ spread replicas across nodes
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          # DoNotSchedule strands replicas on a single-node cluster (see note); use
          # ScheduleAnyway if you run this for real on 1-node kind
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: web
      containers:
        - name: web
          # ⑤ pin by digest — dummy value; RESOLVE at rehearsal (see the note below this block)
          image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
          ports:
            - containerPort: 8080
          resources:                       # ② requests + limits (right-sized, S13/cost)
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 128Mi }
          readinessProbe:                  # ① probes (S14) — the app's own endpoints
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
          securityContext:                 # ③ restricted — container-level fields
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          lifecycle:                        # ⑦ graceful shutdown — drain before SIGTERM
            preStop:
              sleep: { seconds: 5 }        # native sleep action — no shell in the image (distroless)
EOF

cat fixed-deployment.yaml
```

Now the two **sibling objects** — a PDB and a NetworkPolicy (⑤ ④ ⑥). They select the same
`app.kubernetes.io/name: web` label, which is why fixing the labels first mattered.

```bash
cat > fixed-pdb.yaml <<'EOF'
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
  labels:
    app.kubernetes.io/name: web
spec:
  minAvailable: 2                          # ④ keep ≥2 up through voluntary disruptions
  selector:
    matchLabels:
      app.kubernetes.io/name: web
EOF

cat > fixed-netpol.yaml <<'EOF'
# ⑥ default-deny ingress for the web Pods, then one explicit allow
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-default-deny
  labels:
    app.kubernetes.io/name: web
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: web
  policyTypes:
    - Ingress                              # no ingress rules → deny all inbound
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-ingress
  labels:
    app.kubernetes.io/name: web
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: workshop   # only in-app callers
      ports:
        - protocol: TCP
          port: 8080
EOF
```

**Task:** confirm each of the ten problems now has exactly one fix in the files above.

> **⚠️ Resolve the digest before you rely on it.** `@sha256:0000…0000` is a **dummy** digest —
> valid *syntax* (64 hex chars) but not a real image. A server-side dry-run (Step 3) runs **admission
> without pulling the image**, so the dummy still proves *restricted-compliance*. But a real
> `kubectl apply` will **`ImagePullBackOff`** until you swap in the real digest:
>
> ```bash
> # resolve the real digest for the tag, then edit the image line:
> crane digest ghcr.io/platformrelay/workshop-web:v1
> # or: docker buildx imagetools inspect ghcr.io/platformrelay/workshop-web:v1
> # → image: ghcr.io/platformrelay/workshop-web:v1@sha256:<the real digest>
> ```

> **⚠️ `topologySpreadConstraints` on a single-node cluster.** With `whenUnsatisfiable:
> DoNotSchedule` and `replicas: 3`, only **one** Pod schedules on a one-node kind cluster — the other
> two stay `Pending` (you can't spread three Pods across one node). That's correct, strict behaviour.
> If you run this for real on single-node kind and want all three up, switch to `ScheduleAnyway`
> (best-effort spread) or add worker nodes. The admission validation below is unaffected — it never
> schedules anything.

---

### Step 3 — validate: dry-run the set, then prove `restricted` admits the fixed Pod

First a **server-side dry-run** of the whole fixed set — this runs full admission (schema + policy)
**without** creating anything or pulling the image. It confirms the objects are well-formed.

```bash
kubectl apply --dry-run=server -f fixed-deployment.yaml -f fixed-pdb.yaml -f fixed-netpol.yaml
```

Now the restricted test — and here's a trap the capstone exists to teach. **PSA `enforce` gates
*Pods*, not workload objects.** Applying a *Deployment* under `enforce=restricted` is accepted; the
rejection happens later, when the ReplicaSet controller tries to create the *Pods* — which
`--dry-run=server` never runs. So to see admission reject the security violations directly, we submit
the **Pod template as a bare Pod**. (That's exactly why `enforce` alone isn't a full gate — more in
the question below.)

```bash
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted

# extract each Deployment's Pod template as a standalone Pod, dry-run it against enforce=restricted
# (only the securityContext-relevant fields matter for admission; the full spec is in the *-deployment.yaml)
cat > flawed-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: web }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
EOF

cat > fixed-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app.kubernetes.io/name: web }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
      ports:
        - containerPort: 8080
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
EOF

echo "== flawed Pod (expect REJECTED) =="
kubectl apply --dry-run=server -f flawed-pod.yaml

echo "== fixed Pod (expect ADMITTED) =="
kubectl apply --dry-run=server -f fixed-pod.yaml
```

**Task:** the flawed Pod is **rejected** for the four `restricted` violations; the fixed Pod is
**admitted**. Read both outputs.

> **⚠️ Why the bare Pod, and why it matters.** `enforce` mode evaluates **Pods**, not Deployments,
> ReplicaSets, or Jobs. Apply a violating *Deployment* under `enforce=restricted` and it's **created**
> — the block only surfaces when the ReplicaSet controller tries to spawn Pods, as a
> `FailedCreate` event, not an `apply` error. `--dry-run=server` doesn't run controllers, so it can
> never show that. We dry-run the Pod template directly to see the gate fire. The `warn`/`audit`
> modes *do* inspect the embedded template on the workload object (that's the Stretch) — but only
> `enforce` blocks, and only on Pods.

> **⚠️ Dry-run admits ≠ runs.** Admission checks YAML, not the image. The dummy digest
> (`@sha256:0000…0000`) satisfies admission, but a real `kubectl apply` of the fixed Deployment will
> be *admitted* and then **`ImagePullBackOff`** — resolve the digest first (Step 2 note). This lab was
> validated for **admission**; a full run-to-Running needs the real digest, a policy-enforcing CNI for
> the NetworkPolicy, and (for the 3-replica spread) a **multi-node** cluster — see the note in Step 2.

**Question:** you had to submit a bare **Pod** to see `enforce` reject the security fields. So does
`enforce=restricted` on the namespace make the fixed manifest production-ready?

---

### Step 4 — classify each fix: availability vs security vs cost

**Task:** sort the ten fixes into **availability**, **security**, and **cost**, and decide which
matter most for *this* workload (a stateless web front end).

---

### Step 5 — confirm full checklist coverage

**Task:** walk `PRODUCTION-CHECKLIST.md` line by line against the fixed manifests and tick every box.

## Observe

- **Valid ≠ ready.** The flawed Deployment applies cleanly and runs — yet fails a dozen checklist
  lines: BestEffort, no probes, default privileges, one replica, an unpinned tag, no isolation.
- **One fix per line.** Each of the ten problems maps to exactly one field or object; nothing bundled.
- **Selectors converge on one label.** The PDB, topology spread, and NetworkPolicy all select
  `app.kubernetes.io/name: web` — fixing labels first is what lets the rest bind.
- **`restricted` admits the fixed Deployment, rejects the flawed one** — the same four gates from S17,
  proven by `--dry-run=server` in an `enforce=restricted` namespace.
- **Admission is one line, not the checklist.** It enforces the security floor; labels, digest, PDB,
  NetworkPolicy, HA, and right-sizing are review discipline — so the checklist ships as a repo
  artifact and is gated in CI/GitOps.

## Challenge

A reviewer claims the flawed Deployment is "fine" because kubectl apply succeeds and
Pods become Ready. Prove valid≠ready: show restricted dry-run rejects the flawed Pod template
(or lists PSA violations) while the fixed set is admitted, and map at least three checklist
failures to availability versus security.

**Difficulty:** Advanced

**Success criteria:** Run server dry-run (or apply) of the flawed versus fixed manifests under
enforce=restricted, record the admission/error contrast, and classify three concrete checklist
gaps (for example probes, resources, securityContext) as availability or security with an
observable field path.

**Hints:** Use kubectl apply --dry-run=server -f flawed-deployment.yaml in a restricted
namespace; compare fixed-deployment.yaml; keep PRODUCTION-CHECKLIST.md open while you classify.

[Spoiler: challenge solution](./26-capstone.solution.md#challenge-solution)

## Verify

Confirm capstone evidence before cleanup.

```bash
kubectl get deploy,pdb,networkpolicy -n "$NS"
kubectl apply -f fixed-deployment.yaml --dry-run=server
```

Expected: fixed objects (or dry-run success) remain so checklist coverage can be re-audited.

## Cleanup / reset

```bash
# scoped cleanup — the fixed objects share app.kubernetes.io/name: web; the flawed one is app: s26
kubectl delete -f fixed-netpol.yaml -f fixed-pdb.yaml -f fixed-deployment.yaml --ignore-not-found
kubectl delete deployment -l app=s26 -n "$NS" --ignore-not-found
# panic reset (namespace): Namespace delete is forbidden in this workshop — remove it
# out-of-band via your cluster UI if you must; do not paste an unqualified ns delete here
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
rm -f flawed-deployment.yaml fixed-deployment.yaml fixed-pdb.yaml fixed-netpol.yaml \
  flawed-pod.yaml fixed-pod.yaml PRODUCTION-CHECKLIST.md
```

> **Panic reset.** Everything lived in the `s26` namespace. Namespace deletes are forbidden here —
> tear the disposable environment down with `kind delete cluster` (or your cluster UI). That
> removes the Deployment, PDB, NetworkPolicies, and any Pods in one shot.

## Stretch (optional) — make the checklist un-skippable

The slides' final point: turn checklist lines into **automated gates** so nobody skips them under a
deadline. Prove one gate with the tools you already have — `enforce=restricted` blocks the security
line at admission (you just saw it). For a second gate, try `warn` on a fresh namespace so a
non-compliant Deployment is **created but flagged**, mirroring a soft CI check.

```bash
kubectl create namespace s26-warn
kubectl label namespace s26-warn pod-security.kubernetes.io/warn=restricted
kubectl apply -n s26-warn -f flawed-deployment.yaml
kubectl get deploy web -n s26-warn
```

> **⚠️ The deeper stretch is the artifact, not the command.** Beyond admission, real gates are: a
> policy engine (require labels/resources/probes), a linter in CI, and a GitOps sync that only applies
> reviewed manifests (S21). The point of the capstone is that `PRODUCTION-CHECKLIST.md` becomes a set
> of enforced checks, not a document people mean to read. That's the habit to leave with.
