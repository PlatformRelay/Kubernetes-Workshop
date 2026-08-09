---
layout: section-cover
image: /covers/section-13-rationing-hall.webp
day: Day 2
section: '13'
tier: core
track: Workloads
---

# Resources & limits

Reserve what you need, cap what you use — and know **how** each cap is enforced.

**core** · suggested Day 2 · Workloads track

<!--
Section S13 — Resources & limits. Timing: ~35 min slides + 30 min lab. Follows S12.
Outcome: learners can state what requests vs limits do (scheduling vs enforcement), the
CPU-throttle vs memory-OOMKill asymmetry, the three QoS classes by their EXACT rules,
how to right-size from observed usage (kubectl top → request ≈ steady state, limit =
burst headroom; VPA recommends at scale), and
how LimitRange (per-object defaults/bounds) and ResourceQuota (namespace aggregate cap)
constrain a namespace.
Beats: problem (no resources → contention + unschedulable) · mental model (requests drive
scheduling, limits drive enforcement) · code-annotated (the requests/limits block on the web
Deployment) · magic-move (no resources → +requests → +limits) · ResourcePressure animation
(throttle vs OOMKill asymmetry) · QoS classes (Guaranteed/Burstable/BestEffort, precise
rules) · right-sizing (RightSizing usage-graph animation + the kubectl top observation
loop) · namespace guardrails (LimitRange vs ResourceQuota) · recap → lab.
Animations: ResourcePressure.vue and RightSizing.vue (both self-contained). DEVIATION from
the story's suggested "scheduling fits/doesn't-fit" animation: the memorable state
transition in S13 is the throttle-vs-kill asymmetry, not scheduling — so the first
animation illustrates that instead. RightSizing.vue rationale: right-sizing is a
time-series story (usage vs request vs limit reference lines), a genuinely new
transition no existing component draws.
Right-sizing ACCURACY LOCKS: kubectl top needs metrics-server (the S16 add-back
installs it on kind — say so, don't imply it's built in); VPA (VerticalPodAutoscaler)
is an install-yourself autoscaler that recommends/applies request updates from observed
usage — keep it named-concept-only, no install surface; HPA (S16) scales out while VPA
sizes the Pod — the caution is not to let both act on the same resource dimension.
CKx: CKAD/CKA — requests/limits, QoS, LimitRange, ResourceQuota.
-->

---
layout: statement
kicker: The problem
---

Set **no** resources and you're gambling with the whole node.

The `web` Deployment has run all day with a token `requests` and no ceiling. On a busy node
that's two failures waiting: a **noisy neighbour** balloons and starves everyone sharing the
box, and the scheduler — with nothing to reserve — **overcommits** until Pods get evicted or
never fit. Two numbers fix both: a **request** (what you reserve) and a **limit** (what you
may use).

<!--
Speaker: this is the "why should I care" beat. Two distinct failure modes, and they map to
the two numbers. (1) No limit → a memory leak or a runaway loop in one Pod consumes the node
and degrades or kills its neighbours (the noisy-neighbour problem). (2) No request → the
scheduler treats the Pod as needing ~nothing, packs the node, and now real demand exceeds
capacity: Pods get OOM-evicted or new Pods stay Pending. The whole section is: requests solve
the scheduling side, limits solve the enforcement side. Hold the mental model — next slide.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · two numbers, two jobs</span>

# Requests schedule · limits enforce

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="requests — what the scheduler reserves" kind="pod" variant="ok">
      The Pod only lands on a node with this much <strong>free capacity</strong>, and that
      amount is <strong>held</strong> for it. Drives <strong>scheduling</strong> and QoS.
      Too high → Pod stays <code>Pending</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="limits — the ceiling the kubelet imposes" kind="pod" variant="warn">
      The most the container may use at runtime. Drives <strong>enforcement</strong>. Exceed
      it and — depending on the resource — you're <strong>throttled</strong> or
      <strong>killed</strong>.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the asymmetry that trips everyone up</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="CPU is compressible" icon="🎚️">
    Over the limit → <strong>throttled</strong>: the kernel caps its CPU share. Slow, but
    <strong>never killed</strong>.
  </KwCard>
  <KwCard heading="Memory is incompressible" icon="💥" variant="danger">
    Over the limit → <strong>OOMKilled</strong>: you can't "throttle" RAM, so the kernel
    <strong>kills</strong> the container (exit 137).
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: the single most important slide. requests and limits look symmetric in YAML but do
completely different jobs. requests is a SCHEDULING input — the scheduler sums requests on a
node and only binds a Pod if the request fits the allocatable remainder; it's a reservation,
not a measurement of actual use. limits is a RUNTIME input — the kubelet programs cgroups so
the container can't exceed it. Then the asymmetry (click 3): CPU is compressible, so "too
much" just means the CFS scheduler throttles it — the container slows down but survives.
Memory is incompressible — there's no "use it a bit slower," so the kernel OOM-kills the
container (exit code 137 = 128 + SIGKILL 9). Learners conflate these constantly; the animation
two slides on makes it physical. CKA/CKAD resource-management domain.
-->

---
layout: code-annotated
heading: 'One resources block, four numbers'
compact: true
lab: labs/day-2/13-resources.md
---

```yaml {none|7-9|10-12|8,11|9,12}
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s13 } }
spec:
  template:
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          resources:
            requests: { cpu: 100m, memory: 128Mi }   # reserve
            limits:   { cpu: 500m, memory: 256Mi }    # cap
```

::notes::

<CodeNote at="1" label="requests = the reservation" variant="ok">
The scheduler only places this Pod where <strong>100m CPU + 128Mi</strong> is free, and holds
it. <code>100m</code> = 0.1 of one core (<code>m</code> = millicores). Memory is bytes;
<code>Mi</code> = mebibytes (2²⁰), <code>M</code> = megabytes (10⁶) — not the same.
</CodeNote>

<CodeNote at="2" label="limits = the ceiling" variant="warn">
Runtime cap. CPU over <code>500m</code> → throttled; memory over <code>256Mi</code> →
OOMKilled. A <code>limit</code> with no <code>request</code> makes Kubernetes copy the limit
down to the request.
</CodeNote>

<CodeNote at="3" label="CPU: request &lt; limit = burst room">
The container is guaranteed <code>100m</code> and may burst to <code>500m</code> <em>if the
node has spare CPU</em>. That gap is why this Pod's QoS is <strong>Burstable</strong>.
</CodeNote>

<CodeNote at="4" label="memory: mind the gap" variant="danger">
It can climb to <code>256Mi</code> before the kill — but nothing <em>reserves</em> past
<code>128Mi</code>, so under node pressure the extra isn't protected.
</CodeNote>

<!--
Speaker: decode the units, they cause real bugs. CPU is millicores: 1000m = 1 vCPU, 100m =
1/10th of a core, and it's a rate not a quota. Memory suffixes: Mi/Gi are binary (1Mi =
1048576 bytes), M/G are decimal (1M = 1000000) — mixing them up gives you ~5% surprises and
occasionally a failed scheduling. The request/limit gap on CPU is legitimate burst headroom;
on memory the gap is more dangerous because anything above the request isn't reserved, so the
node can reclaim it. Fourth note foreshadows QoS: request != limit here → Burstable. Compact
teaching view; the lab ships the full applyable manifests.
-->

---
layout: code-walkthrough
heading: 'Build it up — from BestEffort to a capped Burstable Pod'
lab: labs/day-2/13-resources.md
---

````md magic-move
```yaml
# 1: no resources at all — the web container as it started the day
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    # (no resources block)
    # scheduler assumes ~0 → overcommit risk; QoS class: BestEffort
```

```yaml
# 2: +requests — now the scheduler RESERVES capacity (QoS → Burstable)
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    resources:
      requests:                     # what the scheduler holds for this Pod
        cpu: 100m
        memory: 128Mi
```

```yaml
# 3: +limits — add the runtime ceiling the kubelet enforces
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:                       # over CPU → throttled; over memory → OOMKilled
        cpu: 500m
        memory: 256Mi
```
````

<!--
Speaker: THREE frames, each a real QoS state. (1) No resources → BestEffort: scheduler thinks
the Pod needs nothing, first to be evicted under pressure. (2) Add requests → the scheduler
now reserves and the class flips to Burstable; note we could stop here — a Pod with requests
and no limits is valid and common (reserve a floor, allow bursting). (3) Add limits → the
kubelet programs the cgroup ceiling; still Burstable because request != limit. To reach
Guaranteed you'd set limits == requests for BOTH cpu and memory (next-but-one slide). This
grows the same web container the deck has carried since S06; the lab applies the block-style
files.
-->

---

<span class="kw-kicker">Same limit breach · opposite outcome</span>

# Throttled vs killed, live

<div class="mt-2">
  <ResourcePressure :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Both containers push **past** their limit — the enforcement path forks by resource.
- **CPU** is compressible → the kernel **throttles** it. Slow, still `Running`, no restart.
- **Memory** is incompressible → the kernel **OOMKills** it (`exit 137`).
- The kubelet **restarts** the killed container per `restartPolicy` → `RESTARTS 1` (a real
  memory leak becomes `CrashLoopBackOff`).

</v-clicks>
</div>

<!--
Speaker: drive with clicks; this is the section's punchline made physical. (0) both under
their limits, nothing to enforce. (1) both breach. (2) CPU lane clamps at the ceiling and
stays Running — throttling is invisible in `get pods` (STATUS still Running), you only see it
in metrics/latency; the memory lane hits the ceiling and gets SIGKILLed, exit 137. (3) the
kubelet restarts the memory container (RESTARTS increments); if it OOMs again you get
CrashLoopBackOff with the backoff timer. The takeaway learners must leave with: "Running" does
NOT mean healthy — a throttled Pod is silently slow, and RESTARTS climbing with OOMKilled in
`describe` means the memory limit is too low (or the app leaks). This is exactly the lab's
break→fix.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">QoS class · assigned by Kubernetes from what you set — never typed by you</span>

# Three QoS classes, three eviction priorities

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="Guaranteed" icon="🟢" variant="ok">
      <strong>Every</strong> container sets <strong>both</strong> cpu &amp; memory, and each
      <code>request == limit</code>.
      <div class="kw-muted mt-1">Last to be evicted. (limits-only counts — Kubernetes copies
      them to requests.)</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Burstable" icon="🟡" variant="warn">
      At least one request or limit set, but <strong>not</strong> Guaranteed.
      <div class="kw-muted mt-1">Our <code>web</code> Pod — reserves a floor, may burst to the
      ceiling. Evicted after BestEffort.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="BestEffort" icon="🔴" variant="danger">
      <strong>No</strong> requests or limits <strong>anywhere</strong> in the Pod.
      <div class="kw-muted mt-1">First to be evicted under node memory pressure. Fine for
      throwaway, dangerous for anything you care about.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

You don't <em>choose</em> a QoS class — Kubernetes <strong>derives</strong> it from your
`resources` and shows it in <code>kubectl describe pod</code> (<code>QoS Class:</code>). It
decides <strong>eviction order</strong> when a node runs out of memory.

</div>

</div>

<!--
Speaker: precision matters here — the AC shorthand "some set" is loose, so state the exact
rules. GUARANTEED: every container in the Pod has both cpu AND memory set, and for each the
request equals the limit. Subtle gotcha worth saying out loud: if you set ONLY limits,
Kubernetes copies them into requests, so a limits-only Pod is still Guaranteed, not Burstable.
BURSTABLE: at least one container has some request or limit, but the Pod doesn't meet the
Guaranteed bar — this is the common real-world case. BESTEFFORT: nothing set anywhere. Why it
matters: under node memory pressure the kubelet evicts BestEffort first, then Burstable
exceeding requests, and Guaranteed last — so QoS is your eviction insurance. You never type a
QoS class; it's derived and shown in `describe pod`. The lab confirms all three by reading
`describe`.
-->

---
clicks: 3
---

<span class="kw-kicker">Right-sizing · the numbers come from a graph, not from vibes</span>

# Right-size against what the app actually uses

<div class="mt-2">
  <RightSizing :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- A **guessed** request reserves capacity nobody uses — the node's ledger fills up with fiction and real Pods go `Pending`.
- **Right-size:** set the request at observed **steady state** — the reservation matches reality.
- Set the **limit** as burst headroom above it — the daily peak fits, nothing is OOMKilled, nothing is hoarded.

</v-clicks>
</div>

<!--
Speaker: drive with clicks — this is the dashboard-graph moment every platform team
lives in. (0) the only truth: observed usage, steady state ~90Mi with one daily
burst. (1) the guessed request, 512Mi "to be safe": the shaded band is capacity the
scheduler HOLDS — remember, requests are a reservation, not a measurement — so a
node full of guessed requests is "full" while its actual usage idles; that's how
clusters end up 30% utilised and still rejecting Pods. (2) right-size: request just
above steady state — the same Pod, honestly booked. (3) the limit as burst
headroom: the peak fits under 256Mi, so no OOMKill (asymmetry beat!), and nothing
above the request is hoarded. The two failure directions to say out loud:
request too HIGH wastes the cluster (money, Pending neighbours); limit too LOW
kills the burst (exit 137, from the animation earlier). Next slide: where these
observed numbers come from.
-->

---
layout: code-annotated
heading: 'The observation loop — `kubectl top`, then adjust'
compact: true
lab: labs/day-2/13-resources.md
---

```console {none|1-3|5|all}
$ kubectl top pod -l app=s13     # usage vs what you set
NAME                    CPU(cores)   MEMORY(bytes)
web-6d5f8c7b9d-x2x7v    3m           92Mi

$ kubectl describe node <node>   # → "Allocated resources"
```

::notes::

<CodeNote at="1" label="usage, live" variant="ok">
Steady <code>92Mi</code> against a <code>128Mi</code> request is honest; against
<code>512Mi</code> it's hoarding. Needs <strong>metrics-server</strong> (the HPA
section installs it).
</CodeNote>

<CodeNote at="2" label="the node's ledger">
<code>Allocated resources</code> sums every Pod's <strong>requests</strong>
against allocatable. A wide gap between <em>requested</em> and <em>used</em> is
right-sizing debt.
</CodeNote>

<CodeNote at="3" label="a loop — and VPA at scale" variant="ok">
Observe → adjust → watch (<code>OOMKilled</code>, throttling,
<code>Pending</code>). At scale the <strong>VerticalPodAutoscaler</strong>
recommends sizes; HPA scales <em>out</em> — don't point both at one resource.
</CodeNote>

<!--
Speaker: the graph on the previous slide is aspirational until you have numbers —
this is where they come from. kubectl top reads the metrics pipeline
(metrics-server), which is an add-on: kind doesn't ship it, the S16 HPA section
installs it, and managed clusters usually have it. Real teams watch longer windows
than a live top — a metrics stack (S23's Prometheus + Grafana) gives you the
percentiles; top is the five-second version of the same loop. describe node's
Allocated resources table is the scheduler's ledger from the mental-model slide
made visible — walk it: requests summed vs allocatable, and the gap to actual
usage is exactly the shaded band from the graph. Close with the automation ladder:
VPA observes per-Pod usage and recommends (or applies) request changes —
concept-level here, it's a separate install and applying mode restarts Pods; HPA
changes REPLICAS instead. The classic caution: don't let VPA resize and HPA scale
on the same metric or they chase each other. Lab 13's break→fix already showed the
failure modes right-sizing avoids.
-->

---
layout: comparison
class: kw-cmp-compact
heading: 'Namespace guardrails — so nobody has to remember'
leftHeading: 'LimitRange'
leftBadge: 'per-object'
rightHeading: 'ResourceQuota'
rightBadge: 'namespace total'
---

Defaults & bounds **per container**, at admission.

```yaml
apiVersion: v1
kind: LimitRange
metadata: { name: defaults }
spec:
  limits:
    - type: Container
      default: { cpu: 500m, memory: 256Mi }
      defaultRequest: { cpu: 100m, memory: 128Mi }
      max: { cpu: '2', memory: 1Gi }
```

<v-clicks>

- **Injects** requests/limits when omitted → BestEffort becomes Burstable.
- Rejects containers **above `max`** / below `min`.

</v-clicks>

::right::

One **namespace-wide** aggregate cap — sum of all Pods.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata: { name: team-cap }
spec:
  hard:
    requests.cpu: '2'
    requests.memory: 2Gi
    limits.cpu: '4'
    limits.memory: 4Gi
    pods: '10'
```

<v-clicks>

- Quota names a resource → every Pod **must** set it (`must specify…`).
- Over budget → admission `exceeded quota:` (nothing created).

</v-clicks>

<!--
Speaker: two different jobs, both admission-time. LimitRange is PER-OBJECT: it supplies default
requests/limits to containers that don't set them (which is how you stop BestEffort Pods
sneaking in) and enforces min/max per container. ResourceQuota is the NAMESPACE AGGREGATE cap:
the sum of all requests/limits (and object counts) can't exceed the hard values. The
interaction the lab exploits: once a quota constrains say requests.memory, a Pod that OMITS it
fails with "must specify requests.memory", while a Pod that SETS IT TOO HIGH fails with
"exceeded quota" — two different errors, and LimitRange's defaults are what save you from the
first. Both reject at admission, so the Pod never exists — contrast that with the OOMKill,
which happens to a Pod that very much exists. That contrast is the recap question.
-->

---
layout: recap
heading: 'Recap — reserve, cap, and know the enforcement path'
story: 'The OOMKilled container came back (RESTARTS 1); the Pod that broke the quota never existed at all — runtime vs admission enforcement.'
next: 'Health probes — readiness, liveness, startup, and how they gate traffic vs restart'
---

- **requests** drive **scheduling** (reserve + hold); **limits** drive **enforcement** (runtime ceiling)
- CPU over limit → **throttled** (slow, alive); memory over limit → **OOMKilled** (exit 137) → restarted
- **QoS** is *derived*: **Guaranteed** (all set, request==limit) · **Burstable** (some) · **BestEffort** (none) — sets eviction order
- **LimitRange** = per-object defaults/bounds (injects requests); **ResourceQuota** = namespace aggregate cap
- Two rejections, one insight: **OOMKilled** = runtime (kubelet restarts it) vs **exceeded quota** = admission (API server rejects — nothing created)

<!--
Speaker: land the through-line. The mental hook is the two enforcement moments: admission
(before the object exists — quota/LimitRange say "no, never") vs runtime (the object exists
and misbehaves — throttle or OOMKill). That's literally the recap question in the lab: "why
was the OOMKilled container restarted but the quota-violating Pod never created?" — because one
is enforced by the kubelet at runtime and the other by the API server at admission. Right-size
by watching real usage (kubectl top, metrics) and set requests to the steady state, limits to
a safe burst headroom; memory limit ≈ request for anything you can't afford to have killed.
Hand to Lab 13: read all three QoS classes, force an OOMKill and read exit 137, then hit a
ResourceQuota. Next section: probes — the other reason a Running Pod isn't necessarily healthy.
-->

---
layout: lab
lab: labs/day-2/13-resources.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 13 — Pressure test

- Apply Burstable / Guaranteed / BestEffort variants and read the **QoS Class** from
  `kubectl describe pod`
- **Break→fix:** run a container that allocates past its memory limit → **OOMKilled**
  (`exit 137`, restarts) → raise the limit and confirm it stabilises
- Apply a **ResourceQuota**, then try to create a Pod that **exceeds** it → admission error
  `exceeded quota:`
- Answer the headline: *why was the OOMKilled container restarted, but the quota-violating
  Pod never created?*
