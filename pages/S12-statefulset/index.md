---
layout: section-cover
image: /covers/section-12-luggage-caravan.png
day: Day 2
section: '12'
tier: recommended
track: Workloads
---

# StatefulSet

Give each replica a **stable identity** and its **own** storage — for workloads that
can't be treated as interchangeable.

**recommended** · suggested Day 2 · Workloads track

<!--
Section S12 — StatefulSet. Timing: ~30 min slides + 30 min lab. Follows S11 (Storage):
S11 made data durable but a Deployment shares ONE PVC across all replicas. S12 is the
answer when each replica needs its own identity AND its own volume.
Outcome: learners can say when a StatefulSet beats a Deployment; explain the three
guarantees (stable ordinal names, stable per-Pod DNS via a headless Service, per-Pod PVCs
from volumeClaimTemplates); read ordered create/terminate and partitioned rollout; and
prove identity + data survive a Pod delete.
Beats: problem (interchangeable Pods are wrong for identity/data) · mental model (three
guarantees) · magic-move (headless Service clusterIP:None → StatefulSet serviceName +
volumeClaimTemplates) · StatefulIdentity animation (ordered create → sentinel → delete
web-1 → same name/PVC reattach) · ordered lifecycle + podManagementPolicy + partition ·
PVC retention gotcha (currency) · recap → lab.
Animation: StatefulIdentity.vue (new, self-contained — the AC's "manifest-extends
animation" has no existing component; S11 set the precedent of a per-section animation).
CKx: CKAD/CKA workloads — StatefulSets, headless Services, volumeClaimTemplates.
-->

---
layout: statement
kicker: The problem
---

A Deployment's Pods are **cattle** — some workloads are **pets**.

A Deployment gives you `web-6f8c9b7d5-abcde`, `web-6f8c9b7d5-xk2mp` — **random,
interchangeable** names, and (from S11) they all share **one** PVC. That's perfect for a
stateless web tier. But a database replica, a message broker, or a cache cluster needs the
opposite: a **stable name** it keeps across restarts, a **fixed address** its peers can
find, and its **own** disk that follows it. That's a **StatefulSet**.

<!--
Speaker: the cattle-vs-pets framing is the fastest way in. Deployment Pods are cattle —
you don't name them, any one is as good as another, and they share fate. The workloads
that break under that model are the identity-bearing ones: a Postgres primary vs replica,
a Kafka broker with a fixed broker.id, an etcd/ZooKeeper member that peers dial by name.
Three things they need that a Deployment can't give: (1) a stable name that survives
reschedule, (2) a stable DNS address for peer discovery, (3) their own persistent volume,
not a shared one. Hold the answer — the next slide names the three guarantees.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · three guarantees a Deployment can't give</span>

# StatefulSet = stable name + stable DNS + own storage

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <div class="kw-icon-stack">
      <K8sIcon kind="sts" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="Stable ordinal names" kind="sts">
        Pods are <code>web-0</code>, <code>web-1</code>… — created <strong>in order</strong>,
        replaced with the <strong>same name</strong>.
      </KwCard>
    </div>
  </v-click>
  <v-click at="2">
    <div class="kw-icon-stack">
      <K8sIcon kind="svc" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="Stable per-Pod DNS" kind="svc">
        Headless Service → <code>web-0.web.&lt;ns&gt;.svc…</code> — peers dial by name.
      </KwCard>
    </div>
  </v-click>
  <v-click at="3">
    <div class="kw-icon-stack">
      <K8sIcon kind="pvc" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="Per-Pod storage" kind="pvc">
        <code>volumeClaimTemplates</code> → <code>data-web-0</code>, … — sticky to the ordinal.
      </KwCard>
    </div>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

Same reconciliation model — the guarantee is <strong>identity</strong>: ordinal → name, DNS, volume.

</div>

</div>

<!--
Speaker: these three are the whole section — everything downstream is a consequence.
(1) Ordinal names: the StatefulSet controller numbers Pods 0..N-1 and a deleted ordinal
comes back with the SAME name, not a new random one. (2) Stable DNS needs a HEADLESS
Service (clusterIP: None) — instead of load-balancing to one virtual IP, DNS returns a
per-Pod A record, so web-0 can resolve web-1 by name. This is how clustered software does
peer discovery. (3) volumeClaimTemplates is a PVC *stencil*: one claim minted per ordinal,
named <template>-<statefulset>-<ordinal>, and it is NOT deleted when the Pod is (or even
when the StatefulSet is, by default). Reuses the exact S11 PVC/StorageClass model — the
only new idea is "one per Pod, sticky to the ordinal." CKA/CKAD workloads domain.
-->

---
layout: code-annotated
heading: 'The four fields that make identity work'
compact: true
lab: labs/day-2/12-statefulset.md
---

```yaml {none|5|6|9|11-12}
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web
  replicas: 3
  selector: { matchLabels: { app: s12 } }
  template: { metadata: { labels: { app: s12 } }, spec: { containers: [...] } }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ['ReadWriteOnce']
        resources: { requests: { storage: 1Gi } }
```

::notes::

<CodeNote at="1" label="serviceName wires DNS" variant="warn">
Must name a <strong>headless</strong> Service (<code>clusterIP: None</code>). This is what
gives each Pod <code>web-0.web.&lt;ns&gt;.svc…</code>. Point it at a name that doesn't exist
and the Pods still start — but peer DNS silently never resolves (the lab's break→fix).
</CodeNote>

<CodeNote at="2" label="replicas are ordered">
The controller creates <code>web-0</code> → <code>web-1</code> → <code>web-2</code>
<strong>one at a time, in order</strong>, and terminates them in reverse.
</CodeNote>

<CodeNote at="3" label="volumeClaimTemplates ≠ volumes">
Not a <code>volumes:</code> entry — a <strong>template</strong>. Each ordinal gets its own
PVC <code>&lt;name&gt;-&lt;sts&gt;-&lt;ordinal&gt;</code> (<code>data-web-0</code>, …), each
dynamically provisioned exactly like S11.
</CodeNote>

<CodeNote at="4" label="the claim reuses S11" variant="ok">
Same <code>accessModes</code> + <code>resources</code> + StorageClass model as the S11 PVC —
the only new idea is <strong>one per Pod</strong>, sticky to the ordinal across restarts.
</CodeNote>

<!--
Speaker: four fields carry the whole behaviour. serviceName is the one people forget — it
must reference a headless Service, and nothing validates that the name exists, so a typo
gives you running Pods with dead peer DNS (great teachable break, it's the lab). replicas
here behave differently from a Deployment: ordered, one at a time. volumeClaimTemplates is
the star — a stencil, not a volume; the controller stamps out data-web-0/1/2 and re-attaches
the right one to the right ordinal forever. The claim body is byte-for-identical to the S11
PVC, which is the point: nothing new about the storage, just one per Pod. Container spec
elided here for fit — the lab carries the full applyable manifest.
-->

---
layout: code-walkthrough
heading: 'Build it — a headless Service, then the StatefulSet'
lab: labs/day-2/12-statefulset.md
---

````md magic-move
```yaml
# 1: a HEADLESS Service — clusterIP: None → per-Pod DNS, not one virtual IP
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: s12 } }
spec:
  clusterIP: None                    # <-- headless: DNS returns each Pod, no load-balancing
  selector: { app: s12 }
  ports: [{ port: 80, name: http }]
```

```yaml
# 2: the StatefulSet — references the Service by name, replicas run in order
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web                   # the headless Service above
  replicas: 3                        # web-0, web-1, web-2 — created in order
  selector: { matchLabels: { app: s12 } }
  template:
    metadata: { labels: { app: s12 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts: [{ name: data, mountPath: /usr/share/nginx/html }]
```

```yaml
# 3: +volumeClaimTemplates — one PVC minted per ordinal (data-web-0, -1, -2)
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web
  replicas: 3
  selector: { matchLabels: { app: s12 } }
  template:
    metadata: { labels: { app: s12 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          volumeMounts: [{ name: data, mountPath: /usr/share/nginx/html }]   # the templated claim
  volumeClaimTemplates:
    - metadata: { name: data }        # → data-web-0, data-web-1, data-web-2
      spec:
        accessModes: ['ReadWriteOnce']
        resources: { requests: { storage: 1Gi } }
```

````

<!--
Speaker: THREE frames. (1) the headless Service — the ONLY difference from an S07 ClusterIP
Service is clusterIP: None, and that single line switches DNS from "one virtual IP" to "one
A record per Pod." (2) the StatefulSet body: serviceName ties it to that Service, replicas:3
will roll out ordered. Note the mount name `data` — it has no matching volumes: entry yet,
because... (3) volumeClaimTemplates supplies it: the template named `data` becomes the PVC
per ordinal (data-web-0…), and the container's volumeMount `data` resolves to that per-Pod
claim. That's the wiring: template name == volumeMount name. Compact teaching view (inlined
metadata); the lab ships the block-style applyable files. The lab applies exactly these.
-->

---

<span class="kw-kicker">Ordered create · sentinel · delete web-1 · same name + PVC return</span>

# Stable identity in motion

<div class="mt-2">
  <StatefulIdentity :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **`web-0` first**, then `web-1`, then `web-2` — ordered, not raced up like a Deployment.
- Each ordinal is minted its **own** PVC (`data-web-N`) from `volumeClaimTemplates`.
- Write a sentinel into **`web-1`** — it lands on `data-web-1`, not the Pod.
- Delete `web-1`: its PVC is a **separate object**, so the data stays put.
- `web-1` returns **same-name**, re-binds the **same PVC** — data survived.

</v-clicks>
</div>

<!--
Speaker: drive with clicks. (0) headless Service exists, no Pods. (1) web-0 created FIRST,
its PVC data-web-0 minted. (2) web-1 then web-2, strictly ordered, each with its own PVC —
contrast a Deployment spinning all replicas up at once with random names and one shared
claim. (3) write a sentinel into web-1's volume. (4) delete web-1 — its PVC is a separate
object and persists. (5) web-1 comes back with the SAME name, re-binds the SAME PVC, sentinel
intact. That last frame is the entire value proposition and is exactly what the lab proves.
A Deployment Pod, by contrast, would return as web-<newhash> with an empty (or shared) volume.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Lifecycle · ordered, and how rollouts differ</span>

# Ordered by default — and the knobs that change it

<div class="kw-cols-2 mt-2 text-sm">
  <v-click at="1">
    <KwCard heading="Ordered create & delete" icon="🔢">
      Scale up <code>web-0…N</code> <strong>in order</strong>; scale down in
      <strong>reverse</strong>. Rollouts replace highest ordinal first.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="podManagementPolicy" icon="⚙️" variant="warn">
      <code>OrderedReady</code> (default) vs <code>Parallel</code> — faster when peers
      don't need strict sequencing.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Partitioned rollout" icon="🧪">
    <code>partition: N</code> updates ordinals <strong>≥ N</strong> — built-in canary.
  </KwCard>
  <KwCard heading="Storage is NOT auto-cleaned" icon="🗑️" variant="danger">
    PVCs survive StatefulSet delete by default — set
    <code>persistentVolumeClaimRetentionPolicy</code> or clean up manually.
  </KwCard>
</div>

</div>

<!--
Speaker: four operational facts. (1) Ordering is the default contract — web-0 must be Ready
before web-1 starts; on scale-down the highest ordinal goes first. This is what lets
clustered software bootstrap deterministically (seed node first, etc.). (2) podManagementPolicy:
Parallel opts out when you don't need the sequencing (it can't be changed after creation).
(3) partition is the underrated feature: it's a native canary for stateful apps — pin the
partition high, update only the top ordinal, verify, then walk it down. (4) The cleanup
gotcha and the currency beat: historically PVCs from volumeClaimTemplates are NEVER
auto-deleted (safe default, manual cleanup — the lab's cleanup step). The modern answer is
persistentVolumeClaimRetentionPolicy (whenDeleted/whenScaled: Retain|Delete), now GA — mention
it so nobody thinks manual-delete is the only option. Lab: cleanup deletes PVCs by label.
-->

---
layout: recap
heading: 'Recap — identity-bearing workloads'
story: 'Deleting web-1 felt catastrophic until it came back same-name with the same sentinel on data-web-1 — identity and disk stayed coupled.'
next: 'S13 · Resources & limits — right-size what you run (requests, limits, QoS)'
---

- **Deployment** Pods = interchangeable, random names, **shared** PVC (S11) — wrong for
  identity or per-instance data
- **StatefulSet** = **stable ordinal names** (`web-0…`) + **stable per-Pod DNS** (headless
  Service: `clusterIP: None` + `serviceName`) + **per-Pod PVCs** (`volumeClaimTemplates`)
- `volumeClaimTemplates` mints **one PVC per ordinal** (reuses S11), **sticky** across restarts
- Ordered create/delete (`OrderedReady`; `Parallel` opts out); `partition` = built-in **canary**
- Delete a Pod → **same name + same PVC** → data survives; PVCs are **not** auto-deleted
  (clean up, or set `persistentVolumeClaimRetentionPolicy`)

<!--
Speaker: the incident-time takeaway: "reach for a StatefulSet when a Pod's name, address, or
disk must be stable — otherwise a Deployment is simpler and cheaper." Two traps to name: the
serviceName must point at a real headless Service or peer DNS silently dies (the lab's break),
and leftover PVCs cost money because they outlive the StatefulSet. Hand to Lab 12: apply the
headless Service + StatefulSet, watch web-0/1/2 appear in order, confirm one PVC per ordinal,
write a sentinel to web-1, delete it, and prove same-name + same-data return; then break the
serviceName and watch peer DNS fail. Next section (S13) pivots from identity to right-sizing:
requests, limits, and QoS.
-->

---
layout: lab
lab: labs/day-2/12-statefulset.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 12 — Stable identity

- Apply a **headless Service** (`clusterIP: None`) then a **3-replica StatefulSet** with
  `volumeClaimTemplates`; watch `web-0`, `web-1`, `web-2` appear **in order**
- Confirm **one PVC per ordinal** (`data-web-0/1/2`); `exec` into `web-1` and write a
  **sentinel**
- **Delete `web-1`** → it returns with the **same name**, re-binds the **same PVC**, sentinel
  intact
- **Break→fix:** point `serviceName` at a nonexistent Service → per-Pod DNS never resolves →
  diagnose from another Pod → fix and watch `web-1.web` resolve
- Answer the headline: *why did `web-1` reattach its data while a Deployment Pod would not?*
