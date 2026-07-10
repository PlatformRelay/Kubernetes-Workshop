# Lab 19 — RBAC (S19)

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
- Internet pull access for `nginxinc/nginx-unprivileged:1.27` (a Pod to read).

## Files used

- `workload.yaml` — a tiny `reader-target` Deployment, so `get`/`list`/`delete pods` have real
  Pods to act on.
- `rbac.yaml` — the **ServiceAccount + Role + RoleBinding** (the slide's magic-move final frame,
  byte-for-byte).

Everything carries the label `app: s19` so cleanup is a single scoped delete.

---

## Step 0 — a namespace to work in

### kind path

```bash
kind create cluster --name rbac
export NS=default
kubectl get nodes
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get nodes
NAME                 STATUS   ROLES           AGE   VERSION
rbac-control-plane   Ready    control-plane   40s   v1.3x.x
```

On kind you're **cluster-admin**, so the `--as` impersonation checks in Steps 2–4 work with no
extra setup.
</details>

### Shared-cluster path

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl auth can-i create rolebindings          # should print: yes
```

<details><summary>Solution / expected output</summary>

```console
yes
```

If that prints `yes`, you can create the SA/Role/RoleBinding in your namespace. The `--as` checks
later may still be denied if you lack impersonation — that's expected; use the stretch goal's
in-Pod path to verify if so.
</details>

---

## Step 1 — a Pod to read, and the identity + Role + binding

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
          image: nginxinc/nginx-unprivileged:1.27
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

<details><summary>Solution / expected output</summary>

```console
role.rbac.authorization.k8s.io/pod-reader created
serviceaccount/pod-reader-sa created
rolebinding.rbac.authorization.k8s.io/pod-reader-binding created
```

Three objects, one file. The **Role** is a pure allow-list (`get`/`list`/`watch` on `pods`), the
**ServiceAccount** is the identity, and the **RoleBinding** is the join — its `roleRef` names the
Role and its `subjects` names the SA. Note `apiGroups: [""]` (the empty string) is the **core**
API group where Pods live — not the literal text `"core"`.
</details>

---

## Step 2 — verify the grant with `can-i --list`

```bash
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

**Task:** confirm the SA may read Pods (`get`/`list`/`watch`) and cannot write them.

<details><summary>Solution / expected output</summary>

```console
Resources          Non-Resource URLs   Resource Names   Verbs
pods               []                  []               [get list watch]
selfsubjectreviews.authorization.k8s.io   []   []   [create]
selfsubjectaccessreviews.authorization.k8s.io   []   []   [create]
...
```

The teaching row is **`pods … [get list watch]`** — exactly the Role you granted. The
`selfsubject*` rows are **baseline** permissions every identity gets (they let a subject ask "what
can I do?"); they don't grant access to your workloads. There is **no** `create`/`delete`/`update`
on `pods`, so writes are denied — which the next step proves against a real Pod.

> If `--as` returns `Error … cannot impersonate resource "serviceaccounts"`, your account lacks
> the `impersonate` verb (common on a shared namespace). Skip to the stretch goal to verify from
> inside a Pod, or ask your facilitator to grant impersonation.
</details>

---

## Step 3 — run real commands as the SA (and hit the break)

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods --as=system:serviceaccount:$NS:pod-reader-sa
NAME                             READY   STATUS    RESTARTS   AGE
reader-target-6c9d8f7b5c-abcde   1/1     Running   0          40s

$ kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
Error from server (Forbidden): pods "reader-target-6c9d8f7b5c-abcde" is forbidden: User "system:serviceaccount:default:pod-reader-sa" cannot delete resource "pods" in API group "" in the namespace "default"
```

`get` matched the Role's `list` verb → allowed. `delete` matched **no** rule → the API server
returns **`Forbidden`**: *"cannot delete resource pods in API group … in the namespace …"*.
(Authorization is checked **before** the object is even looked up, so the same error fires for any
Pod name.) `In API group ""` is the core group again. This is RBAC's deny-by-default doing its
job — the Role never granted a write verb.
</details>

**Question:** you asked to `delete` a Pod that **exists** and are cluster-admin yourself — why did
the command fail?

<details><summary>Answer</summary>

Because `--as` made the request run **as the ServiceAccount**, not as you. The API server
authorizes the **impersonated** subject, and `pod-reader-sa`'s Role allows only
`get`/`list`/`watch`. Your own cluster-admin rights let you *impersonate*, but they don't leak
into the impersonated identity's permissions — that's the entire point of `--as`: it lets you test
**another** identity's effective access safely.
</details>

---

## Step 4 — fix: add the `delete` verb and re-check

The break is a missing verb, so the fix is one line in the **Role**. Add `delete`, re-apply, and
re-run `can-i`.

```bash
kubectl patch role pod-reader --type='json' \
  -p='[{"op":"add","path":"/rules/0/verbs/-","value":"delete"}]'

# re-verify — now allowed
kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
```

**Task:** `can-i delete pods` should now print `yes`, and the real delete should succeed.

<details><summary>Solution / expected output</summary>

```console
$ kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
yes

$ POD=$(kubectl get pod -l app=reader-target -o jsonpath='{.items[0].metadata.name}')
$ kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
pod "reader-target-6c9d8f7b5c-abcde" deleted
```

Adding `delete` to the Role's `verbs` immediately widens the SA's permissions — **no rebind, no
Pod restart**. RBAC is evaluated live on every request, so the moment the Role changes, `can-i`
flips and the action goes through. (The Deployment simply starts a replacement Pod, since its
desired replica count is unchanged.) You could equally have used `kubectl edit role pod-reader` and
added `delete` to the `verbs` list by hand.
</details>

**Question:** you changed only the **Role** — not the RoleBinding, not the ServiceAccount. Why was
that enough?

<details><summary>Answer</summary>

The RoleBinding is a **reference**, not a copy — it ties the *subject* to the *Role by name*. The
SA's effective permissions are always whatever the referenced Role currently lists, evaluated at
request time. So editing the Role's `verbs` changes what every subject bound to it can do,
instantly. The binding wires the two together; the Role holds the actual grant.
</details>

---

## Step 5 — question: when do you need a ClusterRole instead?

You built a **Role** + **RoleBinding**, entirely inside one namespace. That's the right default.

**Question:** when would a `Role` be the wrong choice — forcing a `ClusterRole` (and possibly a
`ClusterRoleBinding`) instead?

<details><summary>Answer</summary>

A `Role` can only grant access to **namespaced** resources, **within its own namespace**. Reach
for a `ClusterRole` when:

- **The resource is cluster-scoped.** `nodes`, `namespaces`, `persistentvolumes`,
  `storageclasses`, and non-resource URLs like `/healthz` live **outside** any namespace, so a
  namespaced Role literally cannot name them. Only a ClusterRole can — and to grant it you bind
  with a **ClusterRoleBinding**.
- **You want one definition reused across many namespaces.** Define the rules once as a
  `ClusterRole`, then reference it from a `RoleBinding` **in each namespace** — the grant stays
  namespaced (only that namespace's resources), but you maintain a single Role definition. This is
  the common "read-only" pattern.

Rule of thumb: **namespaced access to namespaced resources → Role + RoleBinding.** Anything
cluster-scoped, or shared across namespaces → **ClusterRole** (bound namespaced *or* cluster-wide
as needed). Least privilege still applies: prefer the narrowest scope that works.
</details>

## Expected observations

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

## Cleanup / panic reset

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

<details><summary>What you should see, and why</summary>

```console
list pods → 200
```

The kubelet projected the SA's token at
`/var/run/secrets/kubernetes.io/serviceaccount/` (plus its `namespace`). The Pod presents it as a
Bearer token; the API server authenticates it as `system:serviceaccount:$NS:pod-reader-sa` and
authorizes against the **same Role** — `list pods` is allowed, so **`200`**. Now probe a resource
the Role **never** grants, to prove the boundary holds from inside too:

```bash
kubectl exec api-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  curl -sk -o /dev/null -w "list secrets → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://kubernetes.default.svc/api/v1/namespaces/$NS/secrets
'
```

This returns **`403`** (Forbidden) — the Role only ever covered `pods`, so **any** verb on
`secrets` is denied, no matter what you did in Step 4. Same deny-by-default, now enforced against
a real in-cluster client instead of `--as`. This is the identity every workload uses: no `--as`,
no cluster-admin, just the projected token and its Role. Clean up with the **Cleanup** section
below (the Pod is labelled `app: s19`), or `kubectl delete pod api-reader`.
</details>
