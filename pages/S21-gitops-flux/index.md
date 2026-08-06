---
layout: section-cover
image: /covers/section-21-oracle-lighthouse.png
day: Day 3
section: '21'
tier: recommended
track: Delivery
---

# GitOps with Flux

Drive desired state from Git; understand reconcile, prune, suspend, and drift.

**recommended** · suggested Day 3 · Delivery track

<!--
Section S21 — GitOps with Flux (facilitator-selected variant). Recommended, Day 3,
Delivery track. Timing: ~30 min slides + 25 min lab (same slot as the Argo CD variant —
net-zero schedule; leave the manifest minute budgets untouched).
Outcome: learners can explain pull-based GitOps, read/author Flux `GitRepository` +
`Kustomization` (and recognize `HelmRelease`), and predict reconcile / prune / suspend
behaviour — then feel it in the Flux lab (install Flux, apply sources, watch Ready,
drift by hand, prove suspend leaves drift).
Beats: problem (push-based apply has no drift detection) · mental model (pull-based) ·
GitRepository (code-annotated) · three behaviours (reconcile / drift / prune+suspend) ·
magic-move building Kustomization / HelmRelease · ReconcileLoop with controller="Flux" ·
status/conditions · OpenGitOps four principles with mirrored tool callout (Argo CD as
the alternative) · recap → S22 · lab.

Animation: REUSE ReconcileLoop (US-X1, built in S03) — pass controller="Flux",
resource="replica", desiredSource="Git". Same reuse guardrail as the Argo CD variant.

ACCURACY LOCKS (verified against Flux v2 / GitOps Toolkit docs, 2026-08-06):
- Install: CLI first (`brew install fluxcd/tap/flux` or https://fluxcd.io/install.sh).
  Recommended cluster path: `flux bootstrap` (installs controllers, pushes manifests,
  configures Flux to update itself from Git). Kind / workshop path: `flux install`
  (dev install — controllers only, no bootstrap Git sync) or
  `kubectl apply -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml`.
- Core CRD API groups: GitRepository → `source.toolkit.fluxcd.io/v1`;
  Kustomization → `kustomize.toolkit.fluxcd.io/v1`;
  HelmRelease → `helm.toolkit.fluxcd.io/v2`.
- Kustomization: `.spec.interval` (required) schedules reconcile + drift correction;
  `.spec.prune` (required bool) garbage-collects objects removed from Git;
  `.spec.suspend` pauses apply and drift correction (the selfHeal:false analog —
  Flux has no separate selfHeal flag; active reconcile *is* the heal).
- Conditions: kstatus-compatible `Ready` / `Reconciling` / `Stalled` on sources and
  Kustomizations; read with `flux get …` / `kubectl get gitrepository,kustomization`.
- CLI verbs used on-slide: `flux install`, `flux get`, `flux reconcile`,
  `flux suspend`. Speaker-notes-only: `flux bootstrap` (production install path)
  and `flux resume` (undo suspend) — never shown to learners on a slide.
- Demo source on-slide: public `stefanprodan/podinfo` (Flux docs example) — hostless,
  kind-friendly. Writable-repo stretch stays a fork, same honesty as the Argo lab.

ACCURACY LOCKS — tool landscape callout (verified 2026-08-06, slow-moving facts only):
- CNCF graduation: **Argo** (umbrella — Argo CD, Workflows, Rollouts, Events;
  graduated 2022) and **Flux** (graduated 2022) are both CNCF-graduated. Argo CD alone
  is NOT the graduated entity — never claim "Argo CD is CNCF-graduated" on-slide.
- Positioning axes (UI vs composability, multi-tenancy, scale) stay OFF the slide —
  contestable and fast-rotting; speaker notes carry the mechanical difference only.
CKx tie-in: GitOps is ecosystem/adjacent — not a hard CKA/CKAD domain, but the
reconcile-loop mental model is squarely CKA cluster-architecture. Landed on the recap.
-->

---
layout: statement
kicker: The problem
---

You ran `kubectl apply` from your laptop last Tuesday. **Is the cluster still what you applied?**

Push-based delivery — `kubectl apply` / `helm upgrade` from a laptop or CI job — fires **once** and walks away. There is no record of *what should be running*, and nothing watching for **drift**: someone `kubectl edit`s a Deployment, scales it by hand at 2am, or a half-finished rollout leaves the cluster in a state **no file describes**. You can't answer the one question that matters — *what is running versus what's in Git?* — because the source of truth is a command someone typed, not a file you can diff.

<!--
Speaker: the pain is real and universal. Push-based apply (kubectl/helm from a
laptop or a CI runner) has three holes: (1) no persisted desired state — the "truth"
was a transient command; (2) no drift detection — nobody reverts a manual hotfix, so
the cluster silently diverges from any file; (3) no audit — who changed what, when?
Git already solves versioning/audit/review for code. GitOps asks: what if the cluster
CONTINUOUSLY made itself match a Git repo? Next: flip push to pull.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · flip the arrow — pull, don't push</span>

# GitOps: Git is the desired state, the cluster pulls it

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Push (what you've done so far)" icon="📤" variant="warn">
      A human or CI runs <code>kubectl apply</code> <em>at</em> the cluster from outside.
      Fire-and-forget: no stored desired state, no drift detection, credentials live in CI.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Pull (GitOps)" icon="📥" variant="ok">
      An <strong>in-cluster agent</strong> watches a Git repo and continuously reconciles
      the cluster <em>toward</em> it. Git is the single source of truth; the agent has the
      credentials, not your laptop.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

**It's the same reconcile loop, one level up.** There, a controller drove *observed* toward
*desired = `spec`*. Here, **Flux** drives the whole cluster toward *desired = **Git***.
Same observe → diff → act → repeat — the desired state just moved into a versioned,
reviewable, auditable repo.

</div>

</div>

<!--
Speaker: two arrows. PUSH: the actor is outside, pointing a command at the cluster —
that's every apply/helm you've run. PULL: an agent INSIDE the cluster subscribes to a
Git repo and makes reality match it, forever. Consequences worth naming: desired state
is now a file with history/review/audit (Git); drift gets corrected automatically;
cluster credentials never leave the cluster (CI only needs push-to-Git). Tie it hard to
S03 — this is literally the reconciliation loop with Git in the "desired" slot. Flux
(and Argo CD) are the CNCF tools that implement it. Next: the Source CRD that points
at the repo.
-->

---
layout: code-annotated
heading: 'One CRD says: this Git repo is the desired-state source'
compact: true
lab: labs/day-3/21-gitops-flux.md
---

```yaml {none|6-7|8-10|all}
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1m                    # poll Git for new commits
  url: https://github.com/stefanprodan/podinfo
  ref:
    branch: master
```

::notes::

<CodeNote at="1" label="spec.interval" variant="ok">
How often source-controller polls Git for a new revision. A shorter interval sees
pushes sooner; the Artifact (tarball) updates when the resolved revision changes.
</CodeNote>

<CodeNote at="2" label="spec.url + spec.ref" variant="ok">
Which repo and which ref (<code>branch</code> / <code>tag</code> / <code>semver</code>).
HTTPS or SSH; credentials via an optional <code>secretRef</code> in the same namespace.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
A <code>GitRepository</code> is a <strong>Source</strong> — it produces an Artifact.
Something else (<code>Kustomization</code> / <code>HelmRelease</code>) must
<strong>apply</strong> that Artifact to the cluster. Next: those apply CRDs.
</div>

<!--
Speaker: Flux splits "where is the truth?" from "how do we apply it?". GitRepository
(source.toolkit.fluxcd.io/v1) is the Source: url + ref + interval → an in-cluster
Artifact. It does NOT apply manifests by itself. The lab's first apply is this shape
pointing at a public hostless repo. Kind install path: flux install (dev) — production
teams usually flux bootstrap so Flux manages itself from Git. Next: name the three
behaviours, then build the apply side.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Three behaviours · reconcile, drift detection, prune &amp; suspend</span>

# What the agent actually does

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="Reconcile" icon="🔄" variant="ok">
      On <code>interval</code> (or <code>flux reconcile</code>), fetch the Source and
      apply until live == desired. Hands-off once declared.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Drift detection" icon="🔎" variant="warn">
      Each reconcile dry-runs / diffs live vs Git. Divergence is corrected on the next
      successful apply — unless reconciliation is suspended.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Prune &amp; suspend" kind="deploy" variant="ok">
      <code>prune: true</code> deletes objects removed from Git.
      <code>suspend: true</code> (or <code>flux suspend</code>) pauses apply — drift
      <strong>stays</strong> (the <code>selfHeal: false</code> analog).
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">the punchline</span>

Flux has **no separate `selfHeal` flag**. Active reconcile *is* the heal: hand-edits
snap back on the next interval. **`suspend`** is how you turn healing off — the lab's
required question hangs on that exact distinction.

</div>

</div>

<!--
Speaker: separate three things people blur. RECONCILE = fetch Source + apply (interval
or flux reconcile kustomization …). DRIFT DETECTION = the compare that runs as part of
reconcile; with suspend:false, correction is automatic. PRUNE = garbage-collect objects
that left Git (prune: true is required on the Kustomization spec — set it deliberately).
SUSPEND = pause the loop (flux suspend / flux resume, or spec.suspend). Map to Argo
vocabulary if someone asks: selfHeal:true ≈ not suspended; selfHeal:false ≈ suspended;
prune ≈ prune. Next: build the apply CRDs field by field.
-->

---
layout: code-walkthrough
heading: 'Build the apply side — Kustomization, then HelmRelease'
lab: labs/day-3/21-gitops-flux.md
---

````md magic-move
```yaml
# 1 — a Flux Kustomization is a CRD (kustomize.toolkit.fluxcd.io)
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
```

```yaml
# 2 — SOURCE REF: which GitRepository Artifact to apply
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 10m
  sourceRef:
    kind: GitRepository
    name: podinfo
```

```yaml
# 3 — PATH + PRUNE: where in the repo, and garbage-collect removals
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 10m
  path: ./kustomize
  prune: true
  sourceRef:
    kind: GitRepository
    name: podinfo
  targetNamespace: default
```

```yaml
# 4 — HELM SHAPE: HelmRelease applies a chart from a Source (sibling CRD)
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: podinfo
  namespace: default
spec:
  interval: 10m
  chart:
    spec:
      chart: podinfo
      sourceRef:
        kind: HelmRepository
        name: podinfo
```
````

<!--
Speaker: four frames. (1) Kustomization is a CRD in kustomize.toolkit.fluxcd.io/v1 —
GitOps apply config is itself Kubernetes YAML. (2) sourceRef binds to the GitRepository
Artifact you just saw — Source and apply are separate objects. (3) path + prune +
interval + targetNamespace: the hands-off apply. prune:true removes cluster objects
deleted from Git; interval drives continuous reconcile (and drift correction). (4) the
Helm-shaped sibling: HelmRelease (helm.toolkit.fluxcd.io/v2) pulls a chart via a
HelmRepository (or other Source) — same pull loop, different packaging. The lab uses
GitRepository + Kustomization; HelmRelease is recognition, not a required exercise.
Note there's no "sync" verb in the file — declaring the objects is enough; the
controllers do the rest (or flux reconcile to nudge). Next: that "controllers do the
rest" IS the S03 loop.
-->

---

<span class="kw-kicker">The one loop everything runs on — again, with Git</span>

# Reconcile is reconciliation with Git as `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" controller="Flux" resource="replica" desiredSource="Git" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **Git says 3 replicas; someone scaled to 2 by hand.** Flux *observes* the gap between Git and the cluster — that's drift.
- **Diff → act.** On the next reconcile it re-applies Git and recreates the missing replica. Nobody ran `kubectl` — the loop closed the gap.
- **It never stops — unless you suspend it.** With `suspend: false` (default), hand-edit a managed resource and Flux drags it back to Git, forever.

</v-clicks>
</div>

<!--
Speaker: this is the SAME ReconcileLoop component from S03 (reuse guardrail — no new
animation), with Git swapped into the "desired" slot: desiredSource="Git",
observedSource="cluster", controller="Flux". Click through: Observe (Git wants 3, the
cluster shows 2 — a hand-scale dropped one) → Diff (desired 3 ≠ observed 2, delta +1) →
Act (re-apply Git, recreate the replica) → Repeat (in sync, keep watching). Land the
callback: S03 said "the loop is always watching, delete a Pod and it comes back." GitOps
is that same sentence with GIT as the thing being matched. The lab makes you feel it —
scale a managed Deployment by hand and watch Flux revert it; then flux suspend and prove
the hand-edit stays. Forward pointer: S22's operators are this loop again, driven by a
custom resource. Next: how Flux reports state.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Reading Flux · conditions, not a sync/health UI</span>

# Ready, Reconciling, Stalled

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Ready — did the last reconcile succeed?" icon="🔁" variant="ok">
      <KwChip>Ready=True</KwChip> applied + healthy checks passed ·
      <KwChip>Ready=False</KwChip> apply/build/health failed ·
      <KwChip>Unknown</KwChip> still working.
      <div class="kw-muted mt-1">Answers: <em>is this object converging?</em></div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Progress conditions — is work in flight or stuck?" kind="deploy" variant="ok">
      <KwChip>Reconciling</KwChip> apply in progress ·
      <KwChip>Stalled</KwChip> won't succeed without a change ·
      plus <code>lastAppliedRevision</code> / Artifact revision.
      <div class="kw-muted mt-1">Answers: <em>what is it doing right now?</em></div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

Read **both** the Source and the apply object. `GitRepository` Ready + `Kustomization`
not Ready = the Artifact fetched, but apply/health failed — fix the manifests in Git
(don't hand-patch; the next reconcile will overwrite). Use `flux get kustomizations`
/ `kubectl get kustomization -A` the way the Argo lab uses `argocd app get`.

</div>

</div>

<!--
Speaker: Flux doesn't ship a bundled sync/health UI like Argo CD — day-to-day state
lives in kubectl / flux CLI conditions. Ready (kstatus) is the headline: True means the
last reconcile applied and health checks passed. Reconciling/Stalled explain in-flight
vs stuck. Cross-product teachable case: Source Ready + Kustomization Ready=False means
Git fetched fine but apply/health failed — fix IN GIT. Suspended objects stop moving
conditions forward on purpose. In the lab you'll read both with flux get / kubectl get.
Next: the principles that make this a discipline, not just a tool.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">OpenGitOps · the four principles (CNCF)</span>

# GitOps is a discipline, not a product

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="1 · Declarative" icon="📜" variant="ok">
      The whole system is described declaratively — desired state as data, not scripts of
      steps.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="2 · Versioned & immutable" icon="🔒" variant="ok">
      That state is stored in Git: versioned, immutable history, revertable to any prior
      commit.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="3 · Pulled automatically" icon="📥" variant="ok">
      Software agents <em>pull</em> the desired state from Git — no one pushes credentials
      at the cluster.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="4 · Continuously reconciled" kind="deploy" variant="ok">
      Agents continuously observe and <strong>converge</strong> actual state toward
      desired — the loop again.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm">
  <div class="kw-cols-2">
    <div class="flex items-center gap-2">
      <K8sIcon name="flux-icon-white" size="1.5rem" alt="Flux logo" />
      <span><strong>Flux</strong> — <code>GitRepository</code> + <code>Kustomization</code> / <code>HelmRelease</code> CRDs</span>
    </div>
    <div class="flex items-center gap-2">
      <K8sIcon name="argo-icon-white" size="1.5rem" alt="Argo project logo" />
      <span><strong>Argo CD</strong> — the <code>Application</code> CRD (the other common choice)</span>
    </div>
  </div>
  <div class="mt-2 kw-muted">
  Two implementations of the same pull-based loop, both under CNCF-graduated projects. The
  principles — not the tool — are what CNCF's <strong>OpenGitOps</strong> project standardised;
  this whole section is principle 4 applied to principles 1–3.
  </div>
</div>

</div>

<!--
Speaker: name the discipline so learners don't reduce GitOps to "Flux." CNCF's
OpenGitOps working group pinned four principles: (1) DECLARATIVE — desired state as data;
(2) VERSIONED & IMMUTABLE — that data lives in Git with full history and easy revert; (3)
PULLED AUTOMATICALLY — agents pull it (vs a CI job pushing with cluster creds); (4)
CONTINUOUSLY RECONCILED — agents keep converging actual toward desired. Tie the bow: this
entire section is principle #4 (the reconcile loop) enforcing #1–3.

The tool callout — keep it to ~30 seconds, mirrored from the Argo CD variant. Flux and
Argo CD are the two implementations learners will actually meet. Careful naming: the
CNCF-GRADUATED project is **Argo**, the umbrella (Argo CD, Workflows, Rollouts, Events)
— Argo CD is the continuous-delivery component; Flux is itself a graduated project.
Mechanical difference, if asked: Flux is a toolkit of controllers —
`GitRepository` points at the repo, `Kustomization` / `HelmRelease` reconcile from it;
day-to-day state lives in kubectl/CLI. Argo CD is app-centric — one `Application` CRD
binds source→destination, plus a Web UI showing sync/drift state. Both are pull-based,
both reconcile continuously — skills transfer. If someone asks "which should we run?":
genuinely fine either way; teams pick on operational fit, not capability gaps — don't
relitigate their platform team's choice from this stage. This delivery uses Flux because
the facilitator selected it; the Argo CD variant of this section exists for the other
choice. Next: recap and hand to the lab.
-->

---
layout: recap
heading: 'Recap — Git is the source of truth, the cluster converges to it'
story: 'Push-based apply left drift undetected. We flipped the arrow: in-cluster Flux controllers watch a GitRepository and continuously reconcile via Kustomization / HelmRelease — interval reconcile applies Git, prune removes what left Git, and suspend pauses healing so hand-edits stay. The same reconcile loop, with Git in the desired slot.'
next: 'The operator pattern — the same reconcile loop again, this time driven by your own CRD'
---

- **Push → pull.** GitOps puts desired state in **Git** and has in-cluster agents pull
  and reconcile it — versioned, auditable, self-correcting; cluster creds never leave the cluster
- **Sources + apply CRDs:** **`GitRepository`** (`source.toolkit.fluxcd.io`) produces an
  Artifact; **`Kustomization`** / **`HelmRelease`** apply it (`interval`, `prune`, `suspend`)
- **Three behaviours:** **reconcile** (apply Git) · **drift detection** (on each reconcile)
  · **prune / suspend** (`prune` deletes removals; `suspend` is the self-heal off-switch)
- **Read conditions:** **Ready** / **Reconciling** / **Stalled** on Source *and* apply
  objects — `flux get` / `kubectl get`; fix failures in Git
- **It's the same reconcile loop** with Git as `spec` — and **OpenGitOps** makes the four principles
  tool-agnostic (Flux, Argo CD, …)
- **CKx tie-in:** GitOps is ecosystem/adjacent (not a hard CKA/CKAD domain), but the
  **reconcile-loop** mental model is core CKA cluster-architecture

<!--
Speaker: pull the thread. The problem was drift with no detection; the fix was to move
desired state into Git and let in-cluster controllers continuously reconcile toward it.
Nail four facts: (1) push→pull and why; (2) GitRepository is the Source, Kustomization /
HelmRelease apply; (3) reconcile vs drift vs prune/suspend (suspend ≈ selfHeal off);
(4) Ready/Reconciling/Stalled — read Source and apply. Through-line: S03's reconcile loop
with Git as desired — setup for S22. Hand to Lab 21 (Flux): flux install on kind, apply
GitRepository + Kustomization, watch Ready, drift by hand, then flux suspend and prove
drift stays.
-->

---
layout: lab
lab: labs/day-3/21-gitops-flux.md
duration: 25 min
env: kind-only / facilitator-hosted (namespace = read-only)
---

## Lab 21 — Git as source of truth (Flux)

- `flux install` on kind; apply a **GitRepository** + **Kustomization** and watch them go **Ready**
- Read conditions with `flux get` / `kubectl get gitrepository,kustomization`
- **Break→fix (reconcile):** hand-scale a managed Deployment → watch Flux **revert** it to Git
- Answer: *what happens to a hand-edit if the Kustomization is suspended?* (drift stays — no auto-revert)
- Stretch: fork the repo, change a manifest, `git push` → `flux reconcile` and watch the new revision apply
