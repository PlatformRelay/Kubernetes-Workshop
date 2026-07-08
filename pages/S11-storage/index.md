---
layout: section-cover
day: Day 2
section: '11'
tier: core
track: Workloads
---

# Storage (PV/PVC/StorageClass)

Give the app a volume that outlives the Pod — and reason about the storage stack that
provisions it.

**core** · suggested Day 2 · Workloads track

<!--
Section S11 — Storage. Timing: ~30 min slides + 30 min lab. Second Day-2 workload
concern after config (S10): the app is configurable, but its DATA is still ephemeral.
Outcome: learners can tell ephemeral (container fs / emptyDir) from durable storage,
explain the PVC → PV → StorageClass chain and dynamic provisioning, pick an access mode
and reclaim policy, and mount a dynamically-provisioned PVC into a Deployment so data
survives a Pod delete.
Beats: problem (fs + emptyDir are ephemeral) · mental model (PVC=request → PV=storage →
StorageClass=provisioner) · access modes + reclaim policy · magic-move (emptyDir → PVC
referencing a StorageClass, mounted) · PVC-binding animation (bind → write → delete Pod →
data survives) · provisioning + binding mode (WaitForFirstConsumer; Deployments mount
PVCs too → sets up S12) · debrief → lab.
Optional shared animation: PvcBinding.vue (new, self-contained). CKx: CKA/CKAD storage —
PV, PVC, StorageClass, access modes, reclaim policy, dynamic provisioning.
-->

---
layout: statement
kicker: The problem
---

A container's filesystem **dies with the Pod**.

Write a file inside a running container and it lives on the Pod's writable layer — delete
the Pod, reschedule it, or let a Deployment replace it, and that data is **gone**.
`emptyDir` is barely better: it survives a container *restart* but is wiped when the Pod
is removed. Anything that must **outlive the Pod** — a database, an upload, a cache you
can't lose — needs storage that is a **separate object from the Pod**.

<!--
Speaker: make the failure concrete — this is the storage equivalent of the S10 config
lesson (the image is immutable; config lives outside it). Here: the Pod is disposable;
data that matters must live outside it. Two ephemeral tiers to name: (1) the container's
own writable layer — gone on Pod delete AND reset on container restart; (2) emptyDir — an
empty volume that shares the Pod's lifetime, survives a container crash/restart but is
deleted with the Pod. Neither survives rescheduling. Lab 11 proves durability against a
real Pod delete.
-->

---

<span class="kw-kicker">Mental model · request, storage, provisioner</span>

# Three objects: PVC → PV → StorageClass

<div class="mt-4 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
  <v-click at="1">
    <div style="text-align:center;">
      <K8sIcon kind="pvc" variant="unlabeled" size="3rem" />
      <KwCard heading="PersistentVolumeClaim" icon="📝">
        The <strong>request</strong>: "I need 1Gi, ReadWriteOnce." Written by the app team,
        lives in the namespace next to the Deployment.
      </KwCard>
    </div>
  </v-click>
  <v-click at="2">
    <div style="text-align:center;">
      <K8sIcon kind="pv" variant="unlabeled" size="3rem" />
      <KwCard heading="PersistentVolume" icon="💾">
        The actual <strong>piece of storage</strong> (a disk, an NFS share). Cluster-scoped;
        bound one-to-one to a satisfying claim.
      </KwCard>
    </div>
  </v-click>
  <v-click at="3">
    <div style="text-align:center;">
      <div style="font-size:2.6rem;line-height:1;">⚙️</div>
      <KwCard heading="StorageClass" icon="🏭">
        The <strong>provisioner</strong> + the disk "flavour" (SSD, HDD). On a claim it
        <strong>dynamically creates</strong> the PV — no ops ticket.
      </KwCard>
    </div>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

You write the **PVC**. The **StorageClass** provisions a matching **PV** on demand and
binds it. Your Pod mounts the PVC by name and never sees the disk detail.

</div>

<!--
Speaker: land the one-way flow — you author only the PVC (the request). Everything else is
automatic under dynamic provisioning: the named StorageClass runs a provisioner that mints
a PV sized to the claim and binds them 1:1. Static provisioning (an admin pre-creates PVs)
still exists but is the exception now. Analogy that sticks: PVC = a work order, PV = the
delivered goods, StorageClass = the supplier/catalogue. There is no vendored glyph for
StorageClass in the icon set, so it's shown as a gear — pv/pvc use the official resource
glyphs. Lab: apply a PVC against the default StorageClass and watch the PV appear.
-->

---
layout: code-annotated
heading: 'Access modes and reclaim policy — the two knobs that bite'
lab: labs/day-2/11-storage.md
---

```yaml {none|4|5-6|7|all}
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: web-data, labels: { app: s11 } }
spec:
  storageClassName: standard        # which provisioner / disk flavour
  accessModes: ['ReadWriteOnce']    # RWO · RWX · ReadWriteOncePod
  resources: { requests: { storage: 1Gi } }
```

::notes::

<CodeNote at="1" label="StorageClass name">
Names the provisioner. Omit it and you get the cluster <strong>default</strong>
StorageClass; name one that doesn't exist and the claim hangs <code>Pending</code> forever
(the lab's break→fix).
</CodeNote>

<CodeNote at="2" label="access mode = how many nodes" variant="warn">
<code>ReadWriteOnce</code> = one <strong>node</strong> mounts read-write (most block disks).
<code>ReadWriteMany</code> = many nodes at once (needs a shared filesystem like NFS).
<code>ReadWriteOncePod</code> = exactly one Pod. Picking RWO is the common default — just
know it pins the Pod to one node.
</CodeNote>

<CodeNote at="3" label="size is a request">
Dynamic provisioning creates a PV of at least this size. You can grow a PVC later if the
StorageClass allows <code>allowVolumeExpansion</code>.
</CodeNote>

<CodeNote at="4" label="reclaim policy lives on the PV" variant="ok">
The bound PV's <code>persistentVolumeReclaimPolicy</code> decides what happens on PVC
delete: <code>Delete</code> (default for dynamic PVs — disk destroyed) or
<code>Retain</code> (PV + data kept for manual recovery).
</CodeNote>

<!--
Speaker: two knobs cause most storage confusion. (1) Access mode is about NODES, not a
lock — RWO means one node mounts it, so a multi-replica Deployment on RWO can wedge Pods
onto one node or block a rollout. RWX needs a real shared filesystem. RWOP (1.22+, GA
1.29) is one-Pod-exclusive. (2) Reclaim policy sits on the PV and is why "delete the PVC"
can be destructive: dynamic PVs default to Delete, so removing the claim removes the disk.
Retain keeps the data but leaves you a Released PV to clean up by hand. Both are lab
observations. The claim shown here is the exact one the lab applies.
-->

---
layout: code-walkthrough
heading: 'Extend the app — from emptyDir to a durable PVC'
lab: labs/day-2/11-storage.md
---

````md magic-move
```yaml
# our web app — data lives in an emptyDir: gone when the Pod is removed
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s11 } }
spec:
  selector: { matchLabels: { app: s11 } }
  template:
    metadata: { labels: { app: s11 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts:
            - { name: data, mountPath: /data }
      volumes:
        - name: data
          emptyDir: {}                       # ephemeral — shares the Pod's lifetime
```

```yaml
# +1: a PVC — the request for durable storage (its own object)
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: web-data, labels: { app: s11 } }
spec:
  storageClassName: standard                 # cluster default provisioner
  accessModes: ['ReadWriteOnce']
  resources: { requests: { storage: 1Gi } }
```

```yaml
# +2: the SAME Deployment — swap emptyDir for the claim, mount unchanged
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s11 } }
spec:
  selector: { matchLabels: { app: s11 } }
  template:
    metadata: { labels: { app: s11 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts:
            - { name: data, mountPath: /data }    # container is none the wiser
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: web-data }   # durable, survives the Pod
```

````

<!--
Speaker: THREE frames, the same app growing durable storage. (1) emptyDir mounted at
/data — the container writes happily but the data shares the Pod's lifetime. (2) a PVC as
its OWN object — the request; note it's namespaced and labelled app: s11 like everything
else. (3) the Deployment's volume flips from emptyDir to persistentVolumeClaim.claimName —
the container spec and mountPath are IDENTICAL, only the volume source changed. That's the
whole trick: storage is pluggable behind the mount. Compact teaching view (inlined
metadata) — the lab's manifests carry the block-style, applyable originals. The lab
applies exactly these pieces, writes a sentinel to /data, and deletes the Pod.
-->

---

<span class="kw-kicker">Watch it bind · data survives a Pod delete</span>

# The PVC binds, the Pod comes and goes

<div class="mt-4">
  <PvcBinding :step="$clicks" />
</div>

<!--
Speaker: drive the animation with clicks. (0) The PVC is Pending — with a
WaitForFirstConsumer StorageClass (kind's local-path default) binding waits for a Pod, so
Pending here is NORMAL, not a fault. (1) The Pod schedules → the provisioner mints a PV →
the PVC goes Bound → the container writes data.txt. (2) Delete the Pod: the PVC and PV are
separate objects with their own lifecycle, so they and the data persist. (3) The
Deployment recreates the Pod; it re-binds the SAME claim and the file is still there. This
is precisely the lab's core proof — call it out so learners know what "correct" looks like
before they run it.
-->

---

<span class="kw-kicker">Dynamic provisioning · and a bridge to S12</span>

# Who creates the PV — and when it binds

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Dynamic provisioning" icon="🏭">
      No pre-made PVs. The StorageClass's provisioner creates one <strong>on demand</strong>
      when your PVC appears — the norm on every managed cluster and in kind (local-path).
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="volumeBindingMode" icon="⏳" variant="warn">
      <code>Immediate</code> binds as soon as the PVC exists.
      <code>WaitForFirstConsumer</code> (kind's default) holds it <strong>Pending until a
      Pod schedules</strong> — so the disk lands on the right node. Pending ≠ broken.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="kw-cols-2 mt-4 text-sm">
  <KwCard heading="Deployments mount PVCs too" icon="📦">
    A PVC isn't StatefulSet-only. But a Deployment shares <strong>one</strong> PVC across
    all its replicas — fine for one replica or <code>ReadWriteMany</code>, awkward for many
    RWO replicas.
  </KwCard>
  <KwCard heading="→ S12: per-Pod storage" icon="🔢" variant="ok">
    When each replica needs its <strong>own</strong> identity and volume, a StatefulSet's
    <code>volumeClaimTemplates</code> mints one PVC per Pod. That's next.
  </KwCard>
</div>

<!--
Speaker: two things to seat before the lab and before S12. (1) volumeBindingMode explains
the Pending-then-binds behaviour the animation just showed — WaitForFirstConsumer defers
binding until scheduling so a topology-constrained disk (e.g. a zonal EBS volume) attaches
to the node the Pod actually lands on. This is why the lab tells kind users Pending is
expected until the Deployment is applied. (2) The S12 bridge: a Deployment can mount a PVC,
but all replicas share that ONE claim — great for a single writer, wrong for N independent
stateful instances. That gap is exactly what StatefulSet + volumeClaimTemplates fills, and
it reuses this same PVC/StorageClass model. CKA/CKAD storage domain lands here.
-->

---
layout: recap
heading: 'Debrief — data that outlives the Pod'
next: 'S12 · StatefulSet — stable identity + per-Pod storage (volumeClaimTemplates)'
---

- The container filesystem and **`emptyDir`** are **ephemeral** — gone when the Pod is
  removed; durable data needs an object with its **own lifecycle**
- **PVC → PV → StorageClass:** you write the **claim**, the StorageClass **provisions** a
  matching **PV** on demand and binds it 1:1; the Pod mounts the PVC by name
- **Access mode** = how many **nodes** mount it (`ReadWriteOnce` / `ReadWriteMany` /
  `ReadWriteOncePod`); **reclaim policy** on the PV (`Delete` vs `Retain`) decides if the
  disk dies with the claim
- **`volumeBindingMode: WaitForFirstConsumer`** keeps a PVC **Pending until a Pod
  schedules** — normal, not a failure
- Swapping `emptyDir` → `persistentVolumeClaim` leaves the container mount **unchanged** —
  storage is pluggable behind the mount
- Next: give each replica its **own** identity and volume with a **StatefulSet** (S12)

<!--
Speaker: the takeaway they'll reach for in an incident: "my data vanished" is almost always
ephemeral storage (emptyDir or the container layer), and "my PVC is stuck Pending" is
usually WaitForFirstConsumer waiting for a Pod — or a StorageClass name typo (the lab's
break). Then pivot to S12: we made data durable, but a Deployment shares one claim across
replicas; identity-bearing workloads need one volume each. Hand off to Lab 11: bind a PVC,
write a sentinel, delete the Pod, and prove the file survives.
-->

---
layout: lab
lab: labs/day-2/11-storage.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 11 — Data that survives

- Apply a **PVC** against the default **StorageClass**; watch it bind once a Pod consumes it
- Mount it into a **Deployment**, `exec` in and write a **sentinel** file
- **Delete the Pod**, let the Deployment recreate it, and confirm the file **survived**
- **Break→fix:** request a StorageClass that doesn't exist → PVC stuck `Pending` → diagnose
  with `describe pvc` → fix and watch it bind
- Answer the headline: *why did the file survive a Pod delete but not `kubectl delete pvc`?*
