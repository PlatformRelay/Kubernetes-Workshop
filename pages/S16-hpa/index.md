---
layout: section-cover
image: /covers/section-16-elastic-herd.png
day: Day 2
section: '16'
tier: optional
track: Workloads
---

# Autoscaling (HPA)

Let the **herd** grow and shrink with demand.

**optional** · suggested Day 2 · Workloads track

<!--
Section S16 — Autoscaling (HPA). Timing: ~20 min slides + 20 min lab. Closes Day 2 (last
section, optional tier). Follows S15. Workloads track.
Animation: HpaScaling.vue (new, self-contained). DEVIATION from the outline's "reuse the herd
rolling animation, scaled by load" — RollingUpdate.vue models pod REPLACEMENT (old RS drains as
new fills), not a metric-driven COUNT change, so it doesn't fit; a focused component is the
right call (same reasoning as S13's ResourcePressure). Step-prop pure Vue/CSS per ADR 0001.
Outcome: learners can wire an HPA to a Deployment's CPU, know it scales on a % of the Pod's
`requests.cpu` (no request → no HPA — the tie-back to S13), read TARGETS/REPLICAS, and know why
scale-down lags (the stabilization window). VPA and Cluster Autoscaler named as neighbours.
Beats: problem (a fixed replica count is wrong both ways) · mental model (HPA = a controller:
watch a metric → compare to target → set replicas; callback to S03's reconcile loop) ·
code-annotated (the HPA object; the "% of request" dependency) · magic-move (HPA on the `web`
Deployment → add a load generator) · animation (gauge drives the herd) · scale behaviour
(stabilization window + policies) · neighbours (VPA / Cluster Autoscaler) · end-of-Day-2 recap ·
lab. CKx: CKA/CKAD autoscaling — HPA, its metrics dependency, relationship to requests.
-->

---
layout: statement
kicker: The problem
---

A **fixed** replica count is wrong **both** ways — you either pay for peak all day, or you fall over at peak.

Pick `replicas: 3` and you've frozen one number against a load that isn't constant. Size it for
the **midday spike** and it idles — and bills — at 3 a.m. Size it for the **quiet hours** and the
next traffic surge queues, times out, and drops requests. What you actually want is a controller
that **watches demand and moves the number for you** — up when it's busy, back down when it's not.

<!--
Speaker: the "why care" beat. Every workload we've run so far has a hand-picked replicas value —
a guess, frozen. Real load has a shape: daily peaks, weekly cycles, unpredictable spikes. A single
static number can't be right for all of it — over-provision and you waste money holding idle Pods;
under-provision and you drop traffic when it matters most. The fix is to stop hand-setting
replicas and let a controller drive it from a live signal. That controller is the
HorizontalPodAutoscaler: horizontal = more Pods (vs vertical = bigger Pods, which is VPA, later).
Hold that framing — HPA owns the replica count so you don't have to.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · a controller that sets replicas from a metric</span>

# The HPA is just another reconcile loop

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Watch → compare → act" kind="hpa" variant="ok">
      Every ~15s the HPA reads a <strong>metric</strong> (avg CPU across the Pods), compares it to
      your <strong>target</strong>, and writes a new <code>replicas</code> onto the Deployment.
      Same observe → diff → act loop as S03 — the workload's size is now the reconciled state.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="The formula" icon="🧮">
      <code>desired = ceil(current × currentUtil / targetUtil)</code>. At 2 Pods, 90% observed,
      50% target → <code>ceil(2 × 90/50) = 4</code>. Clamped to <code>[minReplicas, maxReplicas]</code>.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">where the metric comes from</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="metrics-server (the common case)" icon="📈">
    A cluster add-on that scrapes kubelet CPU/memory and serves the
    <strong>metrics.k8s.io</strong> API. No metrics-server → the HPA has nothing to read.
  </KwCard>
  <KwCard heading="custom / external (a nod)" icon="🌐">
    HPA can also scale on <strong>custom</strong> (per-Pod app metrics, e.g. requests/s) or
    <strong>external</strong> (a queue depth) via adapters. Same loop, richer signal.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: HPA isn't magic — it's the S03 reconcile loop pointed at one field. Its desired state is
"average CPU sits at the target"; the actuator it turns is the Deployment's replica count. The
formula is worth putting on the board: desiredReplicas = ceil(currentReplicas × currentMetric /
targetMetric). Two Pods running hot at 90% against a 50% target → it wants 4; the ceil and the
min/max clamp keep it sane. The metric source matters for the lab: the default is metrics-server,
a separate add-on that serves the metrics.k8s.io API from kubelet stats — if it isn't installed
(or isn't Ready), `kubectl top` is empty and the HPA reports TARGETS <unknown>. Custom and
external metrics (via the custom.metrics.k8s.io / external.metrics.k8s.io adapters) let you scale
on app-level signals or a queue — name them so learners know CPU isn't the only axis, but we drive
CPU today.
-->

---
layout: code-annotated
heading: 'The one dependency that trips everyone: % of the request'
compact: true
lab: labs/day-2/16-hpa.md
---

```yaml {none|1-2|5-8|9-10|11-17}
apiVersion: autoscaling/v2       # v2 — the current, GA HPA API (v1 was CPU-only)
kind: HorizontalPodAutoscaler
metadata: { name: web, labels: { app: s16 } }
spec:
  scaleTargetRef:                # WHAT it scales — a Deployment, by name
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2                 # never below this…
  maxReplicas: 10                # …never above this
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50 # 50% OF EACH POD'S requests.cpu — not 50% of a core
```

::notes::

<CodeNote at="1" label="autoscaling/v2 — use v2" variant="ok">
The GA API. <code>v2</code> supports memory, multiple metrics, custom/external sources and
scaling <code>behavior</code>; the old <code>v1</code> was CPU-only. Reach for v2 always.
</CodeNote>

<CodeNote at="2" label="scaleTargetRef — the object it drives">
The HPA owns this Deployment's <code>replicas</code>. Don't also hard-set <code>replicas</code>
in the Deployment — the HPA will fight it. It can target any scalable workload (Deployment,
StatefulSet, ReplicaSet).
</CodeNote>

<CodeNote at="3" label="min / max — the guardrails">
The clamp on the formula. <code>minReplicas</code> keeps a floor of capacity; <code>maxReplicas</code>
caps blast radius (and cost). The HPA never scales outside this band.
</CodeNote>

<CodeNote at="4" label="Utilization = % of requests.cpu — the S13 tie-back" variant="danger">
<code>averageUtilization: 50</code> means "hold average CPU at <strong>50% of each Pod's
<code>requests.cpu</code></strong>." No <code>requests.cpu</code> on the Pod → the % has no
denominator → HPA shows <code>TARGETS &lt;unknown&gt;</code> and <strong>cannot scale</strong>.
</CodeNote>

<!--
Speaker: this is THE slide of the section — the failure mode everyone hits once. `averageUtilization`
is a percentage OF the Pod's requests.cpu, set back in S13. So the target is relative: with
requests.cpu: 200m and averageUtilization: 50, the HPA aims to keep each Pod near 100m of actual
CPU. Remove the request and the percentage has no base — the HPA can't compute utilization, reports
TARGETS <unknown>, and sits frozen at its current replica count. That's the lab's break→fix. Contrast
Utilization with AverageValue (an absolute figure like 100m per Pod), which does NOT need a request —
but Utilization is what people reach for and where the request dependency bites. Land it: an HPA on
CPU utilization is only as valid as the requests underneath it. requests → scheduling (S13) AND
autoscaling (here).
-->

---
layout: code-walkthrough
heading: 'Wire it to the running app — then give it something to react to'
lab: labs/day-2/16-hpa.md
---

````md magic-move
```yaml
# 1: the target Deployment — the request is what makes it autoscalable
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s16 } }
spec:
  replicas: 2                          # a starting point; the HPA takes over from here
  selector: { matchLabels: { app: s16 } }
  template:
    metadata: { labels: { app: s16 } }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example   # a CPU-burning demo (static nginx won't move)
          resources:
            requests: { cpu: 200m }    # <- the denominator the HPA scales against
```

```yaml
# 2: add the HPA — it now owns replicas, driving CPU toward 50% of that 200m request
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web, labels: { app: s16 } }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: web }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 50 } }
```

```yaml
# 3: give it load — a client that hammers the Service in a tight loop
apiVersion: apps/v1
kind: Deployment
metadata: { name: load, labels: { app: s16-load } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s16-load } }
  template:
    metadata: { labels: { app: s16-load } }
    spec:
      containers:
        - name: load
          image: busybox:1.37
          # hit the web Service forever → CPU climbs → HPA scales web up
          command: ["sh","-c","while true; do wget -q -O- http://web; done"]
```
````

<!--
Speaker: three frames, one wiring diagram. (1) The Deployment — note the image is the canonical
CPU-burning demo (registry.k8s.io/hpa-example, a php-apache that does real work per request), NOT
the static nginx from the red line: a static server answers a wget in microseconds and never moves
CPU, so the HPA would sit flat and the whole demo would silently no-op. This is the lab's target,
and the requests.cpu: 200m is the denominator from the previous slide. (2) The HPA takes ownership
of replicas — from here you do NOT set replicas by hand. (3) The load generator: a throwaway
Deployment whose only job is to curl the web Service in a tight loop, driving aggregate CPU past
the 50% target so the HPA reacts. In the lab you scale the load generator up (or run several) to
push harder, then delete it to watch scale-down. Note the load Pods carry a DIFFERENT selector
label (app: s16-load) so they aren't picked up by the web Service or its HPA. This is the compact
teaching view; the lab ships the full block-style files plus the metrics-server install.
-->

---

<span class="kw-kicker">The control loop, made physical · load drives the herd</span>

# Watch the gauge move the count

<div class="mt-2">
  <HpaScaling :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **Load spikes** to 90% — over the 50% target. The HPA computes `ceil(2 × 90/50) = 4`.
- **Scaled up to 4** — the same load now spreads across more Pods, so per-Pod CPU falls back.
- **Settled** — utilization sits at the target, desired == current, the herd holds.
- **Load gone**, CPU drops — but replicas **hold** for the scale-down window, then shrink to min.

</v-clicks>
</div>

<!--
Speaker: drive with clicks. (0) steady at min, gauge low. (1) load hits, gauge jumps past the
dashed target line, the formula chip recomputes desired=4. (2) the herd grows to 4 and — key
insight — the gauge eases back down, because the SAME total load divided over more Pods is less
per Pod; autoscaling is negative feedback finding equilibrium. (3) it settles where per-Pod CPU ==
target. (4) load disappears, the gauge drops, but the herd does NOT immediately shrink — it holds
for the scaleDown stabilization window (default 300s) before returning to min. That asymmetry is
the next slide: scale up fast, scale down slow. This is the lab beat 3 (why did scale-down lag?).
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Scale behaviour · why up is fast and down is slow</span>

# Stabilization stops the flapping

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="Scale UP — responsive" kind="hpa" variant="ok">
      Default <code>stabilizationWindowSeconds: 0</code> for up: react to a spike almost
      immediately. Policies cap the <em>rate</em> (e.g. at most +100% or +4 Pods per 15s) so it
      climbs fast but not without bound in one tick.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Scale DOWN — cautious" icon="🕒">
      Default <code>stabilizationWindowSeconds: 300</code> for down: the HPA uses the
      <strong>highest</strong> desired count over the last 5 min. A brief dip won't shrink you —
      it waits to be sure the lull is real.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-3 text-sm">

```yaml {all}
  behavior:                        # spec.behavior — override the defaults per direction
    scaleDown:
      stabilizationWindowSeconds: 300   # ← the "why did scale-down lag?" answer
      policies: [{ type: Pods, value: 1, periodSeconds: 60 }]   # at most -1 Pod/min
```

</div>

<div v-click="4" class="mt-2 kw-muted text-sm">

The asymmetry is deliberate: **under-reacting to a spike drops traffic; over-reacting to a lull
just thrashes Pods.** So HPA errs toward capacity — quick up, patient down.

</div>

</div>

<!--
Speaker: this explains the animation's last step and answers the lab's headline question. HPA
scaling is intentionally asymmetric. Scale-up stabilization defaults to 0 — a real spike should be
met now; scale-up *policies* bound the per-interval rate so it doesn't overshoot wildly in a single
loop. Scale-down stabilization defaults to 300s: the controller looks back over the window and
takes the HIGHEST recommendation in it, so a momentary dip in load can't shrink the fleet — it has
to stay low for the whole window first. You tune both under spec.behavior (v2). The mental model to
leave them with: the cost of scaling down too eagerly is thrash (and dropped capacity right before
the next spike); the cost of scaling up too eagerly is small. So the defaults lean toward keeping
capacity — fast up, slow down. That 300s is exactly why, in the lab, replicas linger after you kill
the load generator.
-->

---
layout: comparison
heading: 'Three autoscalers, three axes — HPA is only one'
leftHeading: 'HPA — more Pods'
leftBadge: 'horizontal · in scope'
rightHeading: 'VPA & Cluster Autoscaler'
rightBadge: 'other axes · neighbours'
---

**HPA scales the workload OUT** — it changes `replicas`.

- Reacts to live load: more Pods when busy, fewer when idle.
- Needs a metric source (metrics-server) and `requests.cpu` to scale on utilization.
- The right tool when your app scales by **adding identical copies**.

<v-clicks>

- ⚠️ Doesn't help if a **single** Pod is simply under-resourced — that's a VPA job.

</v-clicks>

::right::

**Two adjacent tools solve different problems — named, not covered today:**

- **VPA (Vertical Pod Autoscaler)** — right-sizes a Pod's `requests`/`limits` (bigger Pods, not
  more). Useful for right-sizing; **don't run it on CPU for the same workload as an HPA** — they
  fight over the same signal.
- **Cluster Autoscaler** — adds/removes **nodes** when Pods can't be scheduled (or nodes sit
  empty). HPA makes more Pods; Cluster Autoscaler makes room for them.

<v-clicks>

- ✅ They compose: HPA adds Pods → they don't fit → Cluster Autoscaler adds a node.

</v-clicks>

<!--
Speaker: keep the three axes straight so nobody conflates them. HPA = horizontal = more replicas,
reacting to load — today's topic. VPA = vertical = right-size one Pod's requests/limits; great for
"my Pod is chronically OOMKilled or over-provisioned," but the classic footgun is running VPA and
HPA on the SAME metric (CPU) for the SAME workload — they chase each other, so pair HPA-on-CPU with
VPA-on-memory at most, or keep them apart. Cluster Autoscaler operates on NODES, not Pods: when the
HPA (or anything) creates Pods that can't schedule for lack of capacity, Cluster Autoscaler adds a
node; when nodes idle, it drains and removes them. The composition is the takeaway: HPA increases
demand for capacity, Cluster Autoscaler supplies it — and VPA tunes the size of each unit. All three
are current CNCF-ecosystem tools; only HPA is built into core and in scope here.
-->

---
layout: recap
heading: 'Recap — and that closes Day 2'
story: 'The herd grew from 2 to 10 under load and drifted back to 2 after the window — the replica count is no longer a number you guess, it is a signal the cluster tracks.'
next: 'Day 3 · S17 Pod security — lock down what a container may do at runtime'
---

- **HPA = a reconcile loop on `replicas`:** watch avg CPU → `ceil(current × util/target)` → clamp to `[min,max]`
- **Utilization is % of `requests.cpu`** — no request → `TARGETS <unknown>` → no scaling (the S13 tie-back)
- **`autoscaling/v2`**, `scaleTargetRef` the Deployment, and **don't** also hand-set `replicas`
- **Asymmetric by design:** scale up fast (window 0), scale **down** slow (window **300s**) — that's why the fleet lingers
- **Neighbours:** VPA right-sizes Pods · Cluster Autoscaler adds nodes — HPA only adds Pods

<div class="mt-4 text-sm kw-muted">

**Day 2 layered onto one running app:** Gateway API routing (S09) · ConfigMap/Secret (S10) ·
storage & StatefulSet (S11–S12) · requests/limits & QoS (S13) · probes (S14) · Jobs/CronJobs
(S15) · **and now it autoscales (S16)**. The `web` app now routes, persists, self-heals, and
right-sizes to load.

</div>

<!--
Speaker: land the section AND the day. HPA is the reconcile loop from S03 with replicas as the
reconciled field: it reads average CPU, applies desired = ceil(current × util/target), and clamps
to [min,max]. The one thing they must not forget: utilization is relative to requests.cpu, so an
HPA is only valid on a Pod that declares a CPU request — the same request that drives scheduling in
S13 now drives autoscaling. autoscaling/v2 is the API; let the HPA own replicas (setting both is a
tug-of-war). And the asymmetry — fast up, slow down (300s default) — is why the lab's replicas don't
snap back the instant load stops. Then zoom out: over Day 2 we took the red-line app and made it
route with Gateway API, externalize config, persist state as a StatefulSet, declare resources and
QoS, expose health via probes, run batch work, and now autoscale. Day 3 shifts from "run it well"
to "run it safely" — starting with S17 Pod security.
-->

---
layout: lab
lab: labs/day-2/16-hpa.md
duration: 20 min
env: kind ✓ (metrics-server) / namespace read-only
---

## Lab 16 — Scale under load

- Confirm **metrics-server** (`kubectl top pods` returns data), apply a CPU-bound Deployment
  **with `requests.cpu`** + an HPA (`min`/`max`, 50% target)
- Generate load → watch `TARGETS` cross 50% and `REPLICAS` climb toward max; stop it → watch it
  **settle back after the window**
- **Break→fix:** remove `requests.cpu` → `TARGETS <unknown>`, HPA can't scale → restore it
- Answer the headline: *why did scale-down lag behind the load dropping?*
