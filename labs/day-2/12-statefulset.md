# Lab 12 — StatefulSet (S12)

<!-- lab-contract:v1 -->

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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./12-statefulset.solution.md#guided-solutions)

### Step 0 — apply the headless Service

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
      targetPort: 8080
      name: http
EOF

kubectl apply -f headless-svc.yaml
kubectl get svc web
```

**Task:** confirm the Service is headless (no cluster IP).

---

### Step 1 — apply the StatefulSet and watch ordered creation

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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox           # the app image has no shell — the sidecar is our pen
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
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

**Question:** you set `replicas: 3` but never wrote three PVCs. Where did the storage come
from?

---

### Step 2 — confirm one PVC per ordinal

```bash
kubectl get pvc -l app=s12
```

**Task:** how many PVCs exist, and how are they named?

---

### Step 3 — write a sentinel into `web-1`

Give one specific ordinal some data we can recognise later.

```bash
kubectl exec web-1 -c toolbox -- sh -c 'echo "written by $(hostname)" > /data/data.txt'
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

---

### Step 4 — delete `web-1`; prove identity **and** data survive

This is the heart of the section.

```bash
# delete just the middle ordinal; the StatefulSet immediately recreates it
kubectl delete pod web-1
kubectl get pods -l app=s12 -w        # Ctrl-C once web-1 is Running again

# read the sentinel from the REPLACEMENT web-1
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

**Task:** what name does the replacement Pod get, and is the sentinel still there?

**Question:** why did `web-1` reattach its old data, when a Deployment Pod would have come
back empty?

---

### Step 5 — see stable per-Pod DNS

The headless Service publishes a DNS name for **each** Pod:
`<pod>.<serviceName>.<namespace>.svc.cluster.local`. Peers use these to find each other.
Look one up from another Pod.

```bash
# resolve web-1's per-Pod name from a temporary Pod (any Pod counts as "a peer")
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"
```

**Task:** does `web-1.web.<ns>.svc.cluster.local` resolve to an IP?

---

### Step 6 — break→fix: a `serviceName` pointing at nothing

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
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
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
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

## Observe

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

## Challenge

A StatefulSet's Pods never become Ready after someone edits serviceName to a
Service that does not exist. Diagnose the identity failure and restore ordered Ready
Pods with stable DNS.

**Difficulty:** Intermediate

**Success criteria:** Identify the bad serviceName field, restore the headless Service link, show ordinal
Pods reach Ready status, and prove one per-Pod DNS name returns an address.

**Hints:** Inspect spec.serviceName on the StatefulSet and compare it with kubectl get svc;
headless Services use clusterIP: None.

[Spoiler: challenge solution](./12-statefulset.solution.md#challenge-solution)

## Verify

Confirm ordinal identity before cleanup.

```bash
kubectl get sts,pods,pvc,svc -n "$NS"
kubectl get pods -n "$NS" -o wide
```

Expected: ordinal Pods are Running/Ready (or you have already finished the break→fix
and restored them), and per-ordinal PVCs still exist.

## Cleanup / reset

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
kubectl exec web-1 -c toolbox -- cat /data/data.txt   # sentinel still there
```
