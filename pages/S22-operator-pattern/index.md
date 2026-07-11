---
layout: section-cover
image: /covers/section-22-tireless-owl.png
day: Day 3
section: '22'
tier: recommended
track: Operators
---

# The operator pattern

Encode operational knowledge behind your own API: a CRD plus a controller.

**recommended** · suggested Day 3 · Operators track

<!--
Section S22 — The operator pattern. Recommended, Day 3, Operators track.
Timing: ~25 min slides + 15 min lab.
Outcome: learners can define "operator = CRD (extends the API) + custom controller (the
reconcile loop)"; distinguish a plain controller (reconciles built-in objects) from an
operator (packages domain/operational knowledge behind a CRD); read a CRD + a sample CR +
conceptual reconcile pseudo-code; place a project on the CNCF Capability Levels (1 Basic
Install → 5 Auto Pilot); and, in the lab, install cert-manager (a no-code operator),
inspect its CRDs, create an Issuer + Certificate, and watch the controller reconcile them
into a Secret — deleting the Secret to watch the loop recreate it.
Beats: problem (some ops tasks — backup, failover, upgrades — can't be a built-in
resource) · recap the S03 control loop (observe → diff → act) as the foundation · mental
model (CRD + custom controller = operator) · code-annotated (a raw CRD registers a new
kind) · magic-move (CRD definition → sample CR → conceptual reconcile pseudo-code acting
on it) · controller vs operator (operator = encoded operational knowledge) · CNCF
Capability Levels 1→5 (conceptual, NO vendor names) · reconcile-loop animation driving a
custom resource (reuse ReconcileLoop) · recap → lab.

Animation: REUSE ReconcileLoop (US-X1, built in S03; S21 reuses it for GitOps). Here pass
controller="Backup operator", resource="Backup", desired=1, desiredSource="spec (your CR)",
observedSource="cluster". This is the reuse guardrail: an operator's controller IS the S03
loop, watching a CUSTOM resource instead of a built-in one. No new component.

ILLUSTRATIVE vs LAB (post-red-line, per outline): the slide magic-move teaches with a
clean illustrative `Backup`/`Database` CRD so the pattern is obvious; the LAB uses concrete
cert-manager (Issuer/Certificate/Secret). Byte-for-byte parity is NOT required here (this
is a conceptual section, not a Day-1 red-line resource).

ACCURACY LOCKS (web-verified 2026-07-10):
- CRD = apiextensions.k8s.io/v1, kind CustomResourceDefinition. Registers a new
  group/version/kind + scope (Namespaced/Cluster) + an OpenAPI v3 schema; kubectl then
  treats the new kind like any built-in (get/describe/explain/-w).
- Operator = CRD (extends the API) + a custom controller (runs the reconcile loop over
  instances of that CRD). A plain controller reconciles BUILT-IN objects (ReplicaSet →
  Pods); an operator packages domain/day-2 knowledge (backup, failover, upgrade) behind a
  CRD, so a human declares intent and the controller executes the runbook.
- CNCF Operator "Capability Levels" (from the Operator Framework / operatorhub maturity
  model): L1 Basic Install · L2 Seamless Upgrades · L3 Full Lifecycle · L4 Deep Insights ·
  L5 Auto Pilot. Conceptual only — NO vendor/product names (guardrail).
- Lab uses cert-manager v1.21.0 (current stable, verified). It is a no-code operator: the
  Certificate controller reconciles a Certificate CR into a Secret and RECREATES the Secret
  if deleted (the reconcile loop). NOTE: the Secret does NOT carry an ownerReference by
  default (--enable-certificate-owner-ref defaults to false) — recreation is the LOOP, not
  GC. The slide does not claim otherwise.
CKx tie-in: CRDs/operators are CKA *extension* topics (cluster architecture / API
extension) — a one-liner on the recap; not a hard CKAD domain.
-->

---
layout: statement
kicker: The problem
---

Some operational jobs — **back up this database, fail it over, upgrade it in place** — can't be expressed by any built-in resource.

A `Deployment` keeps *N* replicas of a stateless Pod running. But *"take a consistent backup every night, and restore from the latest one if the primary dies"* isn't a field on any built-in kind — it's a **runbook**: a sequence of steps that needs **domain knowledge** about *this* piece of software. You could run that runbook by hand, or bury it in a CI pipeline — but then nothing is **continuously** making the cluster match your intent. What if you could teach the cluster the runbook, declare *"I want a backup"*, and let a **loop** carry it out?

<!--
Speaker: the "why operators exist" beat. Built-in resources cover generic patterns:
Deployment = keep N stateless replicas; StatefulSet = ordered stateful Pods with stable
identity; Job = run to completion. But day-2 operations for a SPECIFIC system — a
database's backup/restore/failover, a message broker's rebalancing, a certificate's
renewal — encode expertise that no generic controller has. Today you'd write a runbook and
run it by hand (error-prone, not continuous) or script it in CI (fire-and-forget, no drift
correction — exactly the S21 GitOps complaint one level down). The operator idea: capture
that expertise IN a controller, expose intent as a new API resource, and let the reconcile
loop run the runbook forever. Next: recall the loop that makes this possible.
-->

---

<span class="kw-kicker">Recall from the mental model · the one loop everything runs on</span>

# The control loop is the foundation: observe → diff → act

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="What you already know" kind="deploy" variant="ok">
      A built-in controller watches a resource, compares <strong>desired</strong>
      (<code>spec</code>) against <strong>observed</strong> (the real world), and acts to
      close the gap — then repeats, forever. Delete a Pod and the ReplicaSet remakes it.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="The leap" icon="💡" variant="ok">
      Nothing about that loop is special to <em>Pods</em>. Point the same
      <strong>observe → diff → act</strong> at a resource <strong>you invented</strong>,
      and put <em>your</em> operational knowledge in the "act" step. That's an operator.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

**Kubernetes is already a platform of reconcile loops** — S03 taught the shape, S21 reused
it with **Git** in the desired slot. This section reuses it a third time with **your own
resource** in the desired slot. Same loop; new state to reconcile.

</div>

<!--
Speaker: anchor hard on S03. The reconciliation loop — observe desired vs observed, diff,
act to converge, repeat — is THE Kubernetes idea. Built-in controllers apply it to
built-in kinds (ReplicaSet→Pods, Deployment→ReplicaSets). The whole trick of the operator
pattern is that the loop is kind-agnostic: give Kubernetes a new kind and a controller that
runs observe→diff→act over instances of it, and you've extended the platform. Point back to
S21: GitOps was the same loop with Git as the desired state. Now it's the same loop with a
custom resource as the desired state. Repetition is the pedagogy — this is the third time
they meet this loop, and that's the point. Next: name the two ingredients precisely.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · two ingredients, one word</span>

# Operator = **CRD** (extends the API) + **custom controller** (the loop)

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="CRD — extend the API" kind="crd" variant="ok">
      A <strong>CustomResourceDefinition</strong> registers a brand-new
      <code>kind</code> (say <code>Backup</code>) with its own schema. After it's applied,
      <code>kubectl get backup</code> works exactly like <code>kubectl get pod</code> — the
      API server stores and validates your resource like any built-in.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Custom controller — run the loop" icon="⚙️" variant="ok">
      A Pod running in the cluster that <strong>watches</strong> instances of that kind and
      <strong>reconciles</strong> them: observe the CR's <code>spec</code>, diff against the
      world, and <strong>act</strong> — using the domain knowledge you coded in.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the definition to remember</span>

**A CRD without a controller is just inert data** — the API server stores your `Backup`
objects but nothing ever *happens*. **A controller without a CRD** is just a plain
controller over built-in kinds. **Together**, they're an **operator**: a new API *plus* the
software that makes it real.

</div>

</div>

<!--
Speaker: the load-bearing slide — say the equation and make them repeat it. CRD =
CustomResourceDefinition = the API extension: it teaches the API server a new kind
(group/version/kind + schema + scope). Once registered, your kind is a first-class citizen:
kubectl get/describe/explain/-w, RBAC, etcd storage, admission — all free. But a CRD is
PASSIVE; it only stores data. The custom controller is the ACTIVE half: a Pod (usually a
Deployment) that watches your CRs and runs observe→diff→act on them, with your operational
logic in "act." Neither alone is an operator: CRD-only = inert data; controller-only over
built-ins = a plain controller. Operator = both. The lab makes this concrete: cert-manager
IS a CRD (Certificate) + a controller Pod that reconciles Certificates into Secrets. Next:
what a CRD actually looks like.
-->

---
layout: code-annotated
heading: 'A CRD teaches the API server a new kind'
compact: true
lab: labs/day-3/22-operator-concept.md
---

```yaml {none|3-6|7-9|10-16|all}
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.example.com          # <plural>.<group>
spec:
  group: example.com
  names:
    kind: Backup                      # the new kind you can `kubectl get`
    plural: backups
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:                         # OpenAPI v3 — validates every Backup you apply
        openAPIV3Schema: { type: object, properties: { spec: { type: object } } }
```

::notes::

<CodeNote at="1" label="name = plural.group" variant="ok">
The CRD's own name must be <code>&lt;plural&gt;.&lt;group&gt;</code>. This registers the
resource path <code>/apis/example.com/v1/backups</code> in the API server.
</CodeNote>

<CodeNote at="2" label="names + scope" variant="ok">
<code>names.kind</code> is what you'll type (<code>Backup</code>); <code>scope</code> decides
whether instances live <strong>in a namespace</strong> or are cluster-wide — just like
built-in kinds.
</CodeNote>

<CodeNote at="3" label="versions[].schema" variant="warn">
Each version carries an <strong>OpenAPI v3 schema</strong>. The API server uses it to
<strong>validate and store</strong> your resource — so a malformed <code>Backup</code> is
rejected at <code>apply</code> time, no controller needed.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
Apply this and <code>kubectl get backup</code>, <code>kubectl explain backup.spec</code>,
and <code>-w</code> all light up — but nothing <em>reconciles</em> a <code>Backup</code>
yet. The CRD is the API; the controller is still missing.
</div>

<!--
Speaker: this is the API-extension half made concrete. A CustomResourceDefinition is itself
a built-in resource (apiextensions.k8s.io/v1) whose job is to register ANOTHER kind. Walk
the highlights: name must be plural.group (it's a discovery path, not arbitrary); group +
versions + names.kind define the new API surface; scope = Namespaced or Cluster; the
openAPIV3Schema is what makes kubectl explain work and what validates/rejects bad specs at
apply time. The punchline (click 4): after applying JUST the CRD, all the kubectl verbs
work — get, describe, explain, watch — but nothing HAPPENS to a Backup, because there's no
controller. That's the setup for the magic-move: CRD → an instance → the loop that acts on
it. (Schema trimmed for the slide; real CRDs spell out spec fields.) Next: build all three.
-->

---
layout: code-walkthrough
heading: 'From API to intent to action, in three frames'
lab: labs/day-3/22-operator-concept.md
---

````md magic-move
```yaml
# 1 — THE CRD: register a new kind (the API extension)
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.example.com
spec:
  group: example.com
  names: { kind: Backup, plural: backups }
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                database: { type: string }   # which DB to back up
                schedule: { type: string }   # cron-ish intent
```

```yaml
# 2 — A CUSTOM RESOURCE: one instance = your declared intent
apiVersion: example.com/v1
kind: Backup
metadata:
  name: nightly-orders
  labels: { app: s22 }
spec:
  database: orders            # DESIRED state, in YOUR words
  schedule: "0 2 * * *"       # "back up orders, nightly at 02:00"
```

```yaml
# 3 — THE CONTROLLER (pseudo-code): observe → diff → act, forever
for each Backup cr in watch("example.com/v1", "Backup"):
    desired  = cr.spec                       # observe intent
    observed = find_snapshots(cr.spec.database)

    if not due(cr.spec.schedule, observed):  # diff
        continue

    snapshot = take_snapshot(cr.spec.database)   # ACT — encoded domain knowledge
    upload(snapshot); prune_old(observed)

    cr.status.lastBackup = now()             # report state back onto the CR
    cr.status.conditions = [{type: "Ready", status: "True"}]
```
````

<!--
Speaker: THE core slide — three frames, three ideas. Frame 1: the CRD, the API extension
(now with real spec fields — database + schedule — so the schema means something). Frame 2:
a single Backup instance — this is a user DECLARING INTENT in domain terms ("back up the
orders DB nightly"); it's just YAML you kubectl apply, and it's the DESIRED state. Frame 3:
the controller as pseudo-code, and deliberately in the SAME observe→diff→act shape as S03:
watch Backup objects → read spec (observe intent) → check what snapshots exist (observe
world) → diff (is a backup due?) → ACT (take/upload/prune — THIS is the encoded operational
knowledge, the runbook a human used to run) → write status back onto the CR so `kubectl get
backup` shows Ready and lastBackup. Land it: frames 1+3 together are the operator; frame 2
is what a user does with it. The lab swaps this illustrative Backup for real cert-manager,
but the shape is identical. Next: why isn't a plain controller already an operator?
-->

---
layout: comparison
heading: 'Same loop — the difference is what it knows'
leftHeading: 'Plain controller'
leftBadge: 'built-in'
rightHeading: 'Operator'
rightBadge: 'built-in + domain'
---

Reconciles **built-in** objects with **generic** logic:

- ReplicaSet controller → keep *N* Pods
- Deployment controller → roll ReplicaSets
- Job controller → run Pods to completion

The "act" step is **general-purpose** — *make N of a thing*. It knows nothing about *your*
database, broker, or certificates.

<div class="mt-3 text-sm kw-muted">Ships <strong>with</strong> Kubernetes. No new API.</div>

::right::

Reconciles a **CRD you defined**, with **domain** logic:

- `Backup` controller → snapshot, upload, prune, restore-on-failover
- A cert controller → issue, store, and **renew** certificates
- A DB controller → seed, fail over, run version upgrades

The "act" step is a **runbook** — the day-2 expertise a human operator used to carry, now
**encoded** and run continuously.

<div class="mt-3 text-sm kw-muted">Ships <strong>as software you install</strong>. New API + new behaviour.</div>

<!--
Speaker: the distinction the lab's required question hangs on ("what makes this an operator
and not just a controller?"). Both are the SAME reconcile loop — that's the point, don't let
them think an operator is a new mechanism. The difference is entirely in two places: (1) WHAT
it reconciles — a plain controller drives built-in kinds; an operator drives a CRD you added;
(2) WHAT'S IN "act" — a plain controller's act is generic ("make N replicas"); an operator's
act is a domain runbook (take a consistent DB snapshot; fail over to a replica; renew a cert
before expiry). The phrase to leave them with: an operator is OPERATIONAL KNOWLEDGE ENCODED
behind an API. A plain controller has no opinion about your software; an operator IS the
opinion. cert-manager (the lab) is the clean example: nobody could express "keep this TLS
cert valid, renewing before it expires" with built-in kinds — that expertise lives in the
cert-manager controller, exposed as the Certificate CRD. Next: how "mature" can an operator be?
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">CNCF capability levels · how much can it do for you?</span>

# Operators come in maturity levels: Basic Install → Auto Pilot

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.6rem;">
  <v-click at="1">
    <KwCard heading="L1 · Basic Install" icon="📦" variant="ok">
      Provisions the app from a CR. You declare it; the operator stands it up.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="L2 · Seamless Upgrades" icon="⬆️" variant="ok">
      Upgrades the app <em>and itself</em> without hand-holding or downtime surprises.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="L3 · Full Lifecycle" icon="🔁" variant="ok">
      Day-2 ops: backups, restores, failover, scaling — the runbook, automated.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="L4 · Deep Insights" icon="📈" variant="ok">
      Ships metrics, alerts, and health so the app explains itself.
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="L5 · Auto Pilot" icon="🛰️" variant="ok">
      Auto-scales, auto-tunes, auto-remediates, auto-schedules — hands off.
    </KwCard>
  </v-click>
</div>

<div v-click="6" class="mt-4 text-sm kw-muted">

The ladder answers *how much operational knowledge is encoded.* L1 just installs; L5 runs
the system so you don't have to. Most real operators sit around **L2–L3** — and that's
often plenty. **More levels = more of the runbook moved from your head into the loop.**

</div>

</div>

<!--
Speaker: the CNCF Operator Capability Levels (from the Operator Framework maturity model) —
a conceptual yardstick for "how much does this operator actually do?" Five rungs: L1 Basic
Install (provision from a CR); L2 Seamless Upgrades (upgrade the workload AND the operator
itself cleanly); L3 Full Lifecycle (day-2: backup/restore, failover, scaling — the runbook);
L4 Deep Insights (metrics, alerts, workload+operator observability); L5 Auto Pilot
(auto-scaling/tuning/remediation — the system runs itself). Frame it as a spectrum of
ENCODED KNOWLEDGE, not a quality score: a great L1 operator can be exactly right for a
simple app. Reality check: most production operators live at L2–L3; L5 is rare and
hard-won. GUARDRAIL: keep this vendor-neutral — describe the levels, name NO products, even
though learners will know examples. Next: watch the loop drive a custom resource, then the lab.
-->

---

<span class="kw-kicker">The one loop everything runs on — a third time, with your CR</span>

# An operator is reconciliation with **your resource** as `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" :desired="1" controller="Backup operator" resource="Backup" desiredSource="spec (your CR)" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **You applied a `Backup` CR; the operator observes it.** Desired = 1 backup for today; observed = 0. That's the gap — exactly S03, but the kind is *yours*.
- **Diff → act.** The controller runs its runbook: take the snapshot, upload it, prune old ones. Nobody ran a script by hand — the loop did.
- **It never stops.** Delete the resulting artefact and the loop notices the gap and remakes it. In the lab you'll delete a cert-manager **Secret** and watch it reappear.

</v-clicks>
</div>

<!--
Speaker: the SAME ReconcileLoop component from S03/S21 (reuse guardrail — no new animation),
now with a CUSTOM resource in the desired slot: controller="Backup operator",
resource="Backup", desired=1, desiredSource="spec (your CR)", observedSource="cluster". So
it reads "desired 1, observed 0 → create 1 Backup." Click through: Observe (your CR wants a
backup today; none exists) → Diff (desired 1 ≠ observed 0) → Act (run the runbook — snapshot,
upload, prune) → Repeat (in sync, keep watching, remake anything that vanishes). Land the
through-line out loud: S03 = built-in loop; S21 = same loop with Git; S22 = same loop with
YOUR CRD. One mechanism, three desired-state sources. Forward pointer straight into the lab:
cert-manager is exactly this — its controller reconciles a Certificate into a Secret, and if
you delete the Secret the loop recreates it. Next: recap, then go feel it.
-->

---
layout: recap
heading: 'Recap — extend the API, then let the loop run your runbook'
story: 'Some day-2 jobs — backup, failover, upgrade — aren''t any built-in kind; they''re a runbook that needs domain knowledge. An operator captures that: a CRD extends the API with a new kind, and a custom controller runs the S03 reconcile loop over instances of it, with your operational expertise in the "act" step. Same loop as S03 and S21 — new desired state.'
next: 'S23 · A production operator in the wild — the same pattern, shipped and battle-tested'
---

- **Why operators exist:** built-in kinds cover generic patterns; **domain runbooks**
  (backup, failover, upgrade) need encoded expertise a generic controller doesn't have
- **The equation:** **operator = CRD** (extends the API with a new `kind` + schema) **+
  custom controller** (a Pod running the observe → diff → act loop over your CRs)
- **CRD alone = inert data; controller-over-built-ins = a plain controller** — you need
  **both**, and *your* knowledge in the **act** step
- **Controller vs operator:** same loop; the operator reconciles a **CRD you defined** with
  **domain logic** — *operational knowledge encoded behind an API*
- **Maturity is a spectrum:** CNCF **capability levels L1 Basic Install → L5 Auto Pilot**;
  more levels = more of the runbook moved into the loop
- **CKx tie-in:** CRDs/operators are CKA **extension** topics (API extension / cluster
  architecture), not a hard CKAD domain — but the reconcile loop is core

<!--
Speaker: tie the bow. The problem: day-2 operational tasks aren't built-in resources —
they're runbooks needing domain expertise. The answer: operator = CRD (new API) + custom
controller (the reconcile loop with your runbook in "act"). Four facts to leave them with:
(1) the equation, and that BOTH halves are required (CRD-only is inert, controller-over-
built-ins is just a plain controller); (2) the controller-vs-operator distinction = encoded
operational knowledge, not a new mechanism; (3) the capability-level spectrum L1→L5 as "how
much runbook is automated"; (4) it's the S03 loop a third time (after S21's GitOps) — one
mechanism, three desired-state sources. Hand to Lab 22: install cert-manager (a real no-code
operator), inspect its CRDs with get crd / explain, create a self-signed Issuer + a
Certificate, watch the controller reconcile them into a Secret, then delete the Secret and
watch the loop put it back — the operator pattern you can see in ~15 minutes.
-->

---
layout: lab
lab: labs/day-3/22-operator-concept.md
duration: 15 min
env: namespace ✓ (read-only) / kind ✓ (self-install)
---

## Lab 22 — Meet a real operator

- Install **cert-manager** (a no-code operator: CRDs + a controller) and inspect its CRDs with `kubectl get crd` / `kubectl explain`
- Create a self-signed **`Issuer`** and a **`Certificate`**; watch the controller reconcile them into a **`Secret`** (`kubectl get certificate,secret -w`)
- Read the CR's **`.status`** (`Ready=True`) — the controller reporting back
- **Break→fix:** `kubectl delete secret …` → the controller **recreates it** (the reconcile loop, *not* garbage collection)
- Answer: *what makes this an operator and not just a controller?* → **encoded operational knowledge behind a CRD**
