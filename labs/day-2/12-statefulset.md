# Lab 12 — StatefulSet (S12)

| | |
| --- | --- |
| **Section** | S12 — StatefulSet |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin; a default StorageClass is assumed)* |
| **Estimated time** | 30 min |

## Objective

Run a workload that **can't be treated as interchangeable**. You will apply a **headless
Service** and a **3-replica StatefulSet** with `volumeClaimTemplates`, and watch the three
guarantees a Deployment can't give you: Pods created **in order** with **stable ordinal
names** (`web-0`, `web-1`, `web-2`), a **per-Pod PVC** minted for each ordinal, and a
**stable per-Pod DNS name** for peer discovery. You will write a sentinel into `web-1`,
delete it, and prove it returns with the **same name** re-bound to the **same PVC** and the
**same data** — then break the `serviceName` wiring and watch peer DNS go dark.

> **Set your namespace once.** Everything runs in your assigned namespace (or a kind
> cluster). Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–07 concepts (Pod, Deployment, Service) and Lab 11 (PVC/StorageClass). This lab
  **creates its own** objects, so it does not depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights and
  no add-ons — kind ships a default `standard` StorageClass (the `local-path` provisioner)
  that supplies one PV per ordinal; shared clusters have a default StorageClass provided.
- A cluster DNS add-on (CoreDNS) — present on every conformant cluster and in kind. Peer DNS
  is the whole point of a headless Service.

## Files used

- `headless-svc.yaml` — the headless Service `web` (`clusterIP: None`) that owns per-Pod DNS.
- `statefulset.yaml` — the 3-replica StatefulSet with `serviceName: web` and
  `volumeClaimTemplates` (one PVC per ordinal).
- `statefulset-bad-servicename.yaml` — the same StatefulSet pointing `serviceName` at a
  Service that doesn't exist, for the break→fix.

Everything is labelled `app: s12` so cleanup is a single label selector.

---

## Step 0 — apply the headless Service

A **headless** Service (`clusterIP: None`) doesn't hand out one virtual IP and load-balance.
Instead, cluster DNS returns a record **per Pod** — that's what gives each StatefulSet Pod a
stable address its peers can dial.

```bash
cat > headless-svc.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: s12
spec:
  clusterIP: None                 # headless — per-Pod DNS, no single virtual IP
  selector:
    app: s12
  ports:
    - port: 80
      name: http
EOF

kubectl apply -f headless-svc.yaml
kubectl get svc web
```

**Task:** confirm the Service is headless (no cluster IP).

<details><summary>Solution / expected output</summary>

```console
$ kubectl get svc web
NAME   TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   None         <none>        80/TCP    3s
```

`CLUSTER-IP: None` is the headless marker. A normal Service would show a virtual IP here and
DNS would resolve the Service name to that one IP. Headless means DNS instead returns the
**set of Pod IPs**, and — crucially for a StatefulSet — a stable **per-Pod** name.
</details>

---

## Step 1 — apply the StatefulSet and watch ordered creation

```bash
cat > statefulset.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  labels:
    app: s12
spec:
  serviceName: web                # MUST match the headless Service name (per-Pod DNS)
  replicas: 3
  selector:
    matchLabels:
      app: s12
  template:
    metadata:
      labels:
        app: s12
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
  volumeClaimTemplates:           # a PVC STENCIL — one minted per ordinal
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
EOF

kubectl apply -f statefulset.yaml

# watch the ordered rollout — Ctrl-C once all three are Running
kubectl get pods -l app=s12 -w
```

**Task:** in what order do the Pods appear, and what are their names?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pods -l app=s12 -w
NAME    READY   STATUS              RESTARTS   AGE
web-0   0/1     ContainerCreating   0          1s
web-0   1/1     Running             0          6s
web-1   0/1     Pending             0          0s
web-1   1/1     Running             0          8s
web-2   0/1     Pending             0          0s
web-2   1/1     Running             0          7s
```

Names are **stable ordinals** — `web-0`, `web-1`, `web-2` — not the random
`web-<hash>-<hash>` a Deployment produces. They come up **strictly in order**: the
StatefulSet controller waits for `web-0` to be Ready before it creates `web-1`
(`podManagementPolicy: OrderedReady`, the default). (Note: on kind's
`WaitForFirstConsumer` StorageClass each ordinal's PVC binds as that Pod schedules — the
same behaviour you saw in Lab 11.)
</details>

**Question:** you set `replicas: 3` but never wrote three PVCs. Where did the storage come
from?

<details><summary>Answer</summary>

From `volumeClaimTemplates`. It's a **stencil**, not a volume: the controller stamps out one
PVC **per ordinal**, named `<template>-<statefulset>-<ordinal>` → `data-web-0`,
`data-web-1`, `data-web-2`. Each is dynamically provisioned by the default StorageClass
exactly like the Lab 11 PVC — the only new idea is **one per Pod**, and it stays glued to
that ordinal across restarts.
</details>

---

## Step 2 — confirm one PVC per ordinal

```bash
kubectl get pvc -l app=s12
```

**Task:** how many PVCs exist, and how are they named?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pvc -l app=s12
NAME         STATUS   VOLUME             CAPACITY   ACCESS MODES   STORAGECLASS   AGE
data-web-0   Bound    pvc-a1b2...-1111   1Gi        RWO            standard       40s
data-web-1   Bound    pvc-c3d4...-2222   1Gi        RWO            standard       32s
data-web-2   Bound    pvc-e5f6...-3333   1Gi        RWO            standard       24s
```

**Three** PVCs — one per ordinal, `data-web-<n>`. Each is bound to its own PV. This is the
difference from a Deployment mounting a single PVC: there, every replica shares one claim;
here, every Pod owns its own.

> **Note the label.** These PVCs carry `app: s12` because `volumeClaimTemplates` copies the
> template's `metadata.labels` (we set `app: s12` on the StatefulSet's `metadata`, and the
> minted PVCs inherit the StatefulSet's labels). If `kubectl get pvc -l app=s12` comes back
> empty on your cluster, drop the selector: `kubectl get pvc`.
</details>

---

## Step 3 — write a sentinel into `web-1`

Give one specific ordinal some data we can recognise later.

```bash
kubectl exec web-1 -- sh -c 'echo "written by $(hostname)" > /usr/share/nginx/html/data.txt'
kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
written by web-1
```

The file lives on `data-web-1` (web-1's own PVC), not on the Pod's writable layer. We wrote
the Pod's own hostname so that after a delete/recreate we can prove the **same** volume came
back — the content will still say `web-1`, written by the original Pod.
</details>

---

## Step 4 — delete `web-1`; prove identity **and** data survive

This is the heart of the section.

```bash
# delete just the middle ordinal; the StatefulSet immediately recreates it
kubectl delete pod web-1
kubectl get pods -l app=s12 -w        # Ctrl-C once web-1 is Running again

# read the sentinel from the REPLACEMENT web-1
kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
```

**Task:** what name does the replacement Pod get, and is the sentinel still there?

<details><summary>Solution / expected output</summary>

```console
$ kubectl delete pod web-1
pod "web-1" deleted
$ kubectl get pods -l app=s12
NAME    READY   STATUS    RESTARTS   AGE
web-0   1/1     Running   0          5m
web-1   1/1     Running   0          12s     # <-- same NAME, a fresh Pod underneath
web-2   1/1     Running   0          5m
$ kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
written by web-1
```

The replacement is **still `web-1`** (not a new random name) and it re-bound the **same**
`data-web-1` PVC, so the sentinel — written by the *original* `web-1` — is intact. Identity
and data both survived the delete.
</details>

**Question:** why did `web-1` reattach its old data, when a Deployment Pod would have come
back empty?

<details><summary>Answer</summary>

Two StatefulSet guarantees combine. **Stable identity:** the controller always recreates the
missing ordinal with the *same* name (`web-1`), never a random suffix. **Sticky storage:**
each ordinal is permanently associated with its own PVC (`data-web-1`), so the replacement
Pod re-binds that exact claim. A Deployment gives neither — a replacement Pod gets a new
random name and, sharing one PVC (or an `emptyDir`), no per-instance memory.
</details>

---

## Step 5 — see stable per-Pod DNS

The headless Service publishes a DNS name for **each** Pod:
`<pod>.<serviceName>.<namespace>.svc.cluster.local`. Peers use these to find each other.
Look one up from another Pod.

```bash
# resolve web-1's per-Pod name from a temporary Pod (any Pod counts as "a peer")
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"
```

**Task:** does `web-1.web.<ns>.svc.cluster.local` resolve to an IP?

<details><summary>Solution / expected output</summary>

```console
$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:      web-1.web.<ns>.svc.cluster.local
Address:   10.244.1.7
```

It resolves to `web-1`'s Pod IP. The name is built from the Pod's `hostname` (`web-1`, set by
the StatefulSet) and its `subdomain` (`web`, set from `serviceName`) — and it resolves **only
because a headless Service named `web` exists** to publish the record. That is exactly the
wiring Step 6 breaks. (If `nslookup` returns before the Pod has an address, give the rollout
a few seconds and retry.)
</details>

---

## Step 6 — break→fix: a `serviceName` pointing at nothing

The `serviceName` must name a real headless Service or per-Pod DNS silently never works — the
Pods run fine, so nothing looks wrong until peers fail to connect. Two twists make this
realistic: `serviceName` is **immutable**, and a broken StatefulSet still schedules Pods.

```bash
cat > statefulset-bad-servicename.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  labels:
    app: s12
spec:
  serviceName: web-nope           # <-- no headless Service by this name exists
  replicas: 3
  selector:
    matchLabels:
      app: s12
  template:
    metadata:
      labels:
        app: s12
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
EOF

# first try to apply it over the running StatefulSet
kubectl apply -f statefulset-bad-servicename.yaml
```

**Task:** the apply is **rejected**. Why — and what does that tell you about `serviceName`?

<details><summary>Solution / expected output</summary>

```console
$ kubectl apply -f statefulset-bad-servicename.yaml
The StatefulSet "web" is invalid: spec: Forbidden: updates to statefulset spec for fields
other than 'replicas', 'ordinals', 'template', 'updateStrategy',
'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden
```

`serviceName` (like `selector` and `volumeClaimTemplates`) is **immutable** — you can't edit
it on a live StatefulSet, exactly as `storageClassName` was immutable on the Lab 11 PVC. To
change it you must **delete and recreate**. Because the PVCs are independent objects, the
data survives the recreate — which we'll confirm.

</details>

**Task:** now actually create the broken version (delete + recreate), then test peer DNS.

```bash
# delete the StatefulSet — its PVCs (data-web-0/1/2) are NOT deleted, so data is safe
kubectl delete statefulset web
kubectl apply -f statefulset-bad-servicename.yaml
kubectl rollout status statefulset/web        # Pods come up despite the bad serviceName

# the Pods run — but does per-Pod DNS resolve?
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl rollout status statefulset/web
statefulset rolling update complete 3 pods at revision ...

$ kubectl get pods -l app=s12
NAME    READY   STATUS    RESTARTS   AGE
web-0   1/1     Running   0          20s
web-1   1/1     Running   0          14s
web-2   1/1     Running   0          8s

$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
** server can't find web-1.web.<ns>.svc.cluster.local: NXDOMAIN
pod "dnstest" deleted
```

The Pods are **Running** — a bad `serviceName` doesn't stop them scheduling — but their
`subdomain` is now `web-nope`, so no per-Pod record is published under `web` (nor under
`web-nope`, since no Service by that name exists). `web-1.web…` returns **NXDOMAIN**. This is
the trap: everything looks healthy in `get pods`, yet peer discovery is silently dead.
</details>

**Task:** fix it — recreate the StatefulSet with the correct `serviceName`, and confirm DNS
returns **and** the data is still there.

```bash
kubectl delete statefulset web
kubectl apply -f statefulset.yaml               # the good manifest, serviceName: web
kubectl rollout status statefulset/web

# DNS resolves again...
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"

# ...and the sentinel from Step 3 survived TWO delete/recreate cycles
kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
Name:      web-1.web.<ns>.svc.cluster.local
Address:   10.244.1.9

$ kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt
written by web-1
```

With `serviceName: web` matching the existing headless Service, the per-Pod record is
published again and resolves. And notice: `data.txt` still reads `written by web-1` even
though we deleted and recreated the **entire StatefulSet twice**. The PVCs
(`data-web-0/1/2`) are separate objects with their own lifecycle — deleting the StatefulSet
never touched them.
</details>

## Expected observations

- A **headless** Service (`clusterIP: None`) is the prerequisite for per-Pod DNS.
- StatefulSet Pods have **stable ordinal names** (`web-0/1/2`) and are created **in order**
  (`web-0` Ready before `web-1` starts).
- `volumeClaimTemplates` mints **one PVC per ordinal** (`data-web-<n>`), each dynamically
  provisioned and **sticky** to its Pod.
- Deleting a Pod recreates it with the **same name** re-bound to the **same PVC** — identity
  and data both survive.
- Each Pod is addressable at `<pod>.<serviceName>.<ns>.svc.cluster.local`, and this resolves
  **only** while a headless Service named `serviceName` exists.
- `serviceName` (and `selector`, `volumeClaimTemplates`) are **immutable** — changing them
  means delete + recreate; the PVCs (and data) survive because they are separate objects.

## Cleanup / panic reset

```bash
# scoped cleanup — everything this lab made is labelled app=s12
kubectl delete statefulset web --ignore-not-found -n "$NS"
kubectl delete svc web --ignore-not-found -n "$NS"

# IMPORTANT: PVCs from volumeClaimTemplates are NOT auto-deleted — remove them explicitly,
# or they (and their PVs) linger and keep costing storage.
kubectl delete pvc -l app=s12 -n "$NS" --ignore-not-found
# if the label selector came back empty in Step 2, delete by name instead:
# kubectl delete pvc data-web-0 data-web-1 data-web-2 -n "$NS" --ignore-not-found

rm -f headless-svc.yaml statefulset.yaml statefulset-bad-servicename.yaml

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete statefulset,svc,pod,pvc --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

> **Why cleanup deletes PVCs by hand:** unlike a Deployment, a StatefulSet deliberately keeps
> its `volumeClaimTemplates` PVCs when you delete it or scale it down — losing a database's
> disk on a `kubectl delete` would be catastrophic. The modern opt-in to automate this is
> `spec.persistentVolumeClaimRetentionPolicy` (`whenDeleted` / `whenScaled`: `Retain` or
> `Delete`); until you set it, clean up claims yourself.

## Stretch (optional) — scale down and back up

Prove the sticky-storage guarantee against a scale-down/up cycle.

```bash
kubectl scale statefulset web --replicas=1        # removes web-2 then web-1 (reverse order)
kubectl get pods -l app=s12                        # only web-0 remains
kubectl get pvc -l app=s12 || kubectl get pvc      # ...but data-web-1 and data-web-2 REMAIN
kubectl scale statefulset web --replicas=3        # web-1, web-2 recreated in order
kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt   # sentinel still there
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl get pods -l app=s12       # after scaling to 1
NAME    READY   STATUS    RESTARTS   AGE
web-0   1/1     Running   0          10m

$ kubectl get pvc -l app=s12        # PVCs for the removed ordinals are kept
NAME         STATUS   VOLUME             CAPACITY   ACCESS MODES   STORAGECLASS   AGE
data-web-0   Bound    pvc-a1b2...        1Gi        RWO            standard       10m
data-web-1   Bound    pvc-c3d4...        1Gi        RWO            standard       10m
data-web-2   Bound    pvc-e5f6...        1Gi        RWO            standard       10m

$ kubectl exec web-1 -- cat /usr/share/nginx/html/data.txt   # after scaling back to 3
written by web-1
```

Scale-down removes Pods in **reverse ordinal order** (`web-2`, then `web-1`) but **keeps
their PVCs**. Scale back up and each returning ordinal re-binds its original claim — so
`web-1` still has its sentinel. That retained-PVC behaviour is why the cleanup step above has
to delete the claims explicitly.
</details>
