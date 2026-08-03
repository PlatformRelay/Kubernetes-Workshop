# Lab 18 — NetworkPolicy (S18)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S18 — NetworkPolicy |
| **Environment** | **kind ✓** (with an enforcement self-test) / namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Take a **flat pod network** where everything reaches everything, fence off a `backend` with a
**`default-deny` ingress** policy, and re-open exactly one gate with an **additive
`allow-frontend-to-backend`** rule. Along the way you'll see the two facts that trip everyone up:
a dropped packet **hangs and times out** (it is *not* "connection refused"), and a default-deny
*ingress* policy leaves **egress and DNS untouched**.

The whole lab turns on one idea: **NetworkPolicy only ever *allows*.** "Deny" is what a Pod gets
when a policy *selects* it and no allow rule matches.

> **⚠️ A policy is inert unless a policy-capable CNI enforces it.** `kubectl apply` stores a
> NetworkPolicy on **any** cluster with no error — but whether a packet is actually dropped is up
> to the CNI. So **Step 2 is an enforcement self-test**: apply a default-deny and confirm traffic
> really breaks *before* you trust any result. Enforcing CNIs include Calico, Cilium, Antrea, and
> modern **kindnet**; some managed/basic CNIs don't. If your default-deny changes nothing, your
> CNI isn't enforcing — use the kind fallback in Step 2 or the read-only path.

## Prerequisites

- **kind path (recommended):** Docker + `kind` + `kubectl`, and rights to create a local cluster.
  You'll make a throwaway cluster named `netpol`.
- **Shared-cluster path:** your assigned namespace — **read-only** here (you can inspect a
  pre-applied policy but not stand up an enforcing CNI). Prefer kind if you can.
- Internet pull access for `curlimages/curl` and `ghcr.io/platformrelay/workshop-web:v1`.

## Files used

- `apps.yaml` — `backend` (Deployment + Service on 8080) and three clients: `frontend`, `other`,
  `scanner`.
- `default-deny-ingress.yaml` — selects every Pod, denies all ingress.
- `allow-frontend-to-backend.yaml` — re-opens `frontend → backend:8080` only (the slide's
  magic-move final frame, byte-for-byte).

Apps carry the label `lab: s18`; the NetworkPolicies carry `app: s18` (matching the slides). Both
are cleaned up by selector at the end.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./18-networkpolicy.solution.md#guided-solutions)

### Step 0 — a cluster to fence

### kind path (do this)

```bash
kind create cluster --name netpol
export NS=default
kubectl get nodes
```

### Shared-cluster path (read-only)

You can't stand up an enforcing CNI on a shared cluster, and an unenforced policy silently does
nothing. So here you **only read** a policy your facilitator pre-applied:

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl get networkpolicy
kubectl describe networkpolicy default-deny-ingress   # if one is provided
```

Read the `PodSelector`, `PolicyTypes`, and `Allowing ingress traffic` blocks in the describe
output, then follow the rest by reading the manifests and spoilers — the *objects* are identical;
only enforcement differs.

---

### Step 1 — the flat network: everyone reaches the backend

```bash
cat > apps.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels: { app: backend, lab: s18 }
spec:
  replicas: 1
  selector: { matchLabels: { app: backend } }
  template:
    metadata:
      labels: { app: backend, lab: s18 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  labels: { lab: s18 }
spec:
  selector: { app: backend }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Pod
metadata: { name: frontend, labels: { app: frontend, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: other, labels: { app: other, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: scanner, labels: { app: scanner, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
EOF

kubectl apply -f apps.yaml
kubectl wait --for=condition=Ready pod/frontend pod/other pod/scanner --timeout=90s
kubectl rollout status deploy/backend
```

**Task:** from **all three** clients, curl the backend Service. All should return `200`.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}\n" --max-time 5 http://backend
done
```

---

### Step 2 — break (and self-test): `default-deny` fences the backend

```bash
cat > default-deny-ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}            # selects every Pod in the namespace
  policyTypes:
    - Ingress                # govern ingress; with no rules below → deny all
EOF

kubectl apply -f default-deny-ingress.yaml
```

**Task:** re-run all three curls. They now **hang** until `--max-time` fires. Capture the exit
code — it's the tell, and it's your enforcement self-test.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

**Question:** curl **hung and timed out** (exit 28) instead of failing instantly. Why does a
NetworkPolicy drop look different from "connection refused"?

---

### Step 3 — fix: open one gate with an additive allow

The `default-deny` **stays**. We **add** a policy that permits `frontend → backend:8080`.
NetworkPolicies are **unioned** — this doesn't replace the deny, it stacks one allowed gate on top.

```bash
cat > allow-frontend-to-backend.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend           # this policy governs the backend Pods
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # …only from Pods labelled app=frontend
      ports:
        - protocol: TCP
          port: 8080
EOF

kubectl apply -f allow-frontend-to-backend.yaml
```

**Task:** re-run all three curls. `frontend` gets `200`; `other` and `scanner` still time out.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

**Question:** we never deleted `default-deny-ingress`. Why did adding one allow policy change the
`frontend` result but not `other`/`scanner`?

---

### Step 4 — observe: ingress ≠ egress (DNS still works)

The default-deny is `policyTypes: [Ingress]` — egress, including **DNS**, was never touched. The
proof is hiding in the exit code you already saw.

**Question:** in Step 2, the curls exited **28** (timed out), not **6** (*"Could not resolve
host"*). What does that tell you about DNS under our default-deny?

---

### Step 5 — observe: the allow rule is only a label match

`allow-frontend-to-backend` matches by the label `app: frontend`. Change the label and the match
evaporates — no policy edit needed.

```bash
kubectl label pod frontend app=stranger --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "frontend → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
```

## Observe

- **Default is flat/allow-all:** with no policy, every Pod reaches every Pod. Isolation is opt-in.
- A **`default-deny` ingress** = `podSelector: {}` + `policyTypes: [Ingress]` + no rules → all
  inbound dropped. Dropped traffic **hangs and times out** (curl exit **28**), it is **not**
  "refused" (exit 7). That break *is* the enforcement self-test.
- Policies are **additive/allow-only:** `allow-frontend-to-backend` opens exactly one gate;
  `other`/`scanner` stay cut because nothing allows them. Deny = the absence of an allow.
- **Ingress ≠ egress:** the ingress default-deny left **DNS/egress working** (exit 28, not 6).
- **Selectors are labels:** relabeling `frontend` breaks the allow match with no policy change.
- **Only a policy-capable CNI enforces any of this** — the same objects on a non-enforcing CNI
  apply cleanly and do nothing.

## Challenge

After default-deny ingress, frontend can reach backend but a third Pod labelled like
frontend still times out. Diagnose whether the allow rule matches Pod labels versus namespace
selectors, then restore connectivity for the intended client without opening the fence to everyone.

**Difficulty:** Intermediate

**Success criteria:** Prove the blocked client fails with a timeout (not connection refused), identify the
label mismatch on the allow NetworkPolicy or Pod, restore a matching allow, and show only the
intended client returns HTTP 200 while an unmatched client still times out.

**Hints:** Use kubectl get networkpolicy and describe pods for lab=s18 labels; compare
podSelector.matchLabels on the allow rule with the client Pod labels before patching.

[Spoiler: challenge solution](./18-networkpolicy.solution.md#challenge-solution)

## Verify

Confirm NetworkPolicy evidence before cleanup.

```bash
kubectl get networkpolicy,deploy,svc,pods -n "$NS" -l 'lab=s18'
kubectl get networkpolicy -n "$NS" -l app=s18
```

Expected: default-deny and allow policies still exist so you can re-run a client wget timeout
versus 200 check if needed.

## Cleanup / reset

```bash
# scoped cleanup — policies are labelled app=s18, apps are labelled lab=s18
kubectl delete networkpolicy -l app=s18 -n "$NS" --ignore-not-found
kubectl delete deploy,svc,pod -l lab=s18 -n "$NS" --ignore-not-found
rm -f apps.yaml default-deny-ingress.yaml allow-frontend-to-backend.yaml kind-netpol.yaml

# panic reset (kind): throw the whole cluster away
# kind delete cluster --name netpol
```

> On the **kind** path the fastest reset is `kind delete cluster --name netpol` — the cluster was
> disposable. On the **shared** path you created nothing (read-only), so there's nothing to clean.

## Stretch (optional) — lock egress too, and re-allow DNS

A default-deny **egress** is the classic self-inflicted outage: block outbound and you also block
**DNS**, so every name lookup fails. Prove it, then fix it the right way.

```bash
cat > default-deny-egress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Egress
EOF
kubectl apply -f default-deny-egress.yaml

# now DNS breaks — resolution fails fast (exit 6), not a timeout
kubectl exec frontend -- curl -s --max-time 5 http://backend; echo " exit=$?"
```
