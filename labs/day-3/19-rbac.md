# Lab 19 — RBAC (S19)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S19 — RBAC |
| **Environment** | **namespace ✓ / kind ✓** (both paths identical for the Role work) |
| **Estimated time** | 25 min |

## Objective

Give a workload an **identity** and exactly the permissions it needs — no more. You'll create a
**ServiceAccount**, a read-only **Role** (`get`/`list`/`watch` on pods), and a **RoleBinding**
that joins them, then prove the grant with `kubectl auth can-i`. You'll run real commands **as
the ServiceAccount**: reading Pods succeeds, **deleting** one is **Forbidden** — the deliberate
break — and adding a single verb to the Role flips the answer.

The whole lab turns on one idea: **RBAC is deny-by-default and allow-only.** A subject can do
something only because a Role lists the verb *and* a binding ties that Role to the subject.

> **A note on `--as`.** Impersonation (`kubectl … --as=…`) is itself a privileged action — the
> **caller** needs the cluster-wide `impersonate` verb. On **kind** you're cluster-admin, so it
> just works. On a **shared cluster** where you only hold your namespace, `--as` may return
> *"cannot impersonate"* — ask your facilitator to grant impersonation for the lab, or verify the
> Role from **inside a Pod** using the SA token (the stretch goal). Creating the Role, SA, and
> RoleBinding needs **no** cluster-admin — RBAC is namespaced, so both paths are identical for
> everything except the `--as` checks.

## Prerequisites

- **kind path:** Docker + `kind` + `kubectl`, and rights to create a local cluster. You'll make a
  throwaway cluster named `rbac`.
- **Shared-cluster path:** your assigned namespace. Creating the SA/Role/RoleBinding works
  as-is; `--as` checks need impersonation rights (see the note above).
- Internet pull access for `ghcr.io/platformrelay/workshop-web:v1` (a Pod to read).

## Files used

- `workload.yaml` — a tiny `reader-target` Deployment, so `get`/`list`/`delete pods` have real
  Pods to act on.
- `rbac.yaml` — the **ServiceAccount + Role + RoleBinding** (the slide's magic-move final frame,
  byte-for-byte).

Everything carries the label `app: s19` so cleanup is a single scoped delete.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./19-rbac.solution.md#guided-solutions)

### Step 0 — a namespace to work in

### kind path

```bash
kind create cluster --name rbac
export NS=default
kubectl get nodes
```

### Shared-cluster path

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl auth can-i create rolebindings          # should print: yes
```

---

### Step 1 — a Pod to read, and the identity + Role + binding

First, something to read:

```bash
cat > workload.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reader-target
  labels: { app: s19 }
spec:
  replicas: 1
  selector: { matchLabels: { app: reader-target } }
  template:
    metadata:
      labels: { app: reader-target, part-of: s19 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
EOF

kubectl apply -f workload.yaml
kubectl rollout status deploy/reader-target
```

Now the RBAC objects — the **ServiceAccount**, the read-only **Role**, and the **RoleBinding**
that joins them. This is the exact manifest from the slide's magic-move final frame:

```bash
cat > rbac.yaml <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = the core API group (pods live here)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # read-only: no create/delete
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF

kubectl apply -f rbac.yaml
```

---

### Step 2 — verify the grant with `can-i --list`

```bash
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

**Task:** confirm the SA may read Pods (`get`/`list`/`watch`) and cannot write them.

---

### Step 3 — run real commands as the SA (and hit the break)

Point `kubectl` at the SA with `--as` and act on the real Pod from Step 1.

```bash
# read — allowed
kubectl get pods --as=system:serviceaccount:$NS:pod-reader-sa

# capture a real Pod name to act on
POD=$(kubectl get pod -l app=reader-target -o jsonpath='{.items[0].metadata.name}')

# write — the deliberate break
kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
```

**Task:** `get pods` should list the `reader-target` Pod; `delete pod` should be **Forbidden**.

**Question:** you asked to `delete` a Pod that **exists** and are cluster-admin yourself — why did
the command fail?

---

### Step 4 — fix: add the `delete` verb and re-check

The break is a missing verb, so the fix is one line in the **Role**. Add `delete`, re-apply, and
re-run `can-i`.

```bash
kubectl patch role pod-reader --type='json' \
  -p='[{"op":"add","path":"/rules/0/verbs/-","value":"delete"}]'

# re-verify — now allowed
kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
```

**Task:** `can-i delete pods` should now print `yes`, and the real delete should succeed.

**Question:** you changed only the **Role** — not the RoleBinding, not the ServiceAccount. Why was
that enough?

---

### Step 5 — question: when do you need a ClusterRole instead?

You built a **Role** + **RoleBinding**, entirely inside one namespace. That's the right default.

**Question:** when would a `Role` be the wrong choice — forcing a `ClusterRole` (and possibly a
`ClusterRoleBinding`) instead?

## Observe

- **Deny by default:** a fresh ServiceAccount can do nothing; a permission exists only because a
  **Role lists the verb** *and* a **RoleBinding** ties that Role to the subject.
- **The binding is the join:** the Role and the SA are inert alone; the RoleBinding's `roleRef` +
  `subjects` connect them. Editing the **Role** changes access live — no rebind, no restart.
- **`get pods --as=…` → allowed; `delete pod --as=…` → `Forbidden`** until the Role gains the
  `delete` verb. The error names the subject, verb, resource, API group `""`, and namespace.
- **`--as` tests another identity** without becoming it — your own rights authorize the
  impersonation, but the impersonated SA's Role decides the answer.
- **Scope:** `Role`/`RoleBinding` are namespaced; cluster-scoped resources or cross-namespace
  reuse need a `ClusterRole`.

## Challenge

An app ServiceAccount can get Pods but still cannot delete them, and adding verbs to a
Role that is not bound changes nothing. Diagnose Role versus RoleBinding, then grant delete
least-privilege and prove Forbidden becomes allowed for that subject only.

**Difficulty:** Intermediate

**Success criteria:** Show kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa flips from
no to yes after the Role lists delete and the RoleBinding still references that Role, and
demonstrate a get still works while an unbound verb remains Forbidden.

**Hints:** Inspect roleRef and subjects on the RoleBinding; edit the Role verbs and re-run
can-i --list --as=... without recreating the ServiceAccount.

[Spoiler: challenge solution](./19-rbac.solution.md#challenge-solution)

## Verify

Confirm RBAC evidence before cleanup.

```bash
kubectl get sa,role,rolebinding,deploy -n "$NS" -l app=s19
kubectl auth can-i list pods -n "$NS" --as="system:serviceaccount:$NS:pod-reader-sa"
```

Expected: the Role/RoleBinding still grant the verbs you verified with can-i --as.

## Cleanup / reset

```bash
# scoped cleanup — everything is labelled app=s19
kubectl delete sa,role,rolebinding -l app=s19 -n "$NS" --ignore-not-found
kubectl delete deploy -l app=s19 -n "$NS" --ignore-not-found
rm -f workload.yaml rbac.yaml

# panic reset (kind): throw the whole cluster away
# kind delete cluster --name rbac
```

> On the **kind** path the fastest reset is `kind delete cluster --name rbac` — the cluster was
> disposable. On a **shared** cluster the scoped `delete -l app=s19` removes everything you made.

## Stretch (optional) — hit the API from *inside* a Pod, as the SA

`--as` impersonates from the outside. The real thing is a Pod running **as** the SA, using its
**projected token** to call the API — exactly how Argo CD (S21) and operators (S22) work.

```bash
# a Pod that runs as pod-reader-sa
cat > reader-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: api-reader
  labels: { app: s19 }
spec:
  serviceAccountName: pod-reader-sa
  containers:
    - name: shell
      image: curlimages/curl:8.10.1
      command: ["sleep", "3600"]
EOF
kubectl apply -f reader-pod.yaml
kubectl wait --for=condition=Ready pod/api-reader --timeout=60s

# from inside: read the projected token and call the API to LIST pods
kubectl exec api-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  curl -sk -o /dev/null -w "list pods → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://kubernetes.default.svc/api/v1/namespaces/$NS/pods
'
```
