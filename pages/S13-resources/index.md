---
layout: section-cover
day: Day 2
section: '13'
tier: core
track: Workloads
---

# Resources & limits

Reserve what you need, cap what you use — and know **how** each cap is enforced.

**core** · suggested Day 2 · Workloads track

<!--
Section S13 — Resources & limits. Timing: ~30 min slides + 30 min lab. Follows S12.
Outcome: learners can state what requests vs limits do (scheduling vs enforcement), the
CPU-throttle vs memory-OOMKill asymmetry, the three QoS classes by their EXACT rules, and
how LimitRange (per-object defaults/bounds) and ResourceQuota (namespace aggregate cap)
constrain a namespace.
Beats: problem (no resources → contention + unschedulable) · mental model (requests drive
scheduling, limits drive enforcement) · code-annotated (the requests/limits block on the web
Deployment) · magic-move (no resources → +requests → +limits) · ResourcePressure animation
(throttle vs OOMKill asymmetry) · QoS classes (Guaranteed/Burstable/BestEffort, precise
rules) · namespace guardrails (LimitRange vs ResourceQuota) · debrief → lab.
Animation: ResourcePressure.vue (new, self-contained). DEVIATION from the story's suggested
"scheduling fits/doesn't-fit" animation: the memorable state transition in S13 is the
throttle-vs-kill asymmetry, not scheduling — so the animation illustrates that instead.
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
          image: nginx:1.27
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
    image: nginx:1.27
    # (no resources block)
    # scheduler assumes ~0 → overcommit risk; QoS class: BestEffort
```

```yaml
# 2: +requests — now the scheduler RESERVES capacity (QoS → Burstable)
containers:
  - name: web
    image: nginx:1.27
    resources:
      requests:                     # what the scheduler holds for this Pod
        cpu: 100m
        memory: 128Mi
```

```yaml
# 3: +limits — add the runtime ceiling the kubelet enforces
containers:
  - name: web
    image: nginx:1.27
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
layout: comparison
heading: 'Namespace guardrails — so nobody has to remember'
leftHeading: 'LimitRange'
leftBadge: 'per-object'
rightHeading: 'ResourceQuota'
rightBadge: 'namespace total'
---

**Defaults & bounds for each object.** Applies at admission to every Pod/container in the
namespace.

```yaml
apiVersion: v1
kind: LimitRange
metadata: { name: defaults }
spec:
  limits:
    - type: Container
      default:            # limit if omitted
        cpu: 500m
        memory: 256Mi
      defaultRequest:     # request if omitted
        cpu: 100m
        memory: 128Mi
      max: { cpu: '2', memory: 1Gi }
```

<v-clicks>

- **Injects** requests/limits into Pods that omit them — a BestEffort Pod becomes Burstable.
- Rejects any container that asks **above `max`** / below `min`.

</v-clicks>

::right::

**One aggregate cap for the whole namespace.** The sum across all Pods can't exceed it.

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

- Once a quota names a resource, **every** Pod **must** set it — omit it → `must specify…`.
- Exceed the remaining budget → admission error `exceeded quota:` (nothing is created).

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
which happens to a Pod that very much exists. That contrast is the debrief question.
-->

---
layout: recap
heading: 'Debrief — reserve, cap, and know the enforcement path'
story: 'The OOMKilled container came back (RESTARTS 1); the Pod that broke the quota never existed at all — runtime vs admission enforcement.'
next: 'S14 · Health probes — readiness, liveness, startup, and how they gate traffic vs restart'
---

- **requests** drive **scheduling** (reserve + hold); **limits** drive **enforcement** (runtime ceiling)
- CPU over limit → **throttled** (slow, alive); memory over limit → **OOMKilled** (exit 137) → restarted
- **QoS** is *derived*: **Guaranteed** (all set, request==limit) · **Burstable** (some) · **BestEffort** (none) — sets eviction order
- **LimitRange** = per-object defaults/bounds (injects requests); **ResourceQuota** = namespace aggregate cap
- Two rejections, one insight: **OOMKilled** = runtime (kubelet restarts it) vs **exceeded quota** = admission (API server rejects — nothing created)

<!--
Speaker: land the through-line. The mental hook is the two enforcement moments: admission
(before the object exists — quota/LimitRange say "no, never") vs runtime (the object exists
and misbehaves — throttle or OOMKill). That's literally the debrief question in the lab: "why
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
