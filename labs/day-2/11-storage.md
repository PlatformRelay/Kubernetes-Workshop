# Lab 11 — Storage (PV/PVC/StorageClass) (S11)

| | |
| --- | --- |
| **Section** | S11 — Storage (PV/PVC/StorageClass) |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin; a default StorageClass is assumed)* |
| **Estimated time** | 30 min |

## Objective

Give the `web` app **durable** storage. You will apply a **PersistentVolumeClaim** against
the cluster's default **StorageClass**, mount it into a Deployment, write a **sentinel**
file, then **delete the Pod** and prove the file survives. Along the way you will see why a
PVC can sit `Pending` for two very different reasons — a `WaitForFirstConsumer` binding
mode (normal) versus a StorageClass that doesn't exist (the break→fix) — and read the
**reclaim policy** that decides whether deleting the claim also destroys the data.

> **Set your namespace once.** Everything runs in your assigned namespace (or a kind
> cluster). Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–06 concepts (Pod, Deployment). This lab **creates its own** `web` Deployment, so
  it does not depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights and
  no add-ons — kind ships a default `standard` StorageClass (the `local-path` provisioner);
  shared clusters have a default StorageClass provided for you.
- Reading the auto-created **PV** needs cluster-scoped read (PVs are not namespaced). On a
  locked-down namespace that may be denied — Step 5 gives a namespace-safe alternative.

## Files used

- `pvc.yaml` — the `web-data` PVC (the request: 1Gi, `ReadWriteOnce`, default StorageClass).
- `deployment-emptydir.yaml` — the `web` Deployment with an **ephemeral** `emptyDir` volume.
- `deployment-pvc.yaml` — the same Deployment, `emptyDir` swapped for the **PVC**.
- `pvc-bad-storageclass.yaml` — a claim naming a **nonexistent** StorageClass + a consumer
  Pod, for the break→fix.

Everything is labelled `app: s11` so cleanup is a single label selector.

---

## Step 0 — see the default StorageClass

Dynamic provisioning needs a **default** StorageClass (the one that runs when a PVC doesn't
name one). Find it and note its reclaim policy and binding mode.

```bash
kubectl get storageclass
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get storageclass
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  10d
```

The `(default)` marker is the one used when a PVC omits `storageClassName`. On kind it is
`standard` (the `local-path` provisioner); on a shared cluster the name/provisioner differ,
but there will be exactly one default. Note two columns you'll meet again: **RECLAIMPOLICY**
`Delete` (deleting the claim destroys the disk) and **VOLUMEBINDINGMODE**
`WaitForFirstConsumer` (the claim won't bind until a Pod consumes it).
</details>

---

## Step 1 — apply the PVC (and understand `Pending`)

Create the claim. It omits `storageClassName`, so it uses the default from Step 0.

```bash
cat > pvc.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data
  labels:
    app: s11
spec:
  accessModes: ["ReadWriteOnce"]     # one node mounts it read-write
  resources:
    requests:
      storage: 1Gi
  # storageClassName omitted → the cluster default StorageClass
EOF

kubectl apply -f pvc.yaml
kubectl get pvc web-data
```

**Task:** is the PVC `Bound` yet? Check *why* with `describe`.

```bash
kubectl describe pvc web-data | sed -n '/Events/,$p'
```

<details><summary>Solution / expected output</summary>

On kind (and any `WaitForFirstConsumer` default) the claim is **Pending** — on purpose:

```console
$ kubectl get pvc web-data
NAME       STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data   Pending                                     standard       5s

$ kubectl describe pvc web-data | sed -n '/Events/,$p'
Events:
  Type    Reason                Age   From                         Message
  ----    ------                ----  ----                         -------
  Normal  WaitForFirstConsumer  3s    persistentvolume-controller  waiting for first consumer to be created before binding
```

`waiting for first consumer` means the StorageClass defers binding until a Pod mounts the
claim, so the disk lands on the node the Pod is scheduled to. **This Pending is expected —
it is not a failure.** (On a cluster whose default StorageClass uses `Immediate` binding,
you'll instead see `STATUS: Bound` right away. Either is correct.) Remember the event text
`waiting for first consumer` — the break in Step 4 shows a *different* Pending message.
</details>

---

## Step 2 — mount the PVC and write a sentinel

Now give the claim a consumer. First show the ephemeral baseline, then the durable version.

```bash
cat > deployment-emptydir.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s11
spec:
  replicas: 1                        # one replica → `exec` is unambiguous
  selector:
    matchLabels:
      app: s11
  template:
    metadata:
      labels:
        app: s11
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          emptyDir: {}               # ephemeral — shares the Pod's lifetime
EOF

cat > deployment-pvc.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s11
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s11
  template:
    metadata:
      labels:
        app: s11
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts:
            - name: data
              mountPath: /data        # identical mount — only the volume source changes
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: web-data        # durable, survives the Pod
EOF

# apply the durable version and wait for it to roll out
kubectl apply -f deployment-pvc.yaml
kubectl rollout status deploy/web

# the Pod is now the "first consumer" — the claim should bind
kubectl get pvc web-data
```

**Task:** confirm the claim is now `Bound`, then write a sentinel file into the volume.

```bash
kubectl exec deploy/web -- sh -c 'echo "written by $(hostname) at boot" > /data/data.txt'
kubectl exec deploy/web -- cat /data/data.txt
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pvc web-data
NAME       STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data   Bound    pvc-3d1f...-9a2b                           1Gi        RWO            standard       40s

$ kubectl exec deploy/web -- cat /data/data.txt
written by web-6f8c9b7d5-abcde at boot
```

Scheduling the Pod triggered the provisioner: it created a **PV**, bound `web-data` to it
(`STATUS: Bound`, and a `VOLUME` name appears), and mounted it at `/data`. The sentinel now
lives on the PV, not on the Pod's writable layer.
</details>

**Question:** you never created a PersistentVolume — where did the `VOLUME` (the `pvc-…`
name) come from?

<details><summary>Answer</summary>

**Dynamic provisioning.** The default StorageClass's provisioner watched for a `Bound`-able
claim and, once a Pod consumed `web-data`, created a PV sized to the request and bound them
1:1. You author only the **claim**; the StorageClass mints the **volume**. (Static
provisioning — an admin pre-creating PVs — still exists but is the exception today.)
</details>

---

## Step 3 — delete the Pod, prove the data survives

This is the whole point of the section.

```bash
# delete the running Pod; the Deployment immediately recreates one
kubectl delete pod -l app=s11
kubectl rollout status deploy/web

# read the sentinel from the BRAND-NEW Pod
kubectl exec deploy/web -- cat /data/data.txt
```

**Task:** did the file survive into the replacement Pod?

<details><summary>Solution / expected output</summary>

```console
$ kubectl delete pod -l app=s11
pod "web-6f8c9b7d5-abcde" deleted
$ kubectl rollout status deploy/web
deployment "web" successfully rolled out
$ kubectl exec deploy/web -- cat /data/data.txt
written by web-6f8c9b7d5-abcde at boot
```

**Yes.** The new Pod (note the *old* hostname inside the file — it wasn't rewritten)
re-bound the **same** `web-data` PVC and the **same** PV. The PVC and PV have their own
lifecycle, independent of any Pod, so the data outlived the delete.
</details>

**Question:** the sentinel says it was written by the *old* Pod's hostname. Why is that the
proof we wanted?

<details><summary>Answer</summary>

Because the file was written **once**, by the original Pod, and read back by a **different**
Pod after a delete/recreate. If the volume were `emptyDir` (or the container's own
filesystem), the new Pod would start with an empty `/data` and the `cat` would fail — the
data is tied to the PVC/PV, not the Pod. (The stretch goal runs that counter-experiment.)
</details>

---

## Step 4 — break→fix: a StorageClass that doesn't exist

A `Pending` claim isn't always the harmless `WaitForFirstConsumer` wait. Here's the other
cause — and how `describe` tells them apart. This claim ships **with** a consumer Pod, so
you can see it fail even *with* a first consumer present.

```bash
cat > pvc-bad-storageclass.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data-bad
  labels:
    app: s11
spec:
  storageClassName: no-such-class    # <-- nonexistent provisioner
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: binder
  labels:
    app: s11
spec:
  containers:
    - name: c
      image: nginx:1.27
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: web-data-bad
EOF

kubectl apply -f pvc-bad-storageclass.yaml
kubectl get pvc web-data-bad
kubectl get pod binder
kubectl describe pvc web-data-bad | sed -n '/Events/,$p'
```

**Task:** the claim has a consumer (the `binder` Pod) — so why is it still `Pending`, and how
is this different from Step 1?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pvc web-data-bad
NAME           STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS    AGE
web-data-bad   Pending                                      no-such-class   5s

$ kubectl get pod binder
NAME     READY   STATUS    RESTARTS   AGE
binder   0/1     Pending   0          5s

$ kubectl describe pvc web-data-bad | sed -n '/Events/,$p'
Events:
  Type     Reason              Age   From                         Message
  ----     ------              ----  ----                         -------
  Warning  ProvisioningFailed  3s    persistentvolume-controller  storageclass.storage.k8s.io "no-such-class" not found
```

In Step 1 the event was `waiting for first consumer` (a normal deferral). **Here** it's a
`Warning` — `storageclass "no-such-class" not found` — and no provisioner will *ever* act,
even though the `binder` Pod is waiting to consume it. The Pod is `Pending` too, because it
can't start until its claim binds. **Read the events, not just the phase:** both say
`Pending`, but only one is broken.
</details>

**Task:** fix it. A PVC's `storageClassName` is immutable, so the claim must be recreated
on the default class. A Pod that references a PVC pins it with a `pvc-protection`
finalizer, so **remove the consumer first** (or the delete hangs), then recreate the claim
**and** a fresh consumer together — `WaitForFirstConsumer` needs a Pod present to bind.

```bash
# 1) drop the consumer first — a referenced PVC won't finish deleting while a Pod holds it
kubectl delete pod binder

# 2) delete the failed claim (storageClassName is immutable → recreate, don't patch)
kubectl delete pvc web-data-bad

# 3) recreate the claim on the DEFAULT class + a fresh consumer, together
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data-bad
  labels:
    app: s11
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
  # storageClassName omitted → the default class
---
apiVersion: v1
kind: Pod
metadata:
  name: binder
  labels:
    app: s11
spec:
  containers:
    - name: c
      image: nginx:1.27
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: web-data-bad
EOF

kubectl get pvc web-data-bad -w      # Ctrl-C once it shows Bound
kubectl get pod binder
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pvc web-data-bad -w
NAME           STATUS    VOLUME            CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data-bad   Pending                                              standard        1s
web-data-bad   Bound     pvc-a1b2...-c3d4  1Gi        RWO            standard        3s
$ kubectl get pod binder
NAME     READY   STATUS    RESTARTS   AGE
binder   1/1     Running   0          30s
```

With a valid (default) StorageClass and a fresh `binder` Pod as the first consumer,
provisioning succeeds: the PVC binds and the Pod schedules. Two things mattered — fixing the
class name was the repair, and **deleting the consumer Pod first** is what let the old claim
finish deleting (a Pod referencing a PVC holds a `pvc-protection` finalizer that blocks its
deletion until the Pod is gone).
</details>

---

## Step 5 — read the reclaim policy

The reclaim policy decides what happens to the PV (and its data) when the **claim** is
deleted. It's stamped onto the PV from the StorageClass.

```bash
# find the PV backing web-data, then read its reclaim policy (needs cluster-scoped read)
PVNAME=$(kubectl get pvc web-data -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PVNAME" -o custom-columns=\
NAME:.metadata.name,RECLAIM:.spec.persistentVolumeReclaimPolicy,SC:.spec.storageClassName,STATUS:.status.phase
```

**Task:** what is the reclaim policy, and what would deleting `web-data` do to the data?

<details><summary>Solution / expected output</summary>

```console
$ kubectl get pv "$PVNAME" -o custom-columns=NAME:...,RECLAIM:...,SC:...,STATUS:...
NAME               RECLAIM   SC         STATUS
pvc-3d1f...-9a2b   Delete    standard   Bound
```

The policy is **`Delete`** (the default for dynamically-provisioned PVs). Deleting the PVC
would release the PV and the provisioner would **destroy the underlying disk and the data**.
A policy of **`Retain`** would instead keep the PV (and data) in a `Released` state for
manual recovery — but it won't be reused automatically.

**Namespace-safe alternative** (if `get pv` is forbidden for your account — PVs are
cluster-scoped): the PV inherits the StorageClass's policy, so read it there. Substitute
**your** default StorageClass name from Step 0 (`standard` on kind):

```console
$ kubectl get sc <your-default-sc> -o jsonpath='{.reclaimPolicy}'; echo
Delete
```
</details>

## Expected observations

- A PVC omitting `storageClassName` uses the cluster **default** StorageClass.
- With `WaitForFirstConsumer`, the PVC is **`Pending` until a Pod mounts it** — normal, and
  distinguishable from a real failure only by the `describe` **events**.
- Dynamic provisioning creates the **PV** on demand; you never wrote a PV manifest.
- A sentinel written to a PVC-backed volume **survives a Pod delete** (the replacement Pod
  re-binds the same claim); an `emptyDir` sentinel would not.
- A nonexistent StorageClass yields `ProvisioningFailed … not found` and a permanently
  `Pending` claim (and consumer Pod).
- Dynamically-provisioned PVs default to reclaim policy **`Delete`** — deleting the claim
  destroys the data.

## Cleanup / panic reset

```bash
# scoped cleanup — everything this lab made is labelled app=s11
# delete consumers (Pods) BEFORE the claims, or pvc-protection finalizers stall the delete
kubectl delete pod binder --ignore-not-found -n "$NS"
kubectl delete deployment -l app=s11 -n "$NS" --ignore-not-found
kubectl delete pvc -l app=s11 -n "$NS" --ignore-not-found   # after Pods release them
rm -f pvc.yaml deployment-emptydir.yaml deployment-pvc.yaml pvc-bad-storageclass.yaml

# NOTE: with reclaim policy Delete the PVs vanish with their claims. If your default class
# uses Retain, a Released PV may linger — an admin removes it: kubectl delete pv <name>

# panic reset (namespace): also removes anything else left in your namespace
# kubectl delete deploy,rs,pod,pvc --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

## Stretch (optional) — the `emptyDir` counter-experiment

Prove the contrast: with `emptyDir`, the *same* delete loses the data.

```bash
kubectl apply -f deployment-emptydir.yaml         # swap the PVC volume for emptyDir
kubectl rollout status deploy/web
kubectl exec deploy/web -- sh -c 'echo ephemeral > /data/data.txt'
kubectl delete pod -l app=s11                     # recreate the Pod
kubectl rollout status deploy/web
kubectl exec deploy/web -- cat /data/data.txt || echo "FILE GONE"
```

<details><summary>Solution / what you're looking at</summary>

```console
$ kubectl exec deploy/web -- cat /data/data.txt || echo "FILE GONE"
cat: /data/data.txt: No such file or directory
FILE GONE
```

`emptyDir` is created **empty** with each Pod and deleted with it, so the replacement Pod
starts with an empty `/data` — the file is gone. Same delete, opposite result: durability
comes from the PVC/PV having a lifecycle **separate** from the Pod. Re-apply
`deployment-pvc.yaml` if you want the durable version back, or run the cleanup above.
</details>
