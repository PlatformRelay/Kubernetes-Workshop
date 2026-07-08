---
layout: section-cover
image: /covers/section-14-clinic.png
day: Day 2
section: '14'
tier: core
track: Workloads
---

# Health probes

A `Running` Pod isn't necessarily **ready** to serve — or even **healthy**.

**core** · suggested Day 2 · Workloads track

<!--
Section S14 — Health probes. Timing: ~30 min slides + 30 min lab. Follows S13.
Outcome: learners can state what each of the three probes does — readiness gates traffic,
liveness restarts the container, startup protects slow starters and suspends the other two —
the probe mechanisms (httpGet/tcpSocket/exec/grpc) and key timing fields, and the classic
misconfigurations (flapping liveness, readiness that never passes).
Beats: problem (Running ≠ ready ≠ healthy) · mental model (three probes, three jobs) ·
code-annotated (a readiness probe, every field decoded) · magic-move (+readiness → +liveness
→ +startup on the through-line web Deployment) · ServiceRouting animation REUSED (readiness
fail drains one Pod from the EndpointSlice, zero downtime — the US-X3 variant the component was
built for) · two-divergent-arrows fork (readiness ✗ = out of endpoints, no restart / liveness
✗ = restart) · misconfig beat · debrief → lab.
Animation: ServiceRouting.vue REUSED per the AGENT.md reuse guardrail and the US-S14 AC
("reused animation, US-X3 variant, extends S07"); no new component. The liveness half of the
"two divergent arrows" is a static KwCard fork, not a second animation.
Red line: extends the S06/S07 `web` Deployment by adding probes; the magic-move final frame
matches the lab's deployment-probes.yaml container spec byte-for-byte (S07/S08 anchor style).
CKx: CKAD Observability — liveness/readiness/startup probes and their traffic/restart effects.
-->

---
layout: statement
kicker: The problem
---

`Running` is a lie you tell your users.

The `web` Deployment reports `3/3` and every Pod says `Running` — so the Service sends
traffic. But `Running` only means *the process started*: nginx may still be warming its cache,
or wedged on a deadlocked worker, serving nothing but errors. Kubernetes can't tell a busy Pod
from a broken one **unless you teach it how to ask**. That's what a **probe** is.

<!--
Speaker: the "why should I care" beat. Phase == Running is a low bar — it means PID 1 is up,
nothing more. Two failure modes hide behind it: (1) a Pod that's up but not YET able to serve
(slow warm-up, waiting on a dependency) — send traffic and users get errors during every
rollout; (2) a Pod that WAS serving but has since wedged (deadlock, leaked connection pool) —
it'll sit there Running forever, a black hole in your load balancer. Both are invisible to
`kubectl get pods`. A probe is how you hand Kubernetes a health question to ask on your behalf,
on a schedule. Next slide: the three questions, and the three different things Kubernetes does
with the answers.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · three probes, three different jobs</span>

# Ask a question · act on the answer

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="readiness — may I get traffic?" kind="pod" variant="ok">
      Fails → the Pod is pulled from its Service <strong>EndpointSlice</strong>. It keeps
      <strong>Running</strong>; it just stops receiving requests until it passes again.
      <div class="kw-muted mt-1">Gates traffic. No restart.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="liveness — are you still alive?" kind="pod" variant="warn">
      Fails <code>failureThreshold</code> times → the kubelet <strong>restarts the
      container</strong> in place (<code>RESTARTS ↑</code>). For wedged processes that will
      never recover on their own.
      <div class="kw-muted mt-1">Triggers restart. Traffic-neutral.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="startup — have you finished booting?" kind="pod" variant="danger">
      Runs <strong>first</strong> and <strong>suspends</strong> readiness &amp; liveness until
      it passes — so a slow boot isn't mistaken for a crash.
      <div class="kw-muted mt-1">Protects slow starters.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

The one that trips everyone: **readiness and liveness are not the same check.** Readiness ✗
means *don't send me work yet*; liveness ✗ means *I'm broken, restart me*. Wire the same
failing check to both and a warm-up blip becomes a restart loop.

</div>

</div>

<!--
Speaker: the anchor slide. Three probes map to three verbs — readiness → REMOVE FROM ENDPOINTS,
liveness → RESTART, startup → WAIT. Readiness is the safety valve of every rolling update
(S06/S07): a new Pod stays out of the load balancer until it's genuinely ready, so users never
hit a half-started replica. Liveness is the self-healing valve: a process that deadlocks (still
Running, answering nothing) gets bounced. Startup is the newest and most under-used — it exists
because people used to hack `initialDelaySeconds` onto liveness to survive slow boots, which is
fragile; startup gives slow starters a generous, separate budget and only THEN hands over to
liveness. Click 4 is the misconception to kill early: readiness != liveness. If your health
endpoint checks a downstream DB and you wire it to LIVENESS, a DB blip restarts all your Pods
(making it worse); wire it to READINESS and they just drain until the DB returns. Right check,
right probe.
-->

---
layout: code-annotated
heading: 'One probe, every knob that matters'
compact: true
lab: labs/day-2/14-probes.md
---

```yaml {none|2-3|4|5|6|7}
readinessProbe:
  httpGet:                    # mechanism: HTTP GET
    path: /ready.html
    port: 80
  initialDelaySeconds: 0      # wait this long before the FIRST probe
  periodSeconds: 5            # then probe every 5s
  failureThreshold: 3         # this many misses in a row = failed
```

::notes::

<CodeNote at="1" label="mechanism — four ways to ask" variant="ok">
<code>httpGet</code> (2xx/3xx = pass, ≥400 = fail), <code>tcpSocket</code> (can I open the
port?), <code>exec</code> (run a command, exit 0 = pass), and <code>grpc</code> (native
gRPC health). Pick the one that reflects <em>real</em> health, not just "port open."
</CodeNote>

<CodeNote at="2" label="path — probe a dedicated endpoint">
<code>/ready.html</code> here, not <code>/</code>. Real apps expose a <code>/healthz</code>
that checks their own dependencies — so readiness reflects "can I actually serve," not "is the
web server process listening."
</CodeNote>

<CodeNote at="3" label="initialDelaySeconds — grace before the first ask" variant="warn">
Give the app time to start before the first probe. On a slow starter this is the field people
abuse — a <strong>startupProbe</strong> is the right tool instead (next-but-one slide).
</CodeNote>

<CodeNote at="4" label="periodSeconds / failureThreshold — how twitchy">
Effective reaction time ≈ <code>periodSeconds × failureThreshold</code>. Too tight → healthy
blips flap the Pod out; too loose → slow to notice a real failure. <code>3 × 5s = 15s</code>
here.
</CodeNote>

<!--
Speaker: the field-level slide — these knobs cause most probe bugs. MECHANISMS: httpGet is the
common one and note the success rule (any 2xx or 3xx passes; 400+ fails — that's how deleting
the file breaks readiness in the lab, nginx 404s the missing path). tcpSocket for non-HTTP
(databases, brokers). exec for "run a script" (most flexible, most expensive — forks a process
each period). grpc for services that speak the standard gRPC health protocol. TIMING: the
reaction window is periodSeconds × failureThreshold — memorise that, it's what you tune. A
liveness probe with periodSeconds 1 / failureThreshold 1 will restart a Pod over a single GC
pause; that's the "flapping liveness" antipattern two slides on. initialDelaySeconds is the
crude grace period people bolt onto liveness for slow apps — the startup probe replaces it.
This is a single readiness probe; the lab ships all three on the running Deployment.
-->

---
layout: code-walkthrough
heading: 'Build it up — teach the web Deployment to report its own health'
lab: labs/day-2/14-probes.md
---

````md magic-move
```yaml
# 1: the web container as S07 left it — "Running" the instant nginx's process starts
containers:
  - name: web
    image: nginx:1.27
    ports: [{ containerPort: 80 }]
    # no probes → Kubernetes assumes process-up = ready AND healthy
```

```yaml
# 2: +readiness — gate traffic on a dedicated endpoint (postStart seeds the file)
containers:
  - name: web
    image: nginx:1.27
    ports: [{ containerPort: 80 }]
    readinessProbe:
      httpGet: { path: /ready.html, port: 80 }
      periodSeconds: 5
      failureThreshold: 3
    lifecycle:
      postStart:
        exec: { command: ["sh", "-c", "echo ok > /usr/share/nginx/html/ready.html"] }
```

```yaml
# 3: +liveness — restart the container if it wedges (probe the app itself, not the readiness file)
containers:
  - name: web
    image: nginx:1.27
    ports: [{ containerPort: 80 }]
    readinessProbe:
      httpGet: { path: /ready.html, port: 80 }
      periodSeconds: 5
      failureThreshold: 3
    livenessProbe:
      httpGet: { path: /, port: 80 }
      periodSeconds: 10
      failureThreshold: 3
    lifecycle:
      postStart:
        exec: { command: ["sh", "-c", "echo ok > /usr/share/nginx/html/ready.html"] }
```

```yaml
# 4: +startup — give a slow boot room; readiness & liveness are suspended until it passes
containers:
  - name: web
    image: nginx:1.27
    ports: [{ containerPort: 80 }]
    readinessProbe:
      httpGet: { path: /ready.html, port: 80 }
      periodSeconds: 5
      failureThreshold: 3
    livenessProbe:
      httpGet: { path: /, port: 80 }
      periodSeconds: 10
      failureThreshold: 3
    startupProbe:
      httpGet: { path: /, port: 80 }
      periodSeconds: 3
      failureThreshold: 30          # up to 90s to boot before liveness takes over
    lifecycle:
      postStart:
        exec: { command: ["sh", "-c", "echo ok > /usr/share/nginx/html/ready.html"] }
```
````

<!--
Speaker: FOUR frames, each a real state of the same web container the deck has carried since
S06. (1) No probes: "Running" is the only signal, and it's a lie the moment the app needs warm-
up. (2) +readiness on /ready.html — note the postStart hook that writes that file once nginx is
up; that's a teaching device so we can break readiness independently in the lab by deleting the
file (nginx then 404s → readiness fails → Pod drains, but liveness on / is still 200 so it is
NOT restarted). Real apps skip the hook and expose a /healthz their code owns. (3) +liveness on
/ (the app itself) — deliberately a DIFFERENT target from readiness, so the two can't be
conflated. (4) +startup on / with a generous 30×3s = 90s budget; while it runs, readiness and
liveness are held, so a slow boot can't be mistaken for a crash loop. Frame 4's container spec
is byte-for-byte the lab's deployment-probes.yaml — same through-line manifest. To reach the
lab, apply this and watch all three Pods reach READY 1/1.
-->

---

<span class="kw-kicker">Readiness fail · drain, don't restart</span>

# One Pod goes NotReady — traffic just reroutes

<div class="mt-2">
  <ServiceRouting :step="$clicks" reason="readiness probe failing" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Steady state: the Service load-balances across **all three** endpoints.
- One Pod's readiness probe starts failing — it flips to **NotReady**, still `Running`.
- The endpoint controller **drops it from the EndpointSlice**; the ClusterIP now targets the
  healthy two. **No error reaches the caller** — that's zero-downtime by design.

</v-clicks>
</div>

<!--
Speaker: this is the S07 ServiceRouting animation, reused — readiness is literally the
mechanism that decides who's in a Service's EndpointSlice. Drive with clicks: (0) three Ready
Pods, three endpoints. (1) a request fans out — load-balanced. (2) one Pod's readiness goes
red; it stays Running (this is the crucial part — it is NOT restarted, NOT deleted) but its IP
leaves the slice, so kube-proxy stops routing to it. The other two absorb the traffic; the user
sees nothing. This is exactly what a rolling update leans on: a new Pod is kept out of the slice
until readiness passes, so users never touch a half-warmed replica. In the lab you'll cause
this by deleting /ready.html on ONE Pod and watch its IP vanish from `get endpointslices` while
curl keeps returning 200 from the others. Contrast with liveness on the next slide — same-
looking failure, completely different outcome.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Same symptom · opposite response — the fork to remember</span>

# Readiness drains · liveness restarts

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="readiness ✗  →  out of the endpoints" kind="pod" variant="warn">
    Pod stays <strong>Running</strong>, <code>READY 0/1</code>, <code>RESTARTS 0</code>.
    Removed from the EndpointSlice → no traffic. Passes again → <strong>rejoins</strong>, no
    restart, no data lost.
    <div class="kw-muted mt-1">Use for: warm-up, a busy moment, a missing dependency.</div>
  </KwCard>
  <KwCard heading="liveness ✗  →  restarted in place" kind="pod" variant="danger">
    kubelet kills &amp; restarts the container → <code>RESTARTS ↑</code>, phase stays
    <strong>Running</strong>. Keeps OOM-style bouncing → <strong>CrashLoopBackOff</strong>.
    <div class="kw-muted mt-1">Use for: deadlocks a restart actually clears.</div>
  </KwCard>
</div>

<div v-click="1" class="mt-4 text-sm">

<span class="kw-kicker">and the guard in front of both</span>

<KwCard heading="startup ✗ (still running)  →  nobody panics yet" icon="⏳">
While the <strong>startup</strong> probe is still trying, readiness and liveness are
<strong>suspended</strong> — a 45-second boot can't trip a 15-second liveness timeout. Startup
finally passes → the other two take over. Startup <em>exhausts</em> its budget → the container
is killed as failed-to-start.
</KwCard>

</div>

</div>

<!--
Speaker: the punchline slide — two divergent arrows off the same-looking failure. LEFT
(readiness): the Pod is fine, it just says "not now" — no restart, RESTARTS stays 0, it drops
from endpoints and comes back clean. This is the safe, reversible one. RIGHT (liveness): the
kubelet takes action — kill and restart the container; if whatever's wrong persists, each
restart fails again and you get CrashLoopBackOff with an exponential backoff timer. The trap
learners must avoid: putting a dependency check (DB reachable?) on LIVENESS — now a DB outage
restarts every Pod, turning a brown-out into an outage; the same check on READINESS just drains
them until the DB is back. Click 1: startup is the referee — it holds the other two off during
boot, so you stop abusing initialDelaySeconds on liveness. The lab makes both arrows physical:
delete a file → left arrow; point liveness at a dead port → right arrow.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The two ways probes bite back</span>

# Classic misconfigurations

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Liveness that flaps" kind="pod" variant="danger">
      A liveness check too tight (<code>periodSeconds 1</code>) or pointed at a slow dependency
      restarts the container over a GC pause or a DB blip. Restarts don't fix a *busy* app —
      they multiply the load → <strong>CrashLoopBackOff</strong> across the fleet.
      <div class="kw-muted mt-1">Fix: loosen timing; probe <em>self</em>, not downstreams; use
      <strong>startup</strong> for slow boots.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Readiness that never passes" kind="pod" variant="warn">
      A wrong path/port, or a readiness check waiting on something that never comes, keeps every
      Pod at <code>READY 0/1</code>. Endpoints stay empty, the Service has nothing to route to,
      and a <strong>rolling update stalls</strong> — the new ReplicaSet never goes Available.
      <div class="kw-muted mt-1">Fix: <code>describe pod</code> → read the probe failure event;
      correct the path/port.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 kw-muted text-sm">

Both show up in <code>kubectl describe pod</code> Events as
<code>Readiness probe failed…</code> / <code>Liveness probe failed…</code> — the first place
to look when a Pod is `Running` but nothing works.

</div>

</div>

<!--
Speaker: the two failure modes people actually ship. FLAPPING LIVENESS: the single most common
probe outage. Symptoms: RESTARTS climbing across many Pods at once, often correlated with load
or a dependency wobble. Causes: periodSeconds/failureThreshold too aggressive, or — the big one
— a liveness probe that transitively checks a database/cache, so when THAT hiccups every Pod
gets restarted and the stampede makes recovery impossible. Cure: liveness should test only "is
THIS process wedged," keep it cheap and forgiving, and move slow-boot tolerance to a startup
probe. READINESS THAT NEVER PASSES: a rollout that silently stops — the new ReplicaSet's Pods
sit 0/1 forever, Deployment shows unavailable replicas, and because readiness gates the
rollout, it never completes (old Pods keep serving, which is the safety feature, but your
deploy is stuck). Cause is almost always a typo'd path/port or a readiness gate on something
that isn't up in this environment. Both are diagnosable in one command: describe the Pod, read
the Events. That's the muscle memory the lab builds.
-->

---
layout: recap
heading: 'Debrief — Running is a floor, not a promise'
story: 'Deleting one Pod''s readiness file drained it with zero downtime; pointing liveness at a dead port bounced the container until we fixed it — same symptom, opposite cure.'
next: 'S15 · Jobs & CronJobs — workloads that run to completion, not forever'
---

- **readiness** gates traffic (in/out of the EndpointSlice) · **liveness** restarts the
  container · **startup** protects a slow boot and suspends the other two
- Readiness ✗ = `Running`, `0/1`, drained, **no restart**; liveness ✗ = `RESTARTS ↑`, then
  **CrashLoopBackOff**
- Mechanisms: `httpGet` (≥400 fails) · `tcpSocket` · `exec` · `grpc`; reaction ≈
  `periodSeconds × failureThreshold`
- Probe **self**, not downstreams — a dependency check on *liveness* turns a blip into a
  restart storm
- **Read the Events:** `describe pod` shows `Readiness/Liveness probe failed…` — the first
  stop when `Running` isn't serving

<!--
Speaker: land the through-line. The whole section is one correction to a beginner instinct —
"my Pod is Running, so it works." Running means the process started; readiness, liveness, and
startup are how you attach real meaning to it. The two-arrow fork is the keeper: readiness is
reversible and traffic-only (drain/rejoin), liveness is a hammer (restart/CrashLoop) — so map
each check to the response you actually want. Probe your own health, keep liveness cheap and
forgiving, and reach for startup instead of piling initialDelaySeconds onto liveness. CKAD
Observability domain lives right here. Hand to Lab 14: add all three probes, delete a readiness
file to drain one Pod with zero downtime, break liveness to force restarts, and watch a startup
probe shepherd a slow starter. Next section: Jobs & CronJobs — the first workloads that are
SUPPOSED to stop.
-->

---
layout: lab
lab: labs/day-2/14-probes.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 14 — Break the probes

- Add readiness, liveness, and startup probes to the `web` Deployment; confirm `READY 1/1` and
  three IPs in the EndpointSlice
- **Break readiness** on one Pod (delete its `/ready.html`) → it leaves the slice, `curl` keeps
  returning 200 from the others — **zero downtime** — then fix and watch it rejoin
- **Break liveness** (point it at a dead port) → `RESTARTS` climbs into `CrashLoopBackOff` →
  fix and watch restarts stop
- Watch a **startup** probe shepherd a deliberately slow-starting container that liveness would
  otherwise kill mid-boot
- Answer: *readiness failed but the app never restarted — why?* and *why did users see no errors
  during the readiness break?*
