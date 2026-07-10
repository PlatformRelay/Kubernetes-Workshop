# Lab 26 — Best practices capstone (S26)

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
- Internet pull access for `nginxinc/nginx-unprivileged:1.27` — a non-root nginx that runs as UID
  **101** and listens on **8080** (so it actually runs under `restricted`, unlike stock nginx).
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

## Step 0 — a namespace and the checklist you audit against

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl create namespace "$NS"
namespace/s26 created
```

The checklist has three groups — **availability**, **security**, **operations** — and each line
traces to the section that taught it. This is the deliverable from the section: a
`PRODUCTION-CHECKLIST.md` you commit next to your manifests and review every change against. For the
rest of the lab, each fix ticks one box.

</details>

---

## Step 1 — read the flawed manifest and audit it yourself

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
          image: nginxinc/nginx-unprivileged:latest
          ports:
            - containerPort: 8080
EOF

cat flawed-deployment.yaml
```

**Task:** audit this manifest against `PRODUCTION-CHECKLIST.md`. **Write down every issue you find**
before opening the spoiler. Aim for ten.

<details><summary>Answer key — the planted problems (~10)</summary>

Each problem maps to a checklist line and the section that taught it. Eight are **inside** the
Deployment; two are **missing sibling objects**.

| # | Problem | Fix | Traces to |
| --- | --- | --- | --- |
| 1 | **No liveness/readiness/startup probes** | add all three (`httpGet` on `/`, port 8080) | S14 |
| 2 | **No resource requests/limits** (BestEffort — first evicted) | add `requests` + `limits` | S13 |
| 3 | **No `securityContext`** (runs default user, full caps, no seccomp) | `runAsNonRoot` + `runAsUser: 101` + `seccompProfile` + `allowPrivilegeEscalation: false` + `drop: [ALL]` | S17 |
| 4 | **No PodDisruptionBudget** — a drain can take it to zero | add a PDB, `minAvailable: 2` | availability |
| 5 | **Mutable image tag** (`:latest`) — running bytes can drift | pin by digest `@sha256:…` | S02 |
| 6 | **No NetworkPolicy** — flat network, a foothold roams | default-deny + one allow | S18 |
| 7 | **No graceful shutdown** — dropped connections on rollout | `terminationGracePeriodSeconds` + `preStop` | graceful shutdown |
| 8 | **Missing recommended labels** (only ad-hoc `app: web`) | add `app.kubernetes.io/*` | hygiene |
| 9 | **`replicas: 1`** — no HA, and unspread | `replicas: 3` + `topologySpreadConstraints` | availability |
| 10 | **No rollout strategy / `revisionHistoryLimit`** — dead ReplicaSets pile up, uncontrolled surge | `RollingUpdate` (`maxUnavailable: 0`) + `revisionHistoryLimit` | S06 / cost |

Bonus line you can't see in YAML but belongs on the checklist: **config/secret hygiene** (S11/S12) —
this Pod has no config, but a real one keeps config in a `ConfigMap`/`Secret`, never baked in — and
**observability** (S23): expose `/metrics` and a `ServiceMonitor`. We note them; the fix below covers
the ten manifest-visible problems.

</details>

> **Why audit before revealing.** The professional skill this capstone builds is *reading a manifest
> against a checklist* — spotting the omissions. On the job nobody hands you an answer key; the
> checklist is the answer key. Do the audit cold, then compare.

**Question:** the flawed manifest **applies cleanly** with `kubectl apply` on a default namespace —
so why is it "wrong"?

<details><summary>Answer</summary>

Because **valid YAML and a running Pod are not the same as production-ready.** `kubectl apply`
accepts it and a Pod comes up `Running` — but `Running` only means the process started (S14), the Pod
is BestEffort and first-evicted (S13), it runs with default privileges (S17), a single node failure
is a full outage (one replica, no spread, no PDB), the image can change under you (`:latest`), and
nothing isolates it on the network (S18). The checklist exists precisely because the API server's bar
("is this valid?") is far below the production bar ("will this stay up, resist compromise, and be
operable?"). The next steps close that gap.

</details>

---

## Step 2 — fix it: the hardened Deployment (one fix per issue)

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
    app.kubernetes.io/version: "1.27"
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
        app.kubernetes.io/version: "1.27"
        app.kubernetes.io/part-of: workshop
        app.kubernetes.io/managed-by: argocd
    spec:
      terminationGracePeriodSeconds: 30    # ⑦ graceful shutdown (grace window)
      securityContext:                     # ③ restricted — pod-level fields
        runAsNonRoot: true
        runAsUser: 101                     # the image's built-in non-root UID
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
          image: nginxinc/nginx-unprivileged:1.27@sha256:0000000000000000000000000000000000000000000000000000000000000000
          ports:
            - containerPort: 8080
          resources:                       # ② requests + limits (right-sized, S13/cost)
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 128Mi }
          readinessProbe:                  # ① probes (S14)
            httpGet: { path: /, port: 8080 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 10
          startupProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
          securityContext:                 # ③ restricted — container-level fields
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          lifecycle:                        # ⑦ graceful shutdown — drain before SIGTERM
            preStop:
              exec: { command: ["sh", "-c", "sleep 5"] }
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

<details><summary>Solution — problem → fix map</summary>

```text
① probes .............. readinessProbe + livenessProbe + startupProbe (port 8080)   [fixed-deployment.yaml]
② resources ........... resources.requests + resources.limits                       [fixed-deployment.yaml]
③ securityContext ..... pod: runAsNonRoot/runAsUser:101/seccomp ·
                        container: allowPrivilegeEscalation:false/drop ALL           [fixed-deployment.yaml]
④ PDB ................. minAvailable: 2                                              [fixed-pdb.yaml]
⑤ digest .............. image ...@sha256:0000…0000 (dummy → resolve at rehearsal)   [fixed-deployment.yaml]
⑥ NetworkPolicy ....... default-deny + allow (podSelector on our label)             [fixed-netpol.yaml]
⑦ graceful shutdown ... terminationGracePeriodSeconds: 30 + preStop sleep 5         [fixed-deployment.yaml]
⑧ labels .............. app.kubernetes.io/{name,instance,version,part-of,managed-by} [fixed-deployment.yaml]
⑨ HA + spread ......... replicas: 3 + topologySpreadConstraints                     [fixed-deployment.yaml]
⑩ rollout ............. strategy RollingUpdate(maxUnavailable:0) + revisionHistoryLimit [fixed-deployment.yaml]
```

**One fix per issue** — nothing bundled, nothing missed. Note the pod/container **split** on ③: the
`restricted` fields that are valid at pod scope (`runAsNonRoot`, `runAsUser`, `seccompProfile`) sit on
`spec.template.spec.securityContext`; the container-only fields (`allowPrivilegeEscalation`,
`capabilities.drop`) sit on the container. And note every sibling selector keys off the **same**
`app.kubernetes.io/name: web` label — the PDB, the topology spread, and the NetworkPolicy all target
it, which is why the labels fix (⑧) is a prerequisite for the others to bind.

</details>

> **⚠️ Resolve the digest before you rely on it.** `@sha256:0000…0000` is a **dummy** digest —
> valid *syntax* (64 hex chars) but not a real image. A server-side dry-run (Step 3) runs **admission
> without pulling the image**, so the dummy still proves *restricted-compliance*. But a real
> `kubectl apply` will **`ImagePullBackOff`** until you swap in the real digest:
>
> ```bash
> # resolve the real digest for the tag, then edit the image line:
> crane digest nginxinc/nginx-unprivileged:1.27
> # or: docker buildx imagetools inspect nginxinc/nginx-unprivileged:1.27
> # → image: nginxinc/nginx-unprivileged:1.27@sha256:<the real digest>
> ```

> **⚠️ `topologySpreadConstraints` on a single-node cluster.** With `whenUnsatisfiable:
> DoNotSchedule` and `replicas: 3`, only **one** Pod schedules on a one-node kind cluster — the other
> two stay `Pending` (you can't spread three Pods across one node). That's correct, strict behaviour.
> If you run this for real on single-node kind and want all three up, switch to `ScheduleAnyway`
> (best-effort spread) or add worker nodes. The admission validation below is unaffected — it never
> schedules anything.

---

## Step 3 — validate: dry-run the set, then prove `restricted` admits the fixed Pod

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
      image: nginxinc/nginx-unprivileged:latest
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
    runAsUser: 101
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: web
      image: nginxinc/nginx-unprivileged:1.27@sha256:0000000000000000000000000000000000000000000000000000000000000000
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

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply --dry-run=server -f fixed-deployment.yaml -f fixed-pdb.yaml -f fixed-netpol.yaml
deployment.apps/web created (server dry run)
poddisruptionbudget.policy/web created (server dry run)
networkpolicy.networking.k8s.io/web-default-deny created (server dry run)
networkpolicy.networking.k8s.io/web-allow-ingress created (server dry run)

== flawed Pod (expect REJECTED) ==
$ kubectl apply --dry-run=server -f flawed-pod.yaml
Error from server (Forbidden): error when creating "flawed-pod.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "web" must set
securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "web" must set
securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "web" must set
securityContext.runAsNonRoot=true), seccompProfile (pod or container "web" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

== fixed Pod (expect ADMITTED) ==
$ kubectl apply --dry-run=server -f fixed-pod.yaml
pod/web created (server dry run)
```

The **flawed** Pod trips **all four** `restricted` fields — the exact same four gates from S17. The
**fixed** Pod sets all four (split pod/container) and is **admitted**. `--dry-run=server` ran the real
admission controllers, so `created (server dry run)` means *this would be accepted* — but nothing was
actually created. Same namespace, same `enforce=restricted` label; only the manifest changed. (You
can also confirm the **Deployment** path: apply the flawed Deployment for real under
`enforce=restricted` and `kubectl describe rs` shows `FailedCreate … pods "web-…" is forbidden …` —
the Deployment exists, its Pods don't.)

</details>

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

<details><summary>Answer</summary>

**No — on two counts.** First, `enforce` only gates **Pods**, and it only checks the **four**
`securityContext` fields; a Deployment with `replicas: 1`, no probes, `:latest`, and no NetworkPolicy
sails through as long as its Pod template's `securityContext` is correct. Second, admission is a
*single line* of the checklist — the security floor — enforced **for** you. It does not know or care
whether you pinned a digest, added the recommended labels, wrote a PodDisruptionBudget, set
probes/resources, or applied a NetworkPolicy. Those are **review discipline** — which is exactly why
you commit `PRODUCTION-CHECKLIST.md` and gate it in CI/GitOps (S21), rather than trusting the API
server to catch everything.

</details>

---

## Step 4 — classify each fix: availability vs security vs cost

**Task:** sort the ten fixes into **availability**, **security**, and **cost**, and decide which
matter most for *this* workload (a stateless web front end).

<details><summary>Answer</summary>

| Fix | Category | Why |
| --- | --- | --- |
| Probes (①) | **Availability** | readiness keeps traffic off unready Pods; liveness self-heals |
| Resources — requests (②) | **Availability** + **Cost** | requests schedule *and* reserve (cost); a limit prevents a noisy neighbour |
| PDB (④) | **Availability** | keeps ≥2 up through drains/upgrades |
| Rollout + `revisionHistoryLimit` (⑩) | **Availability** + **Cost** | `maxUnavailable:0` = no capacity dip; history limit trims dead RSs (cost) |
| Replicas + spread (⑨) | **Availability** | survive a node failure |
| Labels (⑧) | **Security**/hygiene | selectors, dashboards, GitOps rely on them |
| Digest pin (⑤) | **Security** | provenance — the running bytes are the scanned bytes |
| `securityContext` (③) | **Security** | least privilege; shrinks blast radius |
| NetworkPolicy (⑥) | **Security** | contains a foothold on a flat network |
| Graceful shutdown (⑦) | **Availability** | zero dropped connections on rollout/scale-down |

**Most important for *this* workload** — a **stateless, replicated, internet-facing web front end**:
the **availability** set carries the most weight day-to-day (probes, >1 replica + spread, PDB,
graceful shutdown) because the failure you'll actually hit is a rollout or a node drain, not a
targeted attacker. But the **security floor** (`securityContext` — ③) is non-negotiable and *free*:
it's the one line `restricted` admission will reject you for, and it costs nothing to set. **Cost**
matters least here only because the workload is tiny — right-sizing requests (②) is where it bites at
scale. A different workload (a database, a batch job, a Pod handling secrets) would reweight this
table — which is the point: the checklist is universal, the **priorities are per-workload**.

</details>

---

## Step 5 — confirm full checklist coverage

**Task:** walk `PRODUCTION-CHECKLIST.md` line by line against the fixed manifests and tick every box.

<details><summary>Solution — coverage map</summary>

```text
AVAILABILITY
[x] Probes ....................... readiness + liveness + startup on :8080     (①)
[x] Resources .................... requests + limits                          (②)
[x] PDB .......................... fixed-pdb.yaml, minAvailable: 2            (④)
[x] Anti-affinity/spread ......... topologySpreadConstraints (hostname)      (⑨)
[x] Rollout + revisionHistory .... RollingUpdate maxUnavailable:0 + limit:5  (⑩)
[x] >1 replica ................... replicas: 3                               (⑨)

SECURITY
[x] Recommended labels ........... app.kubernetes.io/{name,…}                (⑧)
[x] Image digest ................. @sha256:… (placeholder → resolve)         (⑤)
[x] Restricted securityContext ... 4 fields, pod+container split            (③)
[x] NetworkPolicy ................ default-deny + allow                      (⑥)
[~] Config/secret hygiene ........ N/A here — no config; keep it externalized in real apps [S11/S12]

OPERATIONS
[~] GitOps ....................... managed-by: argocd label declares intent; wire the Application  [S21]
[~] Observability ................ add /metrics + a ServiceMonitor selecting app.kubernetes.io/name: web [S23]
[x] Graceful shutdown ............ terminationGracePeriodSeconds + preStop   (⑦)
[x] Cost ......................... right-sized requests (50m/64Mi)           (②)
```

**All ten manifest-visible problems are fixed.** The `[~]` lines are checklist items this minimal
workload doesn't exercise in-manifest but that a real service must address: config/secret hygiene
(S11/S12), the GitOps `Application` that reconciles this repo (S21 — the `managed-by: argocd` label
declares the intent), and a `ServiceMonitor` for observability (S23). The capstone manifest is
production-ready for its scope, and the checklist names exactly what's left for a fuller service.

</details>

## Expected observations

- **Valid ≠ ready.** The flawed Deployment applies cleanly and runs — yet fails a dozen checklist
  lines: BestEffort, no probes, default privileges, one replica, `:latest`, no isolation.
- **One fix per line.** Each of the ten problems maps to exactly one field or object; nothing bundled.
- **Selectors converge on one label.** The PDB, topology spread, and NetworkPolicy all select
  `app.kubernetes.io/name: web` — fixing labels first is what lets the rest bind.
- **`restricted` admits the fixed Deployment, rejects the flawed one** — the same four gates from S17,
  proven by `--dry-run=server` in an `enforce=restricted` namespace.
- **Admission is one line, not the checklist.** It enforces the security floor; labels, digest, PDB,
  NetworkPolicy, HA, and right-sizing are review discipline — so the checklist ships as a repo
  artifact and is gated in CI/GitOps.

## Cleanup / panic reset

```bash
# scoped cleanup — the fixed objects share app.kubernetes.io/name: web; the flawed one is app: s26
kubectl delete -f fixed-netpol.yaml -f fixed-pdb.yaml -f fixed-deployment.yaml --ignore-not-found
kubectl delete deployment -l app=s26 -n "$NS" --ignore-not-found
kubectl delete namespace "$NS" --ignore-not-found
rm -f flawed-deployment.yaml fixed-deployment.yaml fixed-pdb.yaml fixed-netpol.yaml \
  flawed-pod.yaml fixed-pod.yaml PRODUCTION-CHECKLIST.md
```

> **Panic reset.** Everything lived in the `s26` namespace — `kubectl delete namespace s26` removes
> the Deployment, PDB, NetworkPolicies, and any Pods in one shot. On kind you can also
> `kind delete cluster` to burn it all down.

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

<details><summary>What you're looking at</summary>

```console
$ kubectl apply -n s26-warn -f flawed-deployment.yaml
Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false, ...
runAsNonRoot != true, seccompProfile (...)
deployment.apps/web created

$ kubectl get deploy web -n s26-warn
NAME   READY   UP-TO-DATE   AVAILABLE   AGE
web    1/1     1            1           5s
```

Under **`warn`**, the API server returns the violation list as a **`Warning:`** but **creates** the
Deployment — and note it inspects the embedded Pod **template** here (unlike `enforce`, which only
gates the Pods themselves). It runs to `1/1`: the flawed Deployment uses `:latest` (which pulls) and
has no probes, so the Pod is Ready the moment it starts — a security-flagged workload happily serving
traffic is exactly the situation `warn` is meant to surface without breaking anyone. That's discovery,
not a block — like a non-blocking CI check that annotates a PR. The real migration play is
`warn`/`audit` first (find offenders), fix them, **then** `enforce`. Clean up: `kubectl delete
namespace s26-warn`.

</details>

> **⚠️ The deeper stretch is the artifact, not the command.** Beyond admission, real gates are: a
> policy engine (require labels/resources/probes), a linter in CI, and a GitOps sync that only applies
> reviewed manifests (S21). The point of the capstone is that `PRODUCTION-CHECKLIST.md` becomes a set
> of enforced checks, not a document people mean to read. That's the habit to leave with.
