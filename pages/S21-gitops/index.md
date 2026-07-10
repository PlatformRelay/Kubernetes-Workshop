---
layout: section-cover
image: /covers/section-21-oracle-lighthouse.png
day: Day 3
section: '21'
tier: recommended
track: Delivery
---

# GitOps with Argo CD

Drive desired state from Git; understand sync, self-heal, and drift.

**recommended** · suggested Day 3 · Delivery track

<!--
Section S21 — GitOps with Argo CD. Recommended, Day 3, Delivery track.
Timing: ~30 min slides + 25 min lab.
Outcome: learners can explain pull-based GitOps, read/author an Argo CD `Application`,
and predict sync / self-heal / drift behaviour — then feel it in the lab (create an
Application, watch it sync Healthy, drift it by hand, watch self-heal revert).
Beats: problem (push-based apply has no drift detection — "what's running vs what's in
Git?") · mental model (pull-based: an in-cluster agent continuously reconciles the
cluster toward Git) · Application CRD (source repo/path/revision + destination
cluster/namespace + syncPolicy) · three behaviours (sync / self-heal / drift) ·
magic-move building the Application manifest (== the lab's application.yaml) ·
reconcile-loop animation with GIT as the desired-state source (reuse ReconcileLoop,
callback to S03, forward to S22) · sync status vs health status (two axes) ·
OpenGitOps four principles · debrief → S22 · lab.

Animation: REUSE ReconcileLoop (US-X1, built in S03) — pass controller="Argo CD",
resource="replica", desiredSource="Git". This is the reuse guardrail in action: the
GitOps loop IS the S03 reconcile loop with Git in the desired slot. The new
desiredSource/observedSource props were added backward-compatibly (default spec/status)
so S03 stays byte-identical.

ACCURACY LOCKS (verified against Argo CD stable / v3.x docs, 2026-07-10):
- Install: kubectl create namespace argocd; kubectl apply -n argocd --server-side
  --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
  (server-side apply — the install manifest is too large for client-side last-applied).
- Application CRD: apiVersion argoproj.io/v1alpha1, kind Application, lives in the
  `argocd` namespace. spec.source{repoURL,targetRevision,path} = desired state in Git;
  spec.destination{server,namespace} = where it lands (server
  https://kubernetes.default.svc = the same in-cluster API); spec.syncPolicy.automated
  {prune,selfHeal}.
- selfHeal=true → Argo reverts hand-edits back to Git. prune=true → resources deleted
  from Git are removed from the cluster.
- Sync status: Synced / OutOfSync (/ Unknown) — is the cluster == Git? Health status:
  Healthy / Progressing / Degraded / Suspended / Missing (/ Unknown) — are the workloads
  actually OK? Two INDEPENDENT axes.
- Initial admin secret: `argocd-initial-admin-secret` (CLI: argocd admin
  initial-password -n argocd).
- The lab pulls the canonical PUBLIC repo argoproj/argocd-example-apps, path guestbook
  — runnable in kind with nothing to host. Red-line continuity (the `web` app) is
  deliberately broken here: pushing a Git change requires a writable repo we don't host,
  so the required "change Git → re-sync" beat is a fork-based stretch, while the marquee
  self-heal drift break→fix needs no Git write. Noted honestly in the lab.
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

**It's the S03 reconcile loop, one level up.** There, a controller drove *observed* toward
*desired = `spec`*. Here, **Argo CD** drives the whole cluster toward *desired = **Git***.
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
S03 — this is literally the reconciliation loop with Git in the "desired" slot. Argo CD
(and Flux) are the CNCF tools that implement it. Next: the one resource that expresses
"reconcile this repo into this cluster."
-->

---
layout: code-annotated
heading: 'One CRD says: reconcile this repo into this cluster'
compact: true
lab: labs/day-3/21-gitops.md
---

```yaml {none|6-10|11-13|14-18|all}
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:                                    # DESIRED — where the truth lives in Git
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:                               # WHERE it should run
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:                               # keep it matching, hands-off
      prune: true
      selfHeal: true
```

::notes::

<CodeNote at="1" label="spec.source" variant="ok">
The desired state, <strong>in Git</strong>: which <code>repoURL</code>, which
<code>targetRevision</code> (branch/tag/commit — <code>HEAD</code> = tip), and the
<code>path</code> to the manifests. Change these files in Git and the app follows.
</CodeNote>

<CodeNote at="2" label="spec.destination" variant="ok">
Where the rendered manifests land: a cluster (<code>server</code> —
<code>https://kubernetes.default.svc</code> is <em>this</em> cluster) and a
<code>namespace</code>. One Argo CD can drive many clusters.
</CodeNote>

<CodeNote at="3" label="syncPolicy.automated" variant="warn">
<code>selfHeal: true</code> reverts hand-edits back to Git; <code>prune: true</code>
deletes resources you removed from Git. Omit this block and sync becomes
<strong>manual</strong> (a button / <code>argocd app sync</code>).
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
The <code>Application</code> is itself a Kubernetes resource (an Argo CRD) living in the
<code>argocd</code> namespace — so GitOps configuration is <em>also</em> just YAML you can
put in Git.
</div>

<!--
Speaker: this is the whole section on one slide. An Application is a CRD (installed with
Argo CD) that binds a Git SOURCE to a cluster DESTINATION and says how to keep them in
sync. source = repoURL + targetRevision + path (the desired state, versioned in Git);
destination = server (kubernetes.default.svc = in-cluster) + namespace. syncPolicy:
without `automated`, Argo shows drift but waits for you to click Sync; WITH automated +
selfHeal, it reverts manual changes; + prune, it deletes what you deleted from Git. Meta
point for the "app of apps" pattern later (S22 neighbourhood): the Application is itself
YAML, so you can manage Applications with GitOps too. This exact manifest is the lab's
application.yaml. Next: name the three behaviours precisely.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Three behaviours · sync, self-heal, drift detection</span>

# What the agent actually does

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="Sync" icon="🔄" variant="ok">
      Apply Git's manifests to the cluster until live == desired. Manual
      (<code>argocd app sync</code> / a button) or <strong>automated</strong>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Drift detection" icon="🔎" variant="warn">
      Continuously compare live vs Git. Any divergence → the app is marked
      <code>OutOfSync</code>, whether or not anything auto-corrects it.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Self-heal" kind="deploy" variant="ok">
      With <code>selfHeal: true</code>, drift isn't just <em>reported</em> — Argo
      re-applies Git and <strong>reverts</strong> the hand-change automatically.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">the punchline</span>

Drift detection **always** runs (you'll always *see* `OutOfSync`). Self-heal is what turns
seeing into *fixing*. Turn self-heal **off** and a hand-edit sits there as `OutOfSync`
until a human decides — turn it **on** and the cluster refuses to stay drifted.

</div>

</div>

<!--
Speaker: separate three things people blur. SYNC = the act of applying Git to the
cluster (can be manual or automated). DRIFT DETECTION = the continuous comparison; its
output is the OutOfSync/Synced status — this runs regardless of policy, so Argo always
SHOWS you drift. SELF-HEAL = the automated response to drift: re-apply Git, undo the
manual change. The lab's required question hangs on this exact distinction: with selfHeal
OFF, edit a managed resource → it goes OutOfSync and STAYS (Argo reports but won't
revert); with selfHeal ON → it snaps back. Prune is the deletion sibling of self-heal
(remove from Git → remove from cluster). Next: watch the manifest get built, then watch
the loop run.
-->

---
layout: code-walkthrough
heading: 'Build the Application, field by field'
lab: labs/day-3/21-gitops.md
---

````md magic-move
```yaml
# 1 — an Argo CD Application is a CRD in the argocd namespace
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
```

```yaml
# 2 — SOURCE: the desired state, versioned in Git
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
```

```yaml
# 3 — DESTINATION: which cluster + namespace it lands in
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

```yaml
# 4 — SYNC POLICY: keep it matching, hands-off (== labs/day-3/21-gitops.md)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```
````

<!--
Speaker: four frames, and each adds one idea. (1) It's a CRD in the argocd namespace —
GitOps config is itself Kubernetes YAML. (2) SOURCE binds the desired state to a Git
repo/revision/path — this is the whole "Git is the truth" claim in three lines. (3)
DESTINATION says where: in-cluster API (kubernetes.default.svc) + namespace default. (4)
add project (the default AppProject) and syncPolicy.automated{prune,selfHeal} — now it's
hands-off. The final frame is the lab's application.yaml byte-for-byte; the lab applies
exactly this. Note there's no "sync" verb in the file — declaring the Application is
enough; the agent does the rest. Next: that "agent does the rest" IS the S03 loop.
-->

---

<span class="kw-kicker">The one loop everything runs on — again, with Git</span>

# Self-heal is reconciliation with Git as `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" controller="Argo CD" resource="replica" desiredSource="Git" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **Git says 3 replicas; someone scaled to 2 by hand.** Argo *observes* the gap between Git and the cluster — that's drift.
- **Diff → act.** It re-applies Git and recreates the missing replica. Nobody ran `kubectl` — the loop closed the gap, exactly like S03.
- **It never stops.** This is `selfHeal: true`: hand-edit a managed resource and Argo drags it back to Git, forever.

</v-clicks>
</div>

<!--
Speaker: this is the SAME ReconcileLoop component from S03 (reuse guardrail — no new
animation), with Git swapped into the "desired" slot: desiredSource="Git",
observedSource="cluster", controller="Argo CD". Click through: Observe (Git wants 3, the
cluster shows 2 — a hand-scale dropped one) → Diff (desired 3 ≠ observed 2, delta +1) →
Act (re-apply Git, recreate the replica) → Repeat (in sync, keep watching). Land the
callback: S03 said "the loop is always watching, delete a Pod and it comes back." GitOps
is that same sentence with GIT as the thing being matched. The lab makes you feel it —
scale a managed Deployment by hand and watch Argo revert it. Forward pointer: S22's
operators are this loop again, driven by a custom resource. Next: how Argo reports state.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Reading Argo · two questions, two independent statuses</span>

# Sync status vs health status

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Sync status — does the cluster match Git?" icon="🔁" variant="ok">
      <KwChip>Synced</KwChip> live == Git ·
      <KwChip>OutOfSync</KwChip> they differ ·
      <KwChip>Unknown</KwChip> can't tell yet.
      <div class="kw-muted mt-1">Answers: <em>is reality what Git says?</em></div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Health status — are the workloads OK?" kind="deploy" variant="ok">
      <KwChip>Healthy</KwChip> · <KwChip>Progressing</KwChip> ·
      <KwChip>Degraded</KwChip> · <KwChip>Missing</KwChip> / <KwChip>Suspended</KwChip>.
      <div class="kw-muted mt-1">Answers: <em>is the running thing actually working?</em></div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

They're **orthogonal.** `Synced + Degraded` = you faithfully deployed a **broken manifest**
(Git is the truth, and the truth is broken — fix Git, don't hand-patch). `OutOfSync + Healthy`
= someone's hand-patch happens to work, but it **isn't in Git** — self-heal will revert it. You
need *both* answers to know what's going on; the lab reads both off `argocd app get`.

</div>

</div>

<!--
Speaker: the single most useful thing to internalise about Argo's UI. Two separate axes.
SYNC STATUS (Synced/OutOfSync/Unknown) answers "does live == Git?" — a pure diff. HEALTH
STATUS (Healthy/Progressing/Degraded/Missing/Suspended) answers "are the workloads
actually up?" — Argo's per-resource health checks. They move independently, and the
cross-products are the teachable cases: Synced+Degraded means you correctly shipped a bad
manifest — Argo did its job, your YAML is wrong, fix it IN GIT (don't hand-patch, it'll
revert). OutOfSync+Healthy means a manual change that happens to work but isn't in Git —
self-heal will undo it, so land it in Git if you want to keep it. In the lab you'll read
both fields off `argocd app get` / `kubectl get application`. Next: the principles that
make this a discipline, not just a tool.
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

<div v-click="5" class="mt-4 text-sm kw-muted">

Argo CD is **one implementation** (Flux is another). The principles — not the tool — are
what CNCF's <strong>OpenGitOps</strong> project standardised. Everything in this section is
principle 4 (continuous reconciliation) applied to principles 1–3.

</div>

</div>

<!--
Speaker: name the discipline so learners don't reduce GitOps to "Argo CD." CNCF's
OpenGitOps working group pinned four principles: (1) DECLARATIVE — desired state as data;
(2) VERSIONED & IMMUTABLE — that data lives in Git with full history and easy revert; (3)
PULLED AUTOMATICALLY — agents pull it (vs a CI job pushing with cluster creds); (4)
CONTINUOUSLY RECONCILED — agents keep converging actual toward desired. Argo CD and Flux
are two implementations; the principles are tool-agnostic. Tie the bow: this entire
section is principle #4 (the reconcile loop) enforcing #1–3. Next: debrief and hand to
the lab.
-->

---
layout: recap
heading: 'Debrief — Git is the source of truth, the cluster converges to it'
story: 'Push-based apply left drift undetected. We flipped the arrow: an in-cluster agent (Argo CD) watches an Application''s Git source and continuously reconciles the cluster toward it — sync applies Git, drift detection reports divergence, and self-heal reverts hand-edits automatically. The same S03 reconcile loop, with Git in the desired slot.'
next: 'S22 · The operator pattern — the same reconcile loop again, this time driven by your own CRD'
---

- **Push → pull.** GitOps puts desired state in **Git** and has an in-cluster agent pull
  and reconcile it — versioned, auditable, self-correcting; cluster creds never leave the cluster
- **The `Application` CRD** binds a Git **source** (`repoURL`/`targetRevision`/`path`) to a
  **destination** (cluster + namespace), with a **`syncPolicy`**
- **Three behaviours:** **sync** (apply Git) · **drift detection** (always on → `OutOfSync`)
  · **self-heal** (`selfHeal: true` reverts hand-edits; `prune` deletes what left Git)
- **Two independent statuses:** **sync** (Synced/OutOfSync — matches Git?) vs **health**
  (Healthy/Progressing/Degraded — workloads OK?); read both
- **It's the S03 loop** with Git as `spec` — and **OpenGitOps** makes the four principles
  tool-agnostic (Argo CD, Flux, …)
- **CKx tie-in:** GitOps is ecosystem/adjacent (not a hard CKA/CKAD domain), but the
  **reconcile-loop** mental model is core CKA cluster-architecture

<!--
Speaker: pull the thread. The problem was drift with no detection; the fix was to move
desired state into Git and let an in-cluster agent continuously reconcile toward it. Nail
four facts: (1) push→pull and why (audit, revert, creds stay in-cluster); (2) the
Application binds source→destination with a syncPolicy; (3) sync vs drift-detection vs
self-heal are three different things (self-heal is the auto-revert; drift detection always
runs); (4) sync status and health status are orthogonal — read both. And the through-line:
this is S03's reconcile loop with Git as the desired state — which is exactly the setup for
S22, where you write your OWN controller for your OWN CRD. Hand to Lab 21: install Argo CD
on kind, apply the guestbook Application, watch it go Synced/Healthy, then drift it by hand
and watch self-heal revert it.
-->

---
layout: lab
lab: labs/day-3/21-gitops.md
duration: 25 min
env: kind-only / facilitator-hosted (namespace = read-only)
---

## Lab 21 — Git as source of truth

- Install Argo CD on kind; apply the `guestbook` **Application** and watch it go **Synced / Healthy**
- Read both statuses off `argocd app get` / `kubectl get application`
- **Break→fix (self-heal):** hand-scale a managed Deployment → watch Argo **revert** it to Git
- Answer: *what happens to a hand-edit if `selfHeal` is off?* (`OutOfSync`, no auto-revert)
- Stretch: fork the repo, change a manifest, `git push` → watch the app re-sync to the new commit
