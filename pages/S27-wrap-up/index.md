---
layout: section-cover
image: /covers/section-27-sailing-on.png
day: Day 3
section: '27'
tier: core
track: Wrap
---

# Wrap-up & next steps

One red line, a dozen layers — and a map of where to go from here.

**core** · suggested Day 3 · Wrap track

<!--
Section S27 — Wrap-up & next steps. Slides-only (no lab). Timing: ~20 min.
Outcome: learners leave with a coherent mental model (the red line + every layer that hung off
it) and a concrete, vendor-neutral path forward (docs, community learning, playgrounds, and
CKAD/CKA as an OPTIONAL goal).
Beats: bookend S00's promise · recap the red-line spine (Pod → Deployment → Service → Ingress →
Gateway API + layered concepts) · recap the Day-2/3 layers · CKAD/CKA alignment table (framed as
a DESIGN CHECK, not exam prep — the explicit design-check artifact) · what we skipped & where it
lives (service mesh / multi-cluster / admin-ops — pointers only) · free-resource map (official +
community + playgrounds, NO vendor endorsement) · CKAD/CKA as an optional downstream step +
feedback/contribution · closing.
Guardrail: NO vendor endorsement on the resource-map slide; name official/community/category, not
a commercial product. This is the LAST section — the final slide is a closing statement, NOT a lab
handoff (there is no lab).
CKx tie-in: the CKAD/CKA alignment table IS the design-check artifact.
-->

---
layout: statement
kicker: Where we started, where we are
---

Three days ago the question was **"what is a container?"** Now you can **author, run, and operate** core Kubernetes workloads — and read the ones you didn't write.

The whole course was **one red line** with everything else hung off it. Let's redraw it, name what layered on, and point at where to go next.

<!--
Speaker: bookend S00's "Why we're here" beat — the 50/50 promise was to take them from "what is a
container" to confidently authoring/running/operating workloads. Land that it's now true: they
built the spine one manifest at a time and layered config, storage, health, security, and delivery
on top. This section is a recap + a map, not new content — breathe, zoom out, then send them off.
-->

---
layout: recap
heading: 'The red line — one manifest that grew all week'
story: 'A single Pod became a Deployment, got a stable Service address, was exposed through Ingress, then modernised to the Gateway API — each step extended the same manifest, so the through-line was always visible.'
---

<div class="flex items-center gap-3 text-lg mt-2">
  <K8sIcon kind="pod" /> <strong>Pod</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="deploy" /> <strong>Deployment</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="svc" /> <strong>Service</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="ing" /> <strong>Ingress</strong> <span class="kw-muted">→</span>
  <span class="text-2xl">🚪</span> <strong>Gateway API</strong>
</div>

- **Pod** (S05) the smallest deployable unit → **Deployment** (S06) self-heals & rolls out → **Service** (S07) a stable address for moving Pods → **Ingress** (S08) HTTP from outside → **Gateway API** (S09) the modern, role-oriented successor
- Hung off that spine: **ConfigMap/Secret** (S10), **storage** (S11) & **StatefulSet** (S12), **resources** (S13), **health probes** (S14), **Jobs/CronJobs** (S15), **autoscaling** (S16)
- The one idea under all of it: **declare desired state; a controller reconciles reality to match** (S03)

<!--
Speaker: walk the icons left to right — this is the spine every learner watched grow in the footer
progress bar. Each resource EXTENDED the previous manifest (pod.yaml → deployment.yaml → +service
→ +ingress → gateway), which is why it reads as one line, not five topics. Then name the layers
that attached to the running workload: config/secrets, storage + stateful identity, resource
requests/limits, the three probes, batch, and HPA. Close on S03's reconciliation loop — the single
mental model that makes all of it one idea, and the loop they met a third time in GitOps/operators.
-->

---
layout: agenda
kicker: Everything that layered on
heading: 'Days 2–3 — operate it like production'
columns: 2
---

- **Security foundations** — small non-root images (S02), Pod security & PSS (S17), a controlled **pod escape** blocked by `restricted` (S25)
- **Network & identity** — **NetworkPolicy** default-deny (S18), **RBAC** least-privilege identities (S19)
- **Packaging & delivery** — **Helm** templated releases (S20), **GitOps** with Argo CD reconciling from Git (S21)
- **Extending Kubernetes** — the **operator pattern** (S22), the **Prometheus Operator** for observability (S23), building one with **kubebuilder** (S24)
- **Production readiness** — the **best-practices capstone** (S26): probes, PDBs, digests, NetworkPolicy, graceful shutdown, as one checklist

<div class="mt-4 kw-muted text-sm" v-click>

Same reconciliation loop, three times over: built-in controllers (S03), **Git** as desired state (S21), and **your own CRD** as desired state (S22).

</div>

<!--
Speaker: this is the "look how far you came" slide — the red line was Day 1; Days 2–3 made it
operable and safe. Group the layers so it's five ideas, not a dozen: security (image → pod → the
escape demo that proved why restricted matters), network+identity (netpol + rbac), delivery
(helm + gitops), extension (operators + prometheus + kubebuilder), and the capstone that ties it
all into one reviewable checklist. Callback the loop-three-times motif — it's the single most
reusable thing they learned. Note S24 (kubebuilder) is the optional deep-dive for those who want
to BUILD an operator, not just consume one.
-->

---

<span class="kw-kicker">A design check, not exam prep</span>

# The CKAD/CKA domains are really a **design checklist**

<div class="text-xs mt-2">

| Exam domain | Where it lives in this workshop |
| --- | --- |
| **CKAD** · Application design & build | Containers & images (S01), Pod lifecycle (S05), Jobs/CronJobs (S15) |
| **CKAD** · Application deployment | Deployments & rollouts (S06), Helm (S20), GitOps (S21) |
| **CKAD** · Observability & maintenance | Probes (S14), resources (S13), Prometheus Operator (S23) |
| **CKAD/CKA** · Config & security | ConfigMap/Secret (S10), Pod security & PSS (S17), RBAC (S19), image hygiene (S02) |
| **CKAD/CKA** · Services & networking | Service (S07), Ingress (S08), Gateway API (S09), NetworkPolicy (S18) |
| **CKA** · Cluster architecture | Control plane & reconciliation (S03), kubectl (S04), RBAC (S19) |
| **CKA** · Storage | PV/PVC/StorageClass (S11), StatefulSet volumes (S12) |
| **CKA** · Troubleshooting | Every lab's deliberate **break → fix** step |

</div>

<div class="mt-2 kw-muted text-xs" v-click>

Read it top-down as *"can my workload answer each of these?"* — not as a syllabus to cram.

</div>

<!--
Speaker: frame this carefully — it is NOT "here's how to pass the exam". The certification domains
happen to be a well-organised production-readiness checklist, and this workshop covered nearly all
of it by teaching design, not test-taking. Point out troubleshooting is the one domain you can't
slide-teach — which is exactly why every single lab had a break→fix. If someone wants the cert, the
map shows they've already met the material; the next step is timed practice, not new concepts.
-->

---

<span class="kw-kicker">Honest about the edges</span>

# What we skipped — and where it lives

<div class="kw-cols-3 mt-4 text-sm">
  <KwCard heading="Service mesh" icon="🕸️">
    mTLS, traffic-splitting, and L7 policy across services. The Gateway API (S09)
    is the on-ramp; a mesh is the next layer when service-to-service security and
    fine-grained routing become the problem.
  </KwCard>
  <KwCard heading="Multi-cluster & scale" icon="🌍">
    Federation, fleet management, and cross-region delivery. GitOps (S21) is the
    foundation the multi-cluster tooling builds on.
  </KwCard>
  <KwCard heading="Cluster operations" icon="🛠️" variant="plain">
    Running the control plane itself: upgrades, etcd backup/restore, node
    lifecycle, capacity. A whole <strong>admin/operations track</strong> of its
    own — this workshop was the <em>workload</em> side.
  </KwCard>
</div>

<div class="mt-5 kw-muted text-sm" v-click>

These are pointers, not gaps to fix today — each is a deliberate next course, and each stands on something you already built here.

</div>

<!--
Speaker: be honest that a 3-day workshop can't cover everything, and name the big omissions so
nobody thinks they're done-done. Service mesh (this taught workloads + Gateway API, not mTLS
meshing); multi-cluster/fleet (single-cluster here, but GitOps is the primitive it's built on);
and cluster administration — the CKA "install & configure the control plane" world, which is a
separate discipline from authoring workloads. Frame each as "you already have the foundation for
this", so it reads as a map forward, not a confession of holes.
-->

---

<span class="kw-kicker">Where to go next · free & vendor-neutral</span>

# A map for the next 90 days

<div class="kw-cols-3 mt-4 text-sm">
  <KwCard heading="Read the source of truth" icon="📚">
    The <strong>official Kubernetes documentation</strong> — Concepts, Tasks, and
    the interactive Tutorials. The <code>kubectl explain</code> habit (S04) is the
    docs in your terminal.
  </KwCard>
  <KwCard heading="Structured learning" icon="🧭">
    <strong>CNCF / Linux Foundation</strong> community training and the
    project-run learning paths — vendor-neutral, and the same bodies behind the
    CKAD/CKA.
  </KwCard>
  <KwCard heading="Break things safely" icon="🧪" variant="plain">
    Browser-based <strong>playgrounds</strong> and a local <strong>kind</strong>
    cluster — the same throwaway environment from every lab. Keep the
    break → fix habit going.
  </KwCard>
</div>

<div class="mt-5 text-sm" v-click>

The highest-leverage next step isn't a course — it's **running a real workload through the S26 checklist**. This whole deck and its labs are yours to keep and re-run.

</div>

<!--
Speaker: GUARDRAIL — keep this vendor-neutral. Name categories and the official/community sources,
never promote a specific commercial product or paid platform. Three buckets: (1) the official docs
are genuinely the best reference, and kubectl explain is those docs offline; (2) CNCF / Linux
Foundation community training and project learning paths are free and neutral; (3) hands-on
playgrounds + their own kind cluster to keep practising. Land the real advice: the best next move
is applying the capstone checklist to something they actually run — the deck + labs are open and
theirs to keep.
-->

---
layout: comparison
heading: 'CKAD / CKA — an optional goal, not the point'
leftHeading: 'If a certification helps you'
rightHeading: 'If it does not'
leftBadge: optional
rightBadge: also fine
---

- A **deadline and a syllabus** can be motivating — and you've already met most of the material (see the map).
- The gap to close is **speed under time pressure**, not new concepts: timed practice, `kubectl` fluency (S04), and the docs you're allowed to use in the exam.
- **CKAD** leans to authoring workloads; **CKA** adds cluster administration (the operations track we flagged).

::right::

- The skills are the goal; the badge is optional. Nothing here needs a cert to be useful.
- **Operating a real service well** — probes, limits, least privilege, GitOps, a checklist you enforce — is worth more than any exam.
- Come back to the labs whenever you hit a topic for real; they're built to re-run.

<!--
Speaker: defuse cert-anxiety. Position CKAD/CKA as ONE optional path, not the destination — some
people are motivated by a goal and a date, and that's fine; others don't need it, also fine. The
honest technical point: they already have the concepts (the alignment table proves it), so the
only real prep gap is timed speed and kubectl muscle memory, both practice not learning. CKAD =
workload author; CKA = + cluster admin. Either way the transferable win is operating real workloads well.
-->

---
layout: statement
kicker: This is an open workshop — make it better
---

# Thank you — now go break things (safely)

You started at *"what is a container"* and you can now **author, run, secure, deliver, and operate** Kubernetes workloads. That was the whole promise.

<div class="mt-4 text-sm">

- **Feedback & contributions welcome** — this deck and its labs are **open source**. Open an issue or a PR: a confusing step, a better break→fix, a section you'd add.
- **Keep the rhythm:** explain → run → **observe → break it → fix it** → recap. It works outside this room too.
- **Everything is yours to keep** — the slides, every lab, and the S26 production checklist.

</div>

<div class="mt-5 kw-muted">See you in the reconcile loop. 🚀</div>

<!--
Speaker: the close. Restate the S00 promise as delivered — container-novice to workload-operator in
three days. Invite real contribution: it's an open-source, vendor-neutral workshop, and the best
improvements come from learners who just hit the rough edges (name concrete invitations — a
confusing step, a better break→fix, a missing section). Send them off with the teaching rhythm as a
portable habit and the reminder that the whole kit is theirs. End warm — no lab handoff, this is the
final slide of the course.
-->
