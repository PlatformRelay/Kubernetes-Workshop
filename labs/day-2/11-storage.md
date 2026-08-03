# Lab 11 — Storage (PV/PVC/StorageClass) (S11)

<!-- lab-contract:v1 -->

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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./11-storage.solution.md#guided-solutions)

### Step 0 — see the default StorageClass

Dynamic provisioning needs a **default** StorageClass (the one that runs when a PVC doesn't
name one). Find it and note its reclaim policy and binding mode.

```bash
kubectl get storageclass
```

---

### Step 1 — apply the PVC (and understand `Pending`)

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

---

### Step 2 — mount the PVC and write a sentinel

Now give the claim a consumer. First show the ephemeral baseline, then the durable version.
As in Lab 10, the demo app's image is distroless (no shell), so each Deployment carries a
tiny **toolbox** sidecar mounting the same volume — that's the pen you write the sentinel
with.

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
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox              # the app image has no shell — the sidecar is our pen
          image: busybox:1.37
          command: ["sleep", "infinity"]
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
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - name: data
              mountPath: /data        # identical mount — only the volume source changes
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
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
kubectl exec deploy/web -c toolbox -- sh -c 'echo "written by $(hostname) at boot" > /data/data.txt'
kubectl exec deploy/web -c toolbox -- cat /data/data.txt
```

**Question:** you never created a PersistentVolume — where did the `VOLUME` (the `pvc-…`
name) come from?

---

### Step 3 — delete the Pod, prove the data survives

This is the whole point of the section.

```bash
# delete the running Pod; the Deployment immediately recreates one
kubectl delete pod -l app=s11
kubectl rollout status deploy/web

# read the sentinel from the BRAND-NEW Pod
kubectl exec deploy/web -c toolbox -- cat /data/data.txt
```

**Task:** did the file survive into the replacement Pod?

**Question:** the sentinel says it was written by the *old* Pod's hostname. Why is that the
proof we wanted?

---

### Step 4 — break→fix: a StorageClass that doesn't exist

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
      image: ghcr.io/platformrelay/workshop-web:v1
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
      image: ghcr.io/platformrelay/workshop-web:v1
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

---

### Step 5 — read the reclaim policy

The reclaim policy decides what happens to the PV (and its data) when the **claim** is
deleted. It's stamped onto the PV from the StorageClass.

```bash
# find the PV backing web-data, then read its reclaim policy (needs cluster-scoped read)
PVNAME=$(kubectl get pvc web-data -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PVNAME" -o custom-columns=\
NAME:.metadata.name,RECLAIM:.spec.persistentVolumeReclaimPolicy,SC:.spec.storageClassName,STATUS:.status.phase
```

**Task:** what is the reclaim policy, and what would deleting `web-data` do to the data?

## Observe

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

## Challenge

A PVC stays Pending after you apply it. Distinguish a missing StorageClass from a
normal WaitForFirstConsumer delay, then restore a Bound volume the Pod can write.

**Difficulty:** Intermediate

**Success criteria:** Identify the Pending reason from Events, restore or wait appropriately, prove the
PVC reaches Bound status with a Pod mount, and show a sentinel file that remains
present after a Pod delete.

**Hints:** Check kubectl describe pvc Events for StorageClass versus WaitForFirstConsumer;
compare with kubectl get storageclass before editing the claim.

[Spoiler: challenge solution](./11-storage.solution.md#challenge-solution)

## Verify

Confirm the PVC is Bound and the sentinel path still matters before cleanup.

```bash
kubectl get pvc,deploy,pods -n "$NS" -l app=s11
kubectl describe pvc -n "$NS" -l app=s11 | sed -n '/Events:/,$p' | head -n 20
```

Expected: at least one Bound PVC remains, and Events do not show an unresolved
ProvisioningFailed for your working claim.

## Cleanup / reset

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
kubectl exec deploy/web -c toolbox -- sh -c 'echo ephemeral > /data/data.txt'
kubectl delete pod -l app=s11                     # recreate the Pod
kubectl rollout status deploy/web
kubectl exec deploy/web -c toolbox -- cat /data/data.txt || echo "FILE GONE"
```
