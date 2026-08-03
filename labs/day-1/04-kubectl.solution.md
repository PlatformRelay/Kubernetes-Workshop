# Lab 04 — kubectl (S04) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

### Step 1 — the scavenger hunt (discover, don't create)

Answer each question using **only** `get`, `describe`, and `explain`. Every question has
a spoiler — try first, then check.

**Q1.** What is the **default** `restartPolicy` for a Pod?

<details><summary>Answer</summary>

```console
$ kubectl explain pod.spec.restartPolicy
KIND:       Pod
VERSION:    v1
FIELD: restartPolicy <string>
DESCRIPTION:
    ... One of Always, OnFailure, Never. Default to Always.
```

**`Always`.** The schema is the authority — no need to guess or search.
</details>

**Q2.** Your namespace looks empty (`kubectl get all` says so). But list ConfigMaps —
there's already one. What is it, and who created it?

<details><summary>Answer</summary>

```console
$ kubectl get configmap
NAME               DATA   AGE
kube-root-ca.crt   1      3h
```

`kube-root-ca.crt` is injected into **every** namespace by the cluster (it holds the
CA bundle Pods use to trust the API server). You didn't create it — a controller did.
`kubectl get all` doesn't show ConfigMaps, which is why the namespace *looked* empty.
</details>

**Q3.** Is a `Deployment` in the same API group as a `Pod`? Use `api-resources`.

<details><summary>Answer</summary>

```console
$ kubectl api-resources | grep -E '^(pods|deployments) '
pods           po       v1        true    Pod
deployments    deploy   apps/v1   true    Deployment
```

No — a **Pod** is core `v1`; a **Deployment** is `apps/v1`. That's why a Deployment
manifest needs `apiVersion: apps/v1` but a Pod uses `apiVersion: v1`. You'll type both
in S05/S06.
</details>

**Q4.** According to the schema, is `containers` **required** in a Pod spec?

<details><summary>Answer</summary>

```console
$ kubectl explain pod.spec.containers | head -3
KIND:       Pod
VERSION:    v1
FIELD: containers <[]Container> -required-
```

Yes — `-required-`. A Pod with no containers is invalid. The server would reject it;
`explain` tells you before you even try.
</details>

---

### Step 2 — generate YAML without applying it

The fastest way to a correct manifest is to have `kubectl` write it for you, then edit.
`--dry-run=client` builds the object **locally** and prints it — nothing is created.

```bash
kubectl run web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
```

**Task:** run both. Confirm you get a full manifest on stdout and that
`kubectl get pods` / `kubectl get deploy` still show **nothing** — you created nothing.

<details><summary>Solution / expected output</summary>

```console
$ kubectl run web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: web
  name: web
spec:
  containers:
    - image: ghcr.io/platformrelay/workshop-web:v1
      name: web
      resources: {}
  ...
status: {}

$ kubectl get pods
No resources found in student-07 namespace.
```

`run` scaffolds a **Pod**; `create deployment` scaffolds a **Deployment** (note the
`apps/v1`, `replicas`, `selector`, and `template` wrapper — the S06 shape). Redirect to
a file to keep it: `kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml`.
</details>

**Question:** why do the printed manifests include empty `resources: {}` and
`status: {}` you never asked for?

<details><summary>Answer</summary>

`kubectl` prints the **whole typed object**, including zero-valued fields. `status: {}`
is the observed half (empty because nothing is running yet — see S03). You can delete
the noise (`creationTimestamp`, `status`, empty `resources`) before saving; it's just a
starting point, not a finished manifest.
</details>

---

### Step 3 — pull exact values with jsonpath and labels

Tables are for eyes; `-o jsonpath` is for extracting one value (scripts, quick checks).

```bash
# one node's name, no grep/awk:
kubectl get nodes -o jsonpath='{.items[0].metadata.name}{"\n"}'

# filter by label — the kube-system Pods carry component/tier labels (kind):
kubectl get pods -n kube-system -l tier=control-plane
```

**Task:** get a single node name with `jsonpath`. Then, on **kind**, list the
control-plane Pods with a label selector. On a **shared** cluster (no `kube-system`
access), filter your own namespace instead — e.g. `kubectl get configmap -l foo=bar`
(expect an empty list, proving the filter works).

> **Shared cluster:** `get nodes` is cluster-scoped and may return
> `Error ... "nodes" is forbidden` for your namespace-scoped role (same as Lab 03).
> If so, practise `jsonpath` on a namespaced object you *can* read instead:
> `kubectl get configmap kube-root-ca.crt -o jsonpath='{.metadata.name}{"\n"}'`.

<details><summary>Solution / expected output</summary>

```console
$ kubectl get nodes -o jsonpath='{.items[0].metadata.name}{"\n"}'
workshop-control-plane

$ kubectl get pods -n kube-system -l tier=control-plane
NAME                                    READY   STATUS    RESTARTS   AGE
etcd-workshop-control-plane             1/1     Running   0          3h
kube-apiserver-workshop-control-plane   1/1     Running   0          3h
kube-controller-manager-...             1/1     Running   0          3h
kube-scheduler-workshop-control-plane   1/1     Running   0          3h
```

`{.items[0].metadata.name}` walks the same object tree `explain` describes. The `-l`
selector is the *same query language* a Service uses to find its Pods (S07).
`{"\n"}` just adds a newline so your prompt lands on the next line.
</details>

**Question:** how is `-l app=web` different from grepping `kubectl get pods | grep web`?

<details><summary>Answer</summary>

`-l app=web` is evaluated **server-side** against the object's `labels` — precise, and
it matches nothing by accident. `grep web` is a **text** match on the printed table, so
it also catches a Pod named `webhook-xyz` or an unrelated column containing "web". Labels
are a real query; grep is a coincidence.
</details>

---

### Step 4 — break it on purpose: client says yes, server says no

`--dry-run=client` only renders locally. `--dry-run=server` runs the **full** server
path (validation + admission) and can reject things the client can't see. Prove it with
the cleanest example: a namespace that doesn't exist.

```bash
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=client -o yaml >/dev/null; echo "client exit: $?"
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=server -o yaml >/dev/null; echo "server exit: $?"
```

**Task:** run both. The **client** line must succeed; the **server** line must fail.
Read the server error — its exact text depends on your environment.

<details><summary>Solution / expected output</summary>

```console
$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=client -o yaml >/dev/null; echo "client exit: $?"
client exit: 0

$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=server -o yaml >/dev/null; echo "server exit: $?"
# kind (you own the cluster):
Error from server (NotFound): namespaces "no-such-namespace" not found
# shared cluster (namespace-scoped role):
Error from server (Forbidden): pods is forbidden: User "..." cannot create
resource "pods" in ... the namespace "no-such-namespace"
server exit: 1
```

The **result is identical** — client passes (`0`), server fails (`1`) — but the
**message differs**, and that difference is itself the lesson:

- On **kind**, the request clears authorization and is rejected later, at admission,
  for the missing namespace → `NotFound`.
- On a **shared** cluster, authorization runs **first** and your role can't write to
  `no-such-namespace` at all → `Forbidden`, before the namespace check is even reached.

Either way, the point holds: **`--dry-run=server` evaluated the request against live
cluster state — identity, permissions, existence — and the client never could.** Two
very different questions:

- `--dry-run=client` → *"does this render into a valid-looking object?"*
- `--dry-run=server` → *"would the cluster actually accept this from me, right now?"*

**Fix:** target your real namespace — now both pass:

```console
$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 -n "$NS" --dry-run=server -o yaml >/dev/null; echo "exit: $?"
exit: 0
```

</details>

**Question:** you're about to `apply` an important manifest. Which dry-run do you run
first, and why?

<details><summary>Answer</summary>

**`--dry-run=server`** — it's the only one that runs schema validation, defaulting, and
admission (quota, webhooks, missing references) *without* writing. `--dry-run=client`
can't catch anything that depends on live cluster state. Pair it with `kubectl diff -f`
to see exactly what would change before you commit.
</details>

---

## Expected state / output

- `explain` answers schema questions (defaults, required fields, API group)
  authoritatively — no web search needed.
- `--dry-run=client -o yaml` generates a full manifest and creates **nothing**.
- `-o jsonpath` extracts a single value; `-l` filters server-side by label.
- The **same** manifest can pass `--dry-run=client` and fail `--dry-run=server` — server
  dry-run is the one that tells you the cluster would really accept it.
- After this lab, `kubectl get all` in your namespace is still empty.

---

## Explanation

Client dry-run renders locally; server dry-run exercises API validation and admission
without persistence. JSONPath and label selectors query structured API data directly, and
`kubectl diff` previews the server-rendered delta without applying it.

## Troubleshooting and recovery

If server dry-run is Forbidden, use the namespace-scoped command from
Step 4 and show the error to the facilitator. Delete only local `web.yaml` if it was saved;
the lab intentionally creates no cluster object.

## Challenge solution

### Commands / manifest

```bash
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml
kubectl diff -f web.yaml || test $? -eq 1
sed -i.bak 's/replicas: 1/replicas: 3/' web.yaml && rm -f web.yaml.bak
kubectl diff -f web.yaml || test $? -eq 1
kubectl get deployment web --ignore-not-found
rm -f web.yaml
```

### Expected state / output

Both diff commands show additions for a not-yet-created Deployment, and the second shows
`replicas: 3`. The final `get` prints nothing, proving that no object was persisted.

### Explanation

`kubectl diff` asks the API server to render the proposed object but does not write it. Exit code 1
means differences exist, so the guard treats that expected diagnostic result as success.

### Hints

`kubectl diff` exits 1 when differences exist; inspect its output, then verify with
`kubectl get deployment web --ignore-not-found`.
