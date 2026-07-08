---
layout: section-cover
image: /covers/section-03-floating-blueprint-palace.png
day: Day 1
section: '03'
tier: core
track: Foundations
---

# Kubernetes mental model

One big idea — declarative reconciliation — and the pieces that run it.

**core** · suggested Day 1 · Foundations track

<!--
Section S03 — Kubernetes mental model. Timing: ~30 min slides + 20 min lab.
Outcome: learners can describe the control plane, the node, and the
reconciliation loop, and read desired (spec) vs observed (status) — so every
later resource hangs off one idea.
Beats: imperative vs declarative · control-plane components · node components
(runtime ties back to S01's CRI) · the reconciliation loop animation (built
here first, reused by S21/S22) · spec vs status on a live object.
CKx tie-in: CKA Cluster Architecture & core components.
Lab: labs/day-1/03-cluster-tour.md.
-->

---
layout: comparison
heading: 'Stop giving orders. Describe the goal.'
leftHeading: Imperative
rightHeading: Declarative
leftBadge: 'do X now'
rightBadge: 'keep the world looking like this'
---

- You issue each step: *start this*, *stop that*, *now scale to 4*.
- The system does it once — and immediately starts drifting.
- A crash, a lost node, a fat-fingered delete → **you** must notice and repair.
- State lives in your head and your shell history.

::right::

- You submit desired state: *there should be 4 replicas of this*.
- A controller makes it true — and **keeps** it true.
- A crash or lost node is repaired automatically, without you.
- State lives in the cluster, as data you can read back.

<div class="mt-4 text-sm" v-click>

Almost everything in Kubernetes is this one move: **write down what you want, let a
loop reconcile reality toward it.** The rest of today is just *which* object you
declare.

</div>

<!--
Speaker: this is THE idea of the workshop. `kubectl apply` doesn't "run" anything —
it records desired state; a controller converges toward it. Everything from Pods
to Gateways is a spec + a loop. The reconciliation slide makes the loop concrete.
-->

---

<span class="kw-kicker">The brain of the cluster</span>

# Control plane — where desired state lives

<div class="kw-cols-2 mt-4">
  <v-click at="1">
    <KwCard heading="API server" kind="api" kindVariant="labeled">
      The <strong>front door</strong>. Every read and write goes through it — validated,
      authorized, then persisted. The only component that talks to etcd.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="etcd" kind="etcd" kindVariant="labeled" variant="plain">
      The <strong>source of truth</strong>: a consistent key/value store holding every
      object's spec <em>and</em> status. Lose etcd, lose the cluster's memory.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Scheduler" kind="sched" kindVariant="labeled">
      Watches for Pods with <strong>no node yet</strong> and picks one — by resources,
      affinity, taints. It only <em>decides</em>; the kubelet does the running.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Controller manager" kind="c-m" kindVariant="labeled">
      Runs the <strong>reconciliation loops</strong> — one per resource kind (Deployment,
      ReplicaSet, Job…). This is the engine of the next slide.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-6 kw-muted text-sm">

Everything here is a client of the **API server** — nothing writes etcd directly.
That single chokepoint is what makes the model auditable.

</div>

<!--
Speaker: keep roles to one line each. The controller-manager is the star — it hosts
the loops we animate next. etcd as "memory" lands the spec-vs-status slide later.
-->

---

<span class="kw-kicker">The muscle of the cluster</span>

# Nodes — where containers actually run

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="kubelet" kind="kubelet" kindVariant="labeled">
      The node's <strong>agent</strong>. Watches the API server for Pods assigned to its
      node and makes them real — then reports their <code>status</code> back.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="kube-proxy" kind="k-proxy" kindVariant="labeled" variant="plain">
      Programs the node's networking so a <strong>Service IP</strong> reaches the right
      Pods. We open this box in S07.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Container runtime" icon="⚙️">
      What the kubelet calls over the <strong>CRI</strong> to pull images and start
      containers — <strong>containerd / CRI-O → runc / crun</strong>.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

That runtime box is the same **CRI chain from S01** — `kubelet → CRI → OCI runtime →
namespaces + cgroups`. Kubernetes schedules Pods; the node's runtime is still just
Linux isolating processes.

</div>

<!--
Speaker: explicitly point back to S01 — the "container runtime" here is exactly the
engine/runtime/CRI stack they already built an image for. kubelet is the node-side
mirror of the control-plane loops: it too observes desired vs actual, per node.
-->

---

<span class="kw-kicker">The one loop everything runs on</span>

# Reconciliation — observe, diff, act, repeat

<div class="mt-2">
  <ReconcileLoop :step="$clicks" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **Nobody told it to create a Pod.** The loop noticed the gap and closed it — that is *self-healing*, for free.
- **The same loop runs for every kind.** Deployment, Job, PVC, and later your own operators (S21) and GitOps (S22) all reconcile this way.
- **It never stops.** Delete a Pod by hand and it comes back — the loop is always watching, comparing, converging.

</v-clicks>
</div>

<!--
Speaker: this is the reusable reconciliation animation (built here first, US-X1;
S21/S22 reuse the ReconcileLoop component with a different controller label).
Click through: Observe (a Pod was lost) → Diff (desired 3 ≠ observed 2) → Act
(create 1) → Repeat (in sync, keep watching). Land the line: `apply` doesn't act,
it declares; the loop acts. NOTE: keep ReconcileLoop parameterised (controller/
resource props) so S21/S22 can reuse it unchanged.
-->

---
layout: code-annotated
heading: 'Spec is what you want. Status is what is.'
lab: labs/day-1/03-cluster-tour.md
---

```yaml {none|2-4|6-9}
kind: Pod
spec:                     # DESIRED — you write this
  containers:
    - image: nginx:1.29
status:                   # OBSERVED — the system writes this
  phase: Running
  podIP: 10.244.1.7
  conditions: [...]
```

::notes::

<CodeNote at="1" label="spec — desired state">
The half <strong>you</strong> author and submit. It says what should be true. The
API server validates it and stores it in etcd, untouched by the cluster.
</CodeNote>

<CodeNote at="2" label="status — observed state" variant="ok">
The half the <strong>system</strong> writes. Controllers and the kubelet report
what is <em>actually</em> true here. You read it; you don't set it. Reconciliation
is just closing the gap between these two blocks.
</CodeNote>

<!--
Speaker: `kubectl get pod -o yaml` on any live object shows both blocks — the lab
has them find spec vs status on a real Pod. "Reconciliation = drive status toward
spec" is the sentence to leave them with. The lab (labs/day-1/03-cluster-tour.md)
tours a real cluster and points at both halves.
-->

---
layout: lab
lab: labs/day-1/03-cluster-tour.md
duration: 20 min
env: namespace ✓ (read-only alt) / kind ✓
---

## Lab 03 — Cluster tour

- **Nodes:** `kubectl get nodes -o wide` — read the OS, kernel, and **runtime** columns
- **Schema:** `kubectl api-resources` and `kubectl explain pod.spec` — the API is self-documenting
- **Components:** list the control-plane Pods (kind) or describe your namespace (shared)
- **Break it on purpose:** `kubectl explain pod.spce` → typo error → fix it
- **Spec vs status:** get one live object `-o yaml` and point at both halves
