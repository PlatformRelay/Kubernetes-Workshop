# Lab 18 — NetworkPolicy (S18) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 0 — a cluster to fence

### kind path (do this)

```bash
kind create cluster --name netpol
export NS=default
kubectl get nodes
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get nodes
NAME                   STATUS   ROLES           AGE   VERSION
netpol-control-plane   Ready    control-plane   40s   v1.3x.x
```

A default kind cluster runs **kindnet**, which on current kind releases enforces NetworkPolicy
(via kube-network-policies). Step 2's self-test confirms this on *your* version — if it turns out
your CNI doesn't enforce, Step 2 has a Calico fallback.
</details>

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

<details><summary>Solution / expected output</summary>

```console
frontend → 200
other → 200
scanner → 200
```

No NetworkPolicy exists, so the network is **flat** — every Pod can reach the backend Pod's IP
(the Service just resolves the name to that IP). This is the Kubernetes default: **allow-all**.
`--max-time 5` matters from here on, so we use it throughout.
</details>

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

<details><summary>Solution / expected output</summary>

```console
frontend → 000 exit=28
other → 000 exit=28
scanner → 000 exit=28
```

`http_code` is `000` (no response) and curl exits **28** — *"Operation timed out"*. The
`default-deny` selects **every** Pod (`podSelector: {}`) for **Ingress** with **no** allow rules,
so all inbound connections are **dropped**. All three clients are cut. **This is the self-test: if
traffic actually broke, your CNI enforces.**
</details>

<details><summary>Self-test FAILED? (all three still return 200) — kind fallback</summary>

If every curl still returns `200` after applying the default-deny, your CNI is **not enforcing** —
the policy is a silent no-op. Rebuild kind with the default CNI disabled and install Calico:

```bash
kind delete cluster --name netpol
cat > kind-netpol.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: "192.168.0.0/16"     # Calico's default pod CIDR
EOF
kind create cluster --name netpol --config kind-netpol.yaml
# pin the current Calico release — verify the tag on the Calico releases page
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml
kubectl wait --for=condition=Ready nodes --all --timeout=180s
```

Then re-run Step 1 (redeploy `apps.yaml`) and Step 2. On a shared cluster you can't do this — use
the read-only path instead.
</details>

**Question:** curl **hung and timed out** (exit 28) instead of failing instantly. Why does a
NetworkPolicy drop look different from "connection refused"?

<details><summary>Answer</summary>

A NetworkPolicy drop **silently discards** the packet — the client gets *no* response, so it waits
until its own timeout (`--max-time`) gives up: exit **28**, "timed out". "Connection **refused**"
(curl exit 7) is different — that's the host actively returning a TCP RST because **nothing is
listening** on that port. Refused is fast and explicit; a policy drop is slow and silent. Debugging
rule of thumb: **hang/timeout → suspect a NetworkPolicy or firewall; refused → suspect the
app/port.**
</details>

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

<details><summary>Solution / expected output</summary>

```console
frontend → 200 exit=0
other → 000 exit=28
scanner → 000 exit=28
```

`allow-frontend-to-backend` selects the backend and permits ingress **from `app: frontend`** on
port 8080. Because policies are **additive**, the backend now allows the **union** of what any
policy permits — exactly the frontend gate. `other` and `scanner` were never allowed by anything,
so the still-present `default-deny` keeps dropping them.
</details>

**Question:** we never deleted `default-deny-ingress`. Why did adding one allow policy change the
`frontend` result but not `other`/`scanner`?

<details><summary>Answer</summary>

There is no "override" or precedence — the effective rule is the **union** of the allow rules from
*every* policy that selects a Pod. `allow-frontend-to-backend` adds one allowed source (`frontend`)
to the backend; nothing adds `other` or `scanner`, so they stay dropped by the default-deny. Delete
`allow-frontend-to-backend` and the backend has only the default-deny selecting it again → **all
three** are cut. Delete the default-deny **too** and the Pod is selected by nothing → back to
**allow-all**.
</details>

---

### Step 4 — observe: ingress ≠ egress (DNS still works)

The default-deny is `policyTypes: [Ingress]` — egress, including **DNS**, was never touched. The
proof is hiding in the exit code you already saw.

**Question:** in Step 2, the curls exited **28** (timed out), not **6** (*"Could not resolve
host"*). What does that tell you about DNS under our default-deny?

<details><summary>Answer / expected output</summary>

To *time out on connect*, curl first had to **resolve `backend` to an IP** — so DNS **worked**. A
blocked DNS path fails fast and differently:

```console
$ kubectl exec other -- curl -s --max-time 5 http://backend; echo "exit=$?"
curl: (6) Could not resolve host: backend
exit=6
```

You'd see exit **6** only if egress/DNS were blocked. We saw exit **28**, so name resolution
succeeded and only the *inbound* connection was dropped — exactly what an **ingress-only**
default-deny should do. This is why we deny **ingress only**: a default-deny **egress** without an
explicit DNS allow (UDP/TCP 53 to kube-dns) breaks name resolution for the whole namespace and
every app looks mysteriously broken (that's the stretch goal).
</details>

---

### Step 5 — observe: the allow rule is only a label match

`allow-frontend-to-backend` matches by the label `app: frontend`. Change the label and the match
evaporates — no policy edit needed.

```bash
kubectl label pod frontend app=stranger --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "frontend → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
```

<details><summary>Solution / expected output</summary>

```console
frontend → 000 exit=28
```

Same Pod, but it no longer carries `app: frontend`, so `allow-frontend-to-backend` stops selecting
it as a permitted source — the default-deny drops it like any other. Put the label back and it
works again:

```bash
kubectl label pod frontend app=frontend --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://backend   # → 200
```

**Selectors are labels** — NetworkPolicy allows by label selector, so a relabel (or a mislabel)
silently changes who may talk to whom. It's also the #1 real-world trap: a policy that "stopped
working" is often a Pod whose labels changed.
</details>

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

<details><summary>What broke, and the DNS allow that fixes it</summary>

```console
curl: (6) Could not resolve host: backend
 exit=6
```

Exit **6** now, not 28 — egress is denied, so the DNS query to kube-dns never leaves the Pod.
Re-allow DNS (UDP **and** TCP 53) to `kube-system`, and lookups work again (the connect still
times out at exit 28 unless you also allow egress to the backend):

```bash
cat > allow-dns-egress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
EOF
kubectl apply -f allow-dns-egress.yaml
```

Lesson: `policyTypes` are independent switches, and locking egress means you **own DNS** — always
pair a default-deny egress with an explicit DNS allow. Clean up the extra policies with
`kubectl delete networkpolicy -l app=s18` (or leave them — the Step-6 cleanup covers them).
</details>

## Expected state / output

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

Representative statuses include Ready/Running Pods, NetworkPolicy timeouts, RBAC Forbidden,
Helm revision history, Application Synced/Healthy, Certificate Ready, or Prometheus targets —
compare meaning, not ephemeral names.

## Explanation

NetworkPolicies are additive allows on top of isolation. Connectivity returns only
when some policy's podSelector and ingress.from selectors match the actual Pod labels, so a
relabel or typo removes the allow without changing the YAML filename. Timeout (not refused) is
the CNI drop signal that the fence is enforcing.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f <file> -n "$NS"` after fixing the
broken field, or delete only the labelled objects from Cleanup / reset and restart the guided
task. Prefer `kubectl describe` Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl get networkpolicy -n "$NS" -o wide
kubectl get pods -n "$NS" -l lab=s18 --show-labels
kubectl exec deploy/other -n "$NS" -- wget -qO- --timeout=3 http://backend:8080 || echo "exit=$?"
# restore frontend label match (example):
kubectl label pod -n "$NS" -l app=frontend --overwrite role=frontend
kubectl exec deploy/frontend -n "$NS" -- wget -qO- --timeout=3 http://backend:8080
```

### Expected state / output

Unmatched clients hang/time out (curl/wget exit 28). After the allow selector matches
again, frontend returns 200 while other/scanner remains timed out.

### Explanation

NetworkPolicies are additive allows on top of isolation. Connectivity returns only
when some policy's podSelector and ingress.from selectors match the actual Pod labels, so a
relabel or typo removes the allow without changing the YAML filename. Timeout (not refused) is
the CNI drop signal that the fence is enforcing.

### Hints

Use kubectl get networkpolicy and describe pods for lab=s18 labels; compare
podSelector.matchLabels on the allow rule with the client Pod labels before patching.
