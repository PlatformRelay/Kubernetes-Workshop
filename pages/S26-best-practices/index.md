---
layout: section-cover
image: /covers/section-26-gleaming-harbour-city.png
day: Day 3
section: '26'
tier: core
track: Wrap
---

# Best practices

Every layer we built, as **one** production-readiness checklist — run against a real manifest.

**core** · suggested Day 3 · Wrap track

<!--
Section S26 — Best practices (CAPSTONE). Core, Day 3, Wrap track. Timing: ~30 min slides + 40 min
lab. This section SYNTHESIZES the whole course: it does not teach a new resource, it ties every
prior layer together as one checklist and runs it against a single "before → after" manifest set
with ~10 planted problems. The SAME flawed/fixed Deployment the slide magic-move walks is the lab's
flawed/fixed Deployment (single source of truth) — the magic-move's fixed frames == the lab files.
Beats: (1) capstone framing (the red line + every Day-3 layer, as one checklist) · (2) checklist I —
availability (probes S14, resources S13, PDB, anti-affinity/topology spread, rollout strategy) ·
(3) checklist II — security (labels, digest pin S02, restricted PSS S17, NetworkPolicy S18,
config/secret hygiene) · (4) checklist III — operations (GitOps S21, observability S23, graceful
shutdown, cost) · (5) the flawed Deployment — 10 planted problems, spot them · (6) magic-move A:
HEALTH fixes (probes, resources, graceful shutdown) · (7) magic-move B: SECURITY fixes (labels,
digest, restricted securityContext) · (8) magic-move C: AVAILABILITY + the two sibling objects
(replicas+topologySpread+rollout, then PDB, then NetworkPolicy) · (9) AdmissionGate REUSE — the same
restricted gate admits the fixed Deployment · (10) the checklist as a repo artifact · (11) recap → lab.
Each magic-move step is annotated with the SECTION it traces to. Reuse AdmissionGate.vue (do NOT
author a new component). CKx tie-in: CKAD/CKA synthesis (probes, resources, PDBs, rollouts, security).
ACCURACY LOCKS: image nginxinc/nginx-unprivileged:1.27 runs as UID 101 on port 8080 → ALL ports are
8080; restricted gates FOUR fields (runAsNonRoot/allowPrivilegeEscalation:false/drop ALL/seccomp),
split pod-level (runAsNonRoot,runAsUser,seccomp) vs container-level (allowPrivilegeEscalation,drop).
The digest placeholder satisfies restricted admission (dry-run) but is ImagePullBackOff at runtime —
resolve at rehearsal. PDB/topologySpread/NetworkPolicy selectors all match app.kubernetes.io/name: web.
-->

---
layout: statement
kicker: The capstone · everything, as one list
---

You've built the whole line — now make it **production-ready**.

**Pod → Deployment → Service → Ingress → Gateway** (S05–S09) carried the app; Day 3 added
**security**, **policy**, **delivery**, and **observability** on top. This section is the
**synthesis**: no new resource, just **one checklist** that every prior layer contributes a line to —
and a single real manifest we'll run it against, before and after.

<!--
Speaker: this is the wrap. Frame it as the payoff of the whole course — we are not learning anything
new, we are collecting what we already learned into a single artifact you can carry to work. The red
line (S05–S09) is the spine — a Deployment behind a Service, exposed by Ingress/Gateway. Day 3 bolted
on the cross-cutting concerns: image hygiene (S02), pod security (S17), NetworkPolicy (S18), GitOps
(S21), observability (S23). The capstone question is: "is this manifest ready for production?" and the
answer is a checklist with a line from every section. The rest of this deck IS that checklist, then a
before→after manifest with ~10 planted problems that we fix one at a time — each fix a checklist item.
The lab (labs/day-3/26-capstone.md) hands the learner the SAME flawed manifest to audit and fix.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist I · availability — keep serving through failure and change</span>

# Will it stay up?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Probes — readiness / liveness / startup" kind="pod" variant="ok">
      Readiness gates traffic, liveness restarts a wedged container, startup shields a slow boot.
      <code>Running</code> ≠ healthy. <span class="kw-muted">(S14)</span>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Requests & limits" kind="pod" variant="ok">
      Reserve what you need (scheduling), cap what you use (enforcement). No resources → BestEffort,
      first evicted. <span class="kw-muted">(S13)</span>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="PodDisruptionBudget" icon="🛟" variant="ok">
      Keep <code>minAvailable</code> Pods up during <em>voluntary</em> disruptions — node drains,
      upgrades — so a rollout or a drain can't take you to zero. <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Anti-affinity / topology spread" kind="node" variant="ok">
      Spread replicas across nodes (and zones) so one node failure doesn't kill every replica.
      <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="Rollout strategy" kind="deploy" variant="ok">
      <code>RollingUpdate</code> with sane <code>maxUnavailable</code>/<code>maxSurge</code> — plus
      <code>revisionHistoryLimit</code> so old ReplicaSets don't pile up. <span class="kw-muted">(S06)</span>
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="More than one replica" kind="deploy" variant="warn">
      <code>replicas: 1</code> has no headroom — a single Pod restart is an outage. HA starts at
      two, spread apart. <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: checklist part one — availability, i.e. "does it survive failure and change." Walk the six:
probes (S14) so Running means serving, not just started; requests/limits (S13) so it's scheduled and
capped and not first to be evicted; a PodDisruptionBudget so voluntary disruptions (node drain, an
upgrade) can't drain you below minAvailable — this is new here but it's pure availability; anti-
affinity / topologySpreadConstraints so your replicas don't all land on one node that then dies; a
rollout strategy with sane surge/unavailable and a revisionHistoryLimit so you don't accumulate dead
ReplicaSets; and simply more than one replica — replicas:1 is a guaranteed outage on any Pod restart.
Every one of these is a line the flawed manifest gets wrong. Next: the security half.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist II · security — least privilege, provenance, isolation</span>

# Will it hold up?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Recommended labels" icon="🏷️" variant="ok">
      <code>app.kubernetes.io/name</code>, <code>/instance</code>, <code>/version</code>,
      <code>/part-of</code>, <code>/managed-by</code> — the common set selectors, dashboards, and
      GitOps all rely on. <span class="kw-muted">(hygiene)</span>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Immutable image digest" icon="🔏" variant="ok">
      Pin by <code>@sha256:…</code>, not a movable tag — the running bytes can't change under you.
      <span class="kw-muted">(S02)</span>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Restricted securityContext" kind="pod" variant="ok">
      Non-root, no priv-esc, drop <code>ALL</code> caps, <code>RuntimeDefault</code> seccomp — the
      four fields <code>restricted</code> gates. <span class="kw-muted">(S17)</span>
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="NetworkPolicy" kind="netpol" variant="ok">
      Default-deny, then an explicit allow — so a foothold can't roam a flat pod network.
      <span class="kw-muted">(S18)</span>
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="Config & secret hygiene" kind="secret" variant="ok">
      Config in <code>ConfigMap</code>/<code>Secret</code>, not baked into the image or the manifest;
      mount least privilege; never log secrets. <span class="kw-muted">(S11/S12)</span>
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="The through-line" icon="🎯" variant="warn">
      <code>enforce: restricted</code> alone rejects the un-hardened Pod at admission — but labels,
      digests, and NetworkPolicy are on <em>you</em>.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: checklist part two — security, i.e. "does it resist compromise and drift." Recommended
labels (app.kubernetes.io/*) aren't decoration — they're the contract Services, dashboards, PDBs,
topologySpread, and GitOps all select on; get them wrong and half the other controls silently don't
apply. Pin the image by digest (S02) so the bytes running today are the bytes you scanned. The four
restricted securityContext fields (S17) — non-root, no priv-esc, drop ALL, seccomp — are the
least-privilege floor. NetworkPolicy (S18): default-deny then one allow, so a compromised Pod can't
scan the namespace. Config/secret hygiene (S11/S12): externalize config, don't bake secrets. Callout
(card 6): restricted admission will reject the un-hardened Deployment for you, but nothing enforces
"you pinned a digest" or "you wrote a NetworkPolicy" — those are discipline. Next: operations.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist III · operations — deliver, observe, shut down, and pay for it</span>

# Can you run it?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="GitOps delivery" icon="🔁" variant="ok">
      The manifest lives in <strong>Git</strong>; an in-cluster agent reconciles the cluster to it —
      auditable, revertable, self-healing. <span class="kw-muted">(S21)</span>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Observability" icon="📈" variant="ok">
      Expose <code>/metrics</code>; a <code>ServiceMonitor</code> selects the Service by label so
      new Pods are scraped automatically. <span class="kw-muted">(S23)</span>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Graceful shutdown" kind="pod" variant="ok">
      <code>terminationGracePeriodSeconds</code> + a <code>preStop</code> hook — drain in-flight
      requests before <code>SIGTERM</code>, so a rollout drops no connections. <span class="kw-muted">(graceful shutdown)</span>
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Cost awareness" icon="💰" variant="warn">
      Right-size requests to real usage; don't over-provision limits "just in case." Idle
      reservations are money the whole cluster can't use. <span class="kw-muted">(cost)</span>
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
Three lists, one manifest. Next: a real Deployment that gets <strong>every one of these wrong</strong>.
</div>

</div>

<!--
Speaker: checklist part three — operations, i.e. "can a team actually run this over time." GitOps
(S21): the manifest is in Git and an agent reconciles the cluster to it, so every change is reviewed,
audited, and revertable, and drift self-heals — it's the S03 reconcile loop with Git in the desired
slot. Observability (S23): the app exposes /metrics and a ServiceMonitor selects it by label, so
scaling up adds scrape targets automatically — you can't operate what you can't see. Graceful
shutdown: terminationGracePeriodSeconds plus a preStop hook lets the Pod finish in-flight requests
and leave the endpoints before SIGTERM, so a rollout or scale-down drops zero connections. Cost:
requests are a reservation the whole cluster honors — over-request and you pay for idle capacity
nobody else can use; right-size to observed usage. That's the full checklist: availability, security,
operations. Now we make it concrete — a Deployment that violates all of it.
-->

---
layout: code-annotated
heading: 'The manifest that fails the checklist — spot the problems'
compact: true
lab: labs/day-3/26-capstone.md
---

```yaml {none|8|9-11|12-14|15|all}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }                 # ① only the ad-hoc label
spec:
  replicas: 1                          # ② no HA — one Pod is one outage
  # ③ no strategy / revisionHistoryLimit
  template:
    spec:
      containers:
        - name: web
          image: nginxinc/nginx-unprivileged:latest   # ④ mutable tag
          ports: [{ containerPort: 8080 }]
          # ⑤ no resources  ⑥ no probes  ⑦ no securityContext
      # ⑧ no graceful shutdown  ⑨ no anti-affinity/spread
# ⑩ no PodDisruptionBudget, ⑪ no NetworkPolicy — separate objects, also missing
```

::notes::

<CodeNote at="1" label="④ mutable image tag" variant="danger">
<code>:latest</code> can change under you — the bytes you scanned aren't the bytes that run.
<strong>S02</strong> says pin by <code>@sha256:…</code>.
</CodeNote>

<CodeNote at="2" label="⑤ no resources · ⑥ no probes" variant="danger">
No <code>requests/limits</code> → <strong>BestEffort</strong>, first evicted (S13). No probes →
<code>Running</code> is the only (misleading) signal (S14).
</CodeNote>

<CodeNote at="3" label="⑦ no securityContext · ⑧ no shutdown" variant="danger">
Runs as default user, full caps, no seccomp → <code>restricted</code> rejects it (S17). No
<code>preStop</code>/grace → dropped connections on every rollout.
</CodeNote>

<CodeNote at="4" label="② replicas: 1 · ⑨ no spread" variant="danger">
One replica, unspread → a single node or Pod restart is a full outage.
</CodeNote>

<div v-click="5" class="mt-2 text-sm kw-muted">
Ten-plus problems, each a checklist line. The lab has you audit this exact file <em>before</em>
revealing the list — try it first.
</div>

<!--
Speaker: this is the "spot the bug" slide — and it's the lab's opening self-audit, so pause and let
people actually find problems before you narrate. The manifest is deliberately minimal and every
omission is a checklist violation: (①) only an ad-hoc `app: web` label, none of the recommended
app.kubernetes.io/* set; (②) replicas:1; (③) no strategy or revisionHistoryLimit; (④) image on
:latest — a mutable tag; (⑤) no resources; (⑥) no probes; (⑦) no securityContext; (⑧) no graceful
shutdown; (⑨) no anti-affinity/topologySpread; and the two SEPARATE objects that should exist
alongside it — (⑩) a PodDisruptionBudget and (⑪) a NetworkPolicy. That's why the count is "ten-plus":
eight are wrong INSIDE the Deployment, two are missing sibling objects. Port is 8080 because
nginx-unprivileged listens there — hold that, it threads through every fix. Next three slides fix
these one at a time, grouped by checklist: health, then security, then availability.
-->

---
layout: code-walkthrough
heading: 'Fix I · health — one fix per step (S13, S14, graceful shutdown)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: the flawed container — no probes, no resources, no graceful shutdown
containers:
  - name: web
    image: nginxinc/nginx-unprivileged:latest
    ports: [{ containerPort: 8080 }]
```

```yaml
# 1: +resources — reserve + cap (S13). No longer BestEffort.
containers:
  - name: web
    image: nginxinc/nginx-unprivileged:latest
    ports: [{ containerPort: 8080 }]
    resources:
      requests: { cpu: 50m, memory: 64Mi }    # right-sized, not padded (cost)
      limits:   { cpu: 200m, memory: 128Mi }
```

```yaml
# 2: +probes — readiness gates traffic, liveness restarts, startup shields boot (S14)
    resources:
      requests: { cpu: 50m, memory: 64Mi }
      limits:   { cpu: 200m, memory: 128Mi }
    readinessProbe:
      httpGet: { path: /, port: 8080 }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /, port: 8080 }
      periodSeconds: 10
    startupProbe:
      httpGet: { path: /, port: 8080 }
      periodSeconds: 3
      failureThreshold: 30
```

```yaml
# 3: +graceful shutdown — drain in-flight requests before SIGTERM (graceful shutdown)
    startupProbe:
      httpGet: { path: /, port: 8080 }
      periodSeconds: 3
      failureThreshold: 30
    lifecycle:
      preStop:
        exec: { command: ["sh", "-c", "sleep 5"] }   # let endpoints drain first
# at pod level:
# spec.template.spec.terminationGracePeriodSeconds: 30
```
````

<!--
Speaker: FOUR frames, the HEALTH group — resources, probes, graceful shutdown. Each fixes exactly one
checklist line. Frame 1: resources (S13) — deliberately modest (50m/64Mi request) and the cost point:
don't pad "just in case," right-size to real usage. Frame 2: all three probes (S14) on port 8080 (the
port nginx-unprivileged serves) — readiness/liveness on / plus a generous startup budget. In the real
manifest probe the app's own health path; / is fine for this teaching image. Frame 3: the graceful
shutdown pair — a preStop hook that sleeps a few seconds so the Pod leaves the Service endpoints and
finishes in-flight requests before SIGTERM, and terminationGracePeriodSeconds at pod level (shown as a
comment; it's set in the full file). preStop needs a shell — nginx-unprivileged has one, and it runs
before caps are dropped matters not, sleep needs nothing. Next group: security.
-->

---
layout: code-walkthrough
heading: 'Fix II · security — one fix per step (labels, S02, S17)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: still on a mutable tag, ad-hoc label, no securityContext
metadata:
  labels: { app: web }
spec:
  template:
    spec:
      containers:
        - name: web
          image: nginxinc/nginx-unprivileged:latest
```

```yaml
# 1: +recommended labels — the app.kubernetes.io/* set everything selects on (hygiene)
metadata:
  labels:
    app.kubernetes.io/name: web
    app.kubernetes.io/instance: web
    app.kubernetes.io/version: "1.27"
    app.kubernetes.io/part-of: workshop
    app.kubernetes.io/managed-by: argocd
```

```yaml
# 2: +digest pin — immutable bytes, not a movable tag (S02)
        - name: web
          # RESOLVE at rehearsal: docker buildx imagetools inspect … / crane digest
          image: nginxinc/nginx-unprivileged:1.27@sha256:0000000000000000000000000000000000000000000000000000000000000000
```

```yaml
# 3: +restricted securityContext — pod-level: non-root user + seccomp (S17)
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 101                         # the image's built-in non-root UID
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: web
          image: nginxinc/nginx-unprivileged:1.27@sha256:0000000000000000000000000000000000000000000000000000000000000000
```

```yaml
# 4: +restricted securityContext — container-level: no priv-esc, drop ALL caps (S17)
        - name: web
          image: nginxinc/nginx-unprivileged:1.27@sha256:0000000000000000000000000000000000000000000000000000000000000000
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
```
````

<!--
Speaker: FIVE frames, the SECURITY group. Frame 1: the recommended labels — app.kubernetes.io/name,
instance, version, part-of, managed-by. These aren't cosmetic: the Service selector, the PDB and
topologySpread selectors, the ServiceMonitor, and Argo all key off these, so getting them right is a
prerequisite for the other fixes to actually bind. Frame 2: pin by digest (S02) — @sha256:… so the
running bytes are the scanned bytes; the digest here is a PLACEHOLDER, resolved at rehearsal with
crane/buildx (say this out loud — it's ImagePullBackOff until resolved). Frames 3+4 are the restricted
securityContext, deliberately SPLIT: pod-level takes runAsNonRoot / runAsUser:101 / seccompProfile
(these are valid at pod scope and cover every container); container-level takes
allowPrivilegeEscalation:false and capabilities.drop:["ALL"] (these are container-only fields). All
four together are exactly what `restricted` gates. Next: availability plus the two sibling objects.
-->

---
layout: code-walkthrough
heading: 'Fix III · availability + the two sibling objects (HA, PDB, NetworkPolicy)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: replicas: 1, no strategy, no spread — one Pod, one node, one outage
spec:
  replicas: 1
```

```yaml
# 1: +replicas, +strategy, +spread — HA across nodes, controlled rollout (availability, S06)
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  template:
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector: { matchLabels: { app.kubernetes.io/name: web } }
```

```yaml
# 2: +PodDisruptionBudget — a SEPARATE object: keep ≥2 up through drains (availability)
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: web }
spec:
  minAvailable: 2
  selector:
    matchLabels: { app.kubernetes.io/name: web }
```

```yaml
# 3: +NetworkPolicy — a SEPARATE object: default-deny ingress for these Pods (S18)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: web-default-deny }
spec:
  podSelector:
    matchLabels: { app.kubernetes.io/name: web }
  policyTypes: [Ingress]        # no ingress rules below → deny all inbound
```
````

<!--
Speaker: FOUR frames, the AVAILABILITY group — and note frames 2 and 3 are SEPARATE OBJECTS, not
Deployment fields (be honest about this — a PDB is not a spec field). Frame 1 fixes the Deployment
itself: replicas:3, a revisionHistoryLimit so dead ReplicaSets don't accumulate, a RollingUpdate with
maxUnavailable:0/maxSurge:1 (never dip below full capacity during a rollout), and
topologySpreadConstraints so the three replicas land on different nodes — its labelSelector matches
the app.kubernetes.io/name:web label we added in the security group, which is exactly why labels came
first. Frame 2: a PodDisruptionBudget, minAvailable:2, selecting the same label — now a node drain
can't take us below two Pods. Frame 3: a default-deny NetworkPolicy (S18) selecting the same label —
podSelector on our Pods, policyTypes:[Ingress], no rules → deny all inbound; in the lab you'd then add
one explicit allow. Every selector keys off the SAME recommended label — that's the payoff of getting
labels right. The fixed Deployment on these slides IS the lab's fixed file.
-->

---

<span class="kw-kicker">The same restricted gate from Pod security — it checks the Pod, not the Deployment</span>

# The checklist meets admission

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- The flawed workload's **Pod** (no `securityContext`) meets `enforce: restricted`…
- …all four gates fail → **Forbidden**. `enforce` gates **Pods**, so a flawed *Deployment* is
  admitted but its **Pods** are rejected (`FailedCreate`) — the security line is still enforced *for* you.
- The **fixed** Pod — non-root, no priv-esc, drop `ALL`, seccomp — every gate passes → **admitted**.
- Admission catches that **one** line; **you** still owe the labels, digest, PDB, and NetworkPolicy.

</v-clicks>
</div>

<!--
Speaker: reuse the S17/S25 AdmissionGate — it visualises the FOUR restricted fields on a POD, which is
exactly the security line of our checklist. IMPORTANT accuracy point to say out loud: PSA `enforce`
gates PODS, not workload objects. So if you apply the flawed DEPLOYMENT to a restricted namespace, the
Deployment is CREATED — the rejection lands later, when the ReplicaSet controller tries to make the
Pods, as a FailedCreate event (kubectl describe rs). The gate still protects you (no violating Pod ever
runs), it just fires one level down. The animation shows the Pod-level check: (step 0) the flawed Pod
heads for the gate; (step 1) four gates fail → Forbidden, that Pod never exists; (step 2) the fixed
Pod; (step 3) four green, admitted. The honest caveat to land: admission only checks those four
securityContext fields — it does NOT verify you pinned a digest, added recommended labels, wrote a PDB,
or applied a NetworkPolicy. Those are review discipline (GitOps/CI is where you gate them). So
restricted admission is a floor, not the whole checklist — which is why the capstone is a checklist and
a review discipline, not one control. The lab proves this by dry-running the Pod template directly.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The deliverable · a checklist you keep, not a slide you forget</span>

# Ship the checklist as a repo artifact

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Commit it next to your manifests" icon="📄" variant="ok">
      A <code>PRODUCTION-CHECKLIST.md</code> in the repo — availability, security, operations — that
      every change is reviewed against. The lab prints the exact list.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Gate it in review / CI" icon="✅" variant="ok">
      Turn lines into checks: <code>restricted</code> admission (S17), a policy engine, a linter,
      required labels — so the list can't be skipped under deadline.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Reconcile it with GitOps" icon="🔁" variant="ok">
      The reviewed manifest is the Git source of truth (S21); the agent keeps the cluster matching it
      and self-heals drift. The checklist ships <em>with</em> the code.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="It's never 'done'" icon="🔁" variant="warn">
      New sections (CVEs, new nodes, new load) add lines. Treat it as living — revisit it every
      rollout, not once.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: the takeaway artifact. A checklist is only useful if it outlives this room — so the
deliverable is a PRODUCTION-CHECKLIST.md committed next to the manifests (the lab prints the exact
list so learners leave with it). Then make it un-skippable: turn lines into automated gates —
restricted admission (S17) blocks the security line, a policy engine or linter can require labels /
resources / probes, CI can fail a PR that regresses. And reconcile it with GitOps (S21): the reviewed
manifest is the Git source of truth, so the checklist travels with the code and drift self-heals.
Last card: it's living — every new threat, node type, or load pattern adds a line, so revisit it every
rollout, not once a year. That's the professional habit the whole course was building toward.
-->

---
layout: recap
heading: 'Recap — the whole course, as one list you run every time'
story: 'One flawed Deployment failed a dozen checklist lines at once; fixed one line per step, it became production-ready — and the same restricted gate that rejected it now admits it.'
next: 'S27 · Wrap-up & next steps — the red line, the Day-3 layers, and a checklist that ties them together'
---

- The capstone is **synthesis**, not a new resource: the **red line** (S05–S09) plus every Day-3
  layer, as **one checklist** — availability · security · operations
- **Availability:** probes (S14) · requests/limits (S13) · **PDB** · anti-affinity/**topology spread**
  · rollout strategy + `revisionHistoryLimit` · **>1 replica**
- **Security:** recommended **labels** · **digest** pin (S02) · **restricted** securityContext (S17) ·
  **NetworkPolicy** (S18) · config/secret hygiene
- **Operations:** **GitOps** (S21) · **observability** (S23) · **graceful shutdown**
  (`terminationGracePeriodSeconds` + `preStop`) · **cost** (right-size)
- **`restricted` admission enforces one line for you; the rest is review discipline** — ship the
  checklist as a repo artifact and gate it in CI/GitOps

<!--
Speaker: land the whole course. This section didn't teach a resource — it collected everything into a
list you run against every manifest, forever. Three groups: availability (survive failure and change),
security (resist compromise and drift), operations (deliver, observe, shut down, pay for it). The
mental hook is the before→after: one manifest failed a dozen lines simultaneously, and fixing one line
per step turned it production-ready — and the SAME restricted gate that rejected the flawed one admits
the fixed one. But admission only covers the security floor; labels, digests, PDBs, NetworkPolicy, and
right-sizing are review discipline — so commit the checklist as PRODUCTION-CHECKLIST.md and gate it in
CI/GitOps so it can't be skipped. Hand to the capstone lab (labs/day-3/26-capstone.md): audit the
flawed manifest yourself, fix every line, dry-run it against a restricted namespace, and confirm full
checklist coverage. That's the course.
-->

---
layout: lab
lab: labs/day-3/26-capstone.md
duration: 40 min
env: namespace ✓ / kind ✓
---

## Lab 26 — Capstone review

- **Self-audit first:** read the deliberately flawed manifest set and list **every** issue *before*
  revealing the answer key (~10 problems, each a checklist line)
- **Fix one issue per problem:** probes, resources, restricted `securityContext`, a **PDB**, a
  **digest** pin, a **NetworkPolicy**, graceful shutdown, recommended labels, HA + spread
- **Validate:** `kubectl apply --dry-run=server` the fixed set, then confirm a **restricted**
  namespace (`enforce=restricted`) **admits** the fixed Deployment
- **Answer:** which fixes are **availability** vs **security** vs **cost** — and confirm the fixed
  manifests cover the whole printed checklist
