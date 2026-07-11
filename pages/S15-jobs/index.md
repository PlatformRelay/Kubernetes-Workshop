---
layout: section-cover
image: /covers/section-15-courier-hourglass.png
day: Day 2
section: '15'
tier: recommended
track: Workloads
---

# Jobs & CronJobs

Some work is meant to **finish** — and some of it on a **timetable**.

**recommended** · suggested Day 2 · Workloads track

<!--
Section S15 — Jobs & CronJobs. Timing: ~20 min slides + 20 min lab. Follows S14. Recommended
tier, Workloads track. Animation: NONE (per the outline) — the state changes here (a Job going
Complete, a CronJob firing) are read off `kubectl get`, not a component-worthy transition.
Outcome: learners can pick run-to-completion vs run-forever, drive a Job with completions/
parallelism/backoffLimit/activeDeadlineSeconds, wrap it in a CronJob (schedule/concurrencyPolicy/
history limits), and know when a Job beats a Deployment.
Beats: problem (a Deployment restarts forever — wrong for finite work) · mental model (Job =
run-to-completion, CronJob = scheduled Jobs) · code-annotated (Job knobs, restartPolicy caveat)
· magic-move (one-shot Job → wrap in a CronJob jobTemplate) · CronJob controls (concurrency,
history, timeZone) · decision beat (Job vs Deployment vs CronJob) · recap → lab.
CKx: CKAD Workloads (batch) — explicit exam item.
-->

---
layout: statement
kicker: The problem
---

A Deployment's whole job is to **never finish**. Some work needs the opposite.

Everything on the red line so far — Pod, Deployment, Service — assumes a process that should
stay up **forever**; if it exits, the Deployment restarts it. Point that at a **database
migration**, a **nightly report**, or a **backup** and you get a disaster: the task succeeds,
exits `0`, and Kubernetes **restarts it anyway** — running your migration in an endless loop.
Finite work needs a controller that understands **"done."**

<!--
Speaker: the "why should I care" beat. Deployment/ReplicaSet is built around a liveness
assumption — the desired state is "N Pods Running," so a container that exits (even
successfully) is a deviation the controller corrects by restarting it. That's exactly wrong for
batch work: a migration that finishes should STAY finished. Run it under a Deployment and it
loops forever; the exit-0 success is treated as a crash. The fix is a controller whose success
condition is "the Pod ran to completion" rather than "the Pod is up." That controller is the
Job. Hold that: run-to-completion is the entire mental model of this section.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · two controllers built around "done"</span>

# Job runs once · CronJob runs on a schedule

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Job — run to completion" kind="job" variant="ok">
      Runs its Pod(s) until they <strong>succeed</strong>, then stops. Tracks success/failure,
      retries on failure up to a limit, and reports <code>COMPLETIONS</code>. The right tool for
      a migration, a batch import, a one-off script.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="CronJob — Jobs on a timetable" kind="cronjob" variant="ok">
      A <strong>Job factory</strong>: on each cron tick it creates a fresh Job from a template.
      The right tool for a nightly backup, an hourly report, a periodic cleanup.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the one distinction everything hangs off</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="Run forever" icon="♾️">
    Deployment / ReplicaSet / StatefulSet — desired state is <strong>N Pods up</strong>. Exit =
    restart. <span class="kw-muted">Services, web apps, controllers.</span>
  </KwCard>
  <KwCard heading="Run to completion" kind="job" variant="ok">
    Job / CronJob — desired state is <strong>the work finished</strong>. Exit&nbsp;0 = success,
    <strong>done</strong>. <span class="kw-muted">Migrations, backups, reports.</span>
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: the whole section is one axis — does this workload have a natural end? A Job wraps a
Pod spec and adds a completion contract: it watches the Pod, and when the container exits 0 the
Job is Complete and nothing restarts. On failure it retries (bounded by backoffLimit). A CronJob
is a thin scheduler on top: it holds a jobTemplate and, on each schedule tick, stamps out a new
Job — so a CronJob "owns" Jobs the way a Deployment "owns" ReplicaSets. Click 3 is the sorting
hat learners should keep: run-forever controllers (Deployment/STS) treat exit as a fault; run-to-
completion controllers (Job/CronJob) treat exit 0 as the goal. Everything else in this section is
the knobs on those two.
-->

---
layout: code-annotated
heading: 'A Job is a Pod spec plus a completion contract'
compact: true
lab: labs/day-2/15-jobs.md
---

```yaml {none|1-2|7|9-10|11-12}
apiVersion: batch/v1
kind: Job
metadata: { name: greeter, labels: { app: s15 } }
spec:
  template:                         # <- a normal Pod template
    spec:
      restartPolicy: Never          # Jobs: Never or OnFailure — NOT Always
      containers: [{ name: work, image: busybox:1.37, command: ["sh","-c","echo done"] }]
  completions: 1                    # how many successful Pods = the Job is done
  parallelism: 1                    # how many Pods may run at once
  backoffLimit: 4                   # retries before the Job is marked Failed
  activeDeadlineSeconds: 120        # hard wall-clock cap for the whole Job
```

::notes::

<CodeNote at="1" label="batch/v1 — the batch API" variant="ok">
Job and CronJob both live in <code>batch/v1</code>. The body is a Pod template you know — a Job
is that <em>plus</em> the four knobs below.
</CodeNote>

<CodeNote at="2" label="restartPolicy: the one Pod field that changes" variant="danger">
A Job's Pod <strong>must</strong> be <code>Never</code> or <code>OnFailure</code> —
<code>Always</code> is rejected ("always restart" ⊥ "run to completion").
</CodeNote>

<CodeNote at="3" label="completions &amp; parallelism">
<code>1</code>/<code>1</code> = run once. Raise both for a work queue —
<code>completions: 10, parallelism: 3</code> = 10 successes, ≤3 at a time.
</CodeNote>

<CodeNote at="4" label="the two ways a Job gives up" variant="warn">
<code>backoffLimit</code> caps <strong>retries</strong> → <code>BackoffLimitExceeded</code>;
<code>activeDeadlineSeconds</code> caps <strong>wall-clock</strong> → <code>DeadlineExceeded</code>.
</CodeNote>

<!--
Speaker: read it as "Pod template + four numbers." The restartPolicy note is the one that bites
people — copy a Deployment's Pod spec (default restartPolicy Always) into a Job and the API
server rejects it; Jobs only allow Never or OnFailure. Never vs OnFailure matters for the lab:
with Never each retry is a brand-new Pod (you'll see several Pods pile up); with OnFailure the
same Pod restarts in place (restart count climbs, Pod count doesn't). completions/parallelism
turn a single Job into a parallel work queue — completions is the finish line, parallelism the
width. backoffLimit bounds retries (default 6); activeDeadlineSeconds is the orthogonal wall-
clock cap — retries could each be short yet the Job hangs, so the deadline is a separate seatbelt.
Compact teaching view; the lab ships the full applyable files.
-->

---
layout: code-walkthrough
heading: 'Build it up — a one-shot Job, then put it on a schedule'
lab: labs/day-2/15-jobs.md
---

````md magic-move
```yaml
# 1: a one-shot Job — runs once, then it's Complete
apiVersion: batch/v1
kind: Job
metadata: { name: report, labels: { app: s15 } }
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```

```yaml
# 2: wrap the SAME pod spec in a CronJob — now it runs every night at 02:00
apiVersion: batch/v1
kind: CronJob
metadata: { name: report, labels: { app: s15 } }
spec:
  schedule: "0 2 * * *"             # min hour dom mon dow  (02:00 daily)
  jobTemplate:                      # <- the Job from step 1, one level deeper
    spec:
      backoffLimit: 4
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```

```yaml
# 3: add the operational controls that make a schedule safe
apiVersion: batch/v1
kind: CronJob
metadata: { name: report, labels: { app: s15 } }
spec:
  schedule: "0 2 * * *"
  timeZone: "Europe/Berlin"         # cron ticks in THIS zone, not the cluster's UTC
  concurrencyPolicy: Forbid         # a run still going? skip the next tick
  startingDeadlineSeconds: 120      # missed the tick by >120s? skip it, don't backfill
  successfulJobsHistoryLimit: 3     # keep the last 3 successful Jobs (default 3)
  failedJobsHistoryLimit: 1         # keep the last 1 failed Job (default 1)
  jobTemplate:
    spec:
      backoffLimit: 4
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```
````

<!--
Speaker: three frames, one growing manifest. (1) The one-shot Job — apply it, it runs once,
COMPLETIONS goes 0/1 → 1/1, done. (2) Wrap it: a CronJob's jobTemplate.spec IS a Job spec, so
the whole step-1 body drops in ONE LEVEL DEEPER (spec.jobTemplate.spec.template — call the
nesting out, it's the #1 copy-paste bug). Same Pod, now on a 5-field cron schedule. (3) The
controls that separate a toy from a production schedule: timeZone (GA — without it cron ticks in
UTC and your "2am" job runs at the wrong hour); concurrencyPolicy Forbid (if last night's run is
still going, don't start a second — the alternative Allow overlaps, Replace kills the old one);
startingDeadlineSeconds (if the controller was down and missed the window, don't stampede-backfill
every missed run); and the two history limits (how many finished Jobs to keep for debugging —
defaults 3 successful / 1 failed). Note this magic-move is the compact teaching view; the lab's
files are block-style and applyable.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">CronJob · what happens when a run overlaps or a tick is missed</span>

# Three controls keep a schedule sane

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="concurrencyPolicy" kind="cronjob">
      <strong>Allow</strong> (default) — runs may overlap.<br>
      <strong>Forbid</strong> — skip the tick if the last run is still going.<br>
      <strong>Replace</strong> — kill the running one, start fresh.
      <div class="kw-muted mt-1">Slow backup + <code>Allow</code> = two backups fighting.
      Use <code>Forbid</code>.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="history limits" icon="🧹">
      <code>successfulJobsHistoryLimit: 3</code> · <code>failedJobsHistoryLimit: 1</code>.
      <div class="kw-muted mt-1">Old finished Jobs (and their Pods) are garbage-collected past
      the limit — keep enough to read logs, not enough to clog the namespace.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="timeZone & deadline" icon="🕑">
      <code>timeZone</code> pins the cron clock (default is the controller's <strong>UTC</strong>).
      <code>startingDeadlineSeconds</code> caps how late a missed run may still start.
      <div class="kw-muted mt-1">Both guard the gap between "when I meant" and "when it fired."</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

A CronJob is only a **scheduler** — each tick it just creates a Job and hands off. All the
run-to-completion behaviour (retries, `completions`, `activeDeadlineSeconds`) lives in the
`jobTemplate`, exactly as if you'd applied that Job by hand.

</div>

</div>

<!--
Speaker: these are the fields that separate a demo CronJob from one you'd trust in production.
concurrencyPolicy is the big one: the default Allow lets runs overlap, which is fine for a fast
idempotent job and catastrophic for a slow backup that now has two copies writing at once —
that's the lab's Forbid question. history limits are housekeeping: the controller keeps the last
N finished Jobs so you can read logs, and GCs the rest (with their Pods) — set them too high and
a per-minute CronJob litters the namespace with hundreds of Completed Pods. timeZone (GA) fixes
the classic "my 2am job ran at 3am" — without it the schedule is evaluated in the controller's
timezone, historically UTC. startingDeadlineSeconds bounds recovery: if the controller was down
across a tick, this caps how stale a run can be and still fire, preventing a backfill stampede.
Click 4 is the framing to leave them with: CronJob schedules, Job executes — don't look for
retry logic on the CronJob, it's all in the jobTemplate.
-->

---
layout: comparison
heading: 'Which controller? Follow the lifetime of the work'
leftHeading: 'Deployment'
leftBadge: 'runs forever'
rightHeading: 'Job / CronJob'
rightBadge: 'runs to completion'
---

**Use a Deployment when the process should stay up.**

- A server, API, or worker that should always be `Running`.
- Exit is a **fault** → the ReplicaSet restarts it to hold `replicas`.
- Scales for **availability & throughput**, not for "finishing."

<v-clicks>

- ❌ Wrong for a migration: succeeds, exits 0, gets **restarted forever**.

</v-clicks>

::right::

**Use a Job when the work has a natural end** — a **CronJob** if it also **repeats**.

- A migration, import, backup, report, or one-off script.
- Exit 0 is **success** → nothing restarts; `COMPLETIONS 1/1`.
- `Job` for run-once-now; `CronJob` for run-on-a-schedule.

<v-clicks>

- ✅ Retries on failure (`backoffLimit`), parallelises (`completions`/`parallelism`), and
  auto-expires finished objects (`ttlSecondsAfterFinished`).

</v-clicks>

<!--
Speaker: the quick chooser. The single question is "does this work have a natural end?" If no —
it should always be up — Deployment (or StatefulSet for identity). If yes — Job; and if that
finite work also recurs on a clock — CronJob. The trap is running batch work under a Deployment
because that's the controller people reach for first: it "works" until you notice your migration
has run 4,000 times. The reverse mistake is rarer but real: a long-lived server under a Job that
keeps "completing" and getting torn down. Name-drop ttlSecondsAfterFinished as the current
auto-cleanup knob — set it on a Job and the object (and its Pods) self-delete N seconds after
finishing, so you don't need a CronJob's history limits or a manual sweep. Hand to the lab:
they'll run a Job, schedule a CronJob, and force a failure into BackoffLimitExceeded.
-->

---
layout: recap
heading: 'Recap — some work is supposed to finish'
story: 'The report Job exited 0 and stayed Complete; wrapped in a CronJob it reran every night — a Deployment would have looped it forever.'
next: 'S16 · Autoscaling (HPA) — scale a running Deployment on live CPU demand'
---

- **Job** = run-to-completion: exit 0 is success, nothing restarts; **CronJob** = a Job factory on a `schedule`
- Job Pods use `restartPolicy: Never` (retry = new Pod) or `OnFailure` (retry = same Pod) — **never `Always`**
- Job knobs: `completions`/`parallelism` (work queue), `backoffLimit` (bounded retries → `BackoffLimitExceeded`), `activeDeadlineSeconds` (wall-clock cap)
- CronJob knobs: `schedule` + `timeZone`, `concurrencyPolicy` (Allow/Forbid/Replace), `{successful,failed}JobsHistoryLimit`, `startingDeadlineSeconds`
- Choose by **lifetime**: stays up → Deployment · finishes → Job · finishes on a clock → CronJob

<!--
Speaker: land the through-line. One axis decides everything: does the work end? The Job adds a
completion contract to a Pod spec (and the restartPolicy caveat — Never for "new Pod per retry,"
OnFailure for "restart in place," Always is illegal). The CronJob adds a clock and the overlap/
missed-tick controls, but delegates all execution to its jobTemplate. The memorable failure modes:
a batch task under a Deployment loops forever; an Allow-concurrency slow CronJob overlaps itself;
a CronJob with no timeZone fires an hour off. Hand to Lab 15: run a Job to COMPLETIONS 1/1 and
read its logs, put it on a per-minute CronJob and watch Jobs spawn and history trim, then force a
non-zero exit and watch retries climb to BackoffLimitExceeded. Next section: HPA — scaling the
run-forever workloads we set aside here.
-->

---
layout: lab
lab: labs/day-2/15-jobs.md
duration: 20 min
env: namespace ✓ / kind ✓
---

## Lab 15 — Batch & schedule

- Run a **Job** to completion → `COMPLETIONS 1/1`, read `kubectl logs job/<name>`
- Put the same work on a **CronJob** (per-minute) → watch Jobs spawn and old ones trim
- **Break→fix:** a Job whose command exits non-zero → retries climb to
  **`BackoffLimitExceeded`** → fix the command and confirm completion
- Answer the headline: *why did the failing Job stop after a handful of Pods — and why does
  `concurrencyPolicy: Forbid` matter for a slow CronJob?*
