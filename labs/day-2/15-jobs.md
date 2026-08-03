# Lab 15 — Jobs & CronJobs (S15)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S15 — Jobs & CronJobs |
| **Environment** | namespace ✓ / kind ✓ *(no cluster-admin; Jobs/CronJobs live in your own namespace)* |
| **Estimated time** | 20 min |

## Objective

Run finite work the way Kubernetes means you to. You will run a **Job** to completion and read
its logs, put the same work on a **CronJob** and watch it fire on a schedule (and trim its own
history), then deliberately break a Job so it retries up to its **`backoffLimit`** and lands in
**`BackoffLimitExceeded`** — the whole point being the contrast with a Deployment, which would
restart that "finished" work **forever**.

> **Set your namespace once.** Everything runs in your assigned namespace (or a kind cluster).
> Set a shell variable so every command is copy-pasteable:
>
> ```bash
> export NS=<your-assigned-namespace>          # kind users: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Labs 05–06 concepts (Pod, Deployment). This lab **creates its own** objects and doesn't
  depend on leftovers from earlier labs.
- `kubectl` against your assigned namespace **or** a local kind cluster. No admin rights.
- Internet pull access for `busybox:1.37` (a tiny image; any small image works).
- A little patience: a per-minute CronJob fires at most **once a minute**, so Step 1 involves
  a couple of minutes of watching.

## Files used

- `job-report.yaml` — a one-shot Job that prints a line and exits `0`.
- `cronjob-report.yaml` — the same work wrapped in a per-minute CronJob.
- `job-failing.yaml` — a Job whose command exits non-zero, to trigger `backoffLimit`.
- `job-fixed.yaml` — the same Job with the command corrected.

Everything is labelled `app: s15` so cleanup is a single label selector.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./15-jobs.solution.md#guided-solutions)

### Step 0 — a Job that runs to completion

A **Job** wraps a Pod spec and adds a completion contract: it runs the Pod until it **succeeds**
(exit `0`), then stops. Note the Pod's `restartPolicy: Never` — a Job may only use `Never` or
`OnFailure`, never `Always`.

```bash
cat > job-report.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: report
  labels: { app: s15 }
spec:
  backoffLimit: 4
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "echo 'nightly report generated'; sleep 3"]
EOF

kubectl apply -f job-report.yaml
kubectl get job report -w        # wait for COMPLETIONS 1/1, then Ctrl-C
```

**Task:** confirm the Job completed, then read the output from the Pod it created.

```bash
kubectl get job report
kubectl logs job/report          # logs of the Job's Pod, by Job name
```

**Question:** the Job is `Complete`, but `kubectl get pods -l app=s15` still shows the Pod as
`Completed`. Why does the finished Pod stick around instead of being deleted?

---

### Step 1 — put the same work on a schedule (CronJob)

A **CronJob** is a Job factory: on each cron tick it stamps out a new Job from its
`jobTemplate`. Use a **per-minute** schedule so you don't wait long. (One minute is the finest
cron granularity — you can't schedule faster than that.)

```bash
cat > cronjob-report.yaml <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
  labels: { app: s15 }
spec:
  schedule: "*/1 * * * *"            # every minute
  concurrencyPolicy: Forbid         # never overlap runs
  successfulJobsHistoryLimit: 3      # keep the last 3 successful Jobs
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 4
      template:
        metadata:
          labels: { app: s15 }
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'scheduled report'; sleep 3"]
EOF

# the CronJob "report" would clash with the Step-0 Job "report" — remove that first
kubectl delete job report --ignore-not-found
kubectl apply -f cronjob-report.yaml
```

**Task:** watch the CronJob fire. Within ~60–120s you should see `LAST SCHEDULE` populate and
spawned Jobs appear.

```bash
kubectl get cronjob report                       # watch LAST SCHEDULE go from <none> to a time
kubectl get jobs -l app=s15 --sort-by=.metadata.creationTimestamp
```

**Task:** let it run a few minutes, then confirm the **history limit** is trimming old Jobs —
you should never see more than `successfulJobsHistoryLimit` (3) successful Jobs kept.

```bash
# after ~4–5 minutes:
kubectl get jobs -l app=s15
```

---

### Step 2 — break→fix: a Job that fails until it hits `backoffLimit`

A Job doesn't retry forever. On failure it makes a new attempt, up to `backoffLimit` times;
then it gives up and is marked **Failed** with reason **`BackoffLimitExceeded`**. Reproduce it
with a command that always exits non-zero. We use `restartPolicy: Never`, so **each retry is a
brand-new Pod** — you can literally count the attempts.

```bash
cat > job-failing.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: flaky
  labels: { app: s15 }
spec:
  backoffLimit: 3                    # give up after this many failed attempts
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: flaky
          image: busybox:1.37
          command: ["sh", "-c", "echo 'trying...'; exit 1"]   # always fails
EOF

kubectl apply -f job-failing.yaml
kubectl get job flaky -w            # wait until STATUS shows it stop retrying, then Ctrl-C
```

**Task:** the Job never succeeds. How many Pods did it create, and what does `describe` say
finally stopped it?

```bash
kubectl get pods -l app=s15 --field-selector=status.phase=Failed
kubectl describe job flaky | sed -n '/Events/,$p'
```

**Task:** fix the command so the container exits `0`, and confirm the Job completes. (A Job's
Pod template is immutable, so delete and recreate.)

```bash
cat > job-fixed.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: flaky
  labels: { app: s15 }
spec:
  backoffLimit: 3
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: flaky
          image: busybox:1.37
          command: ["sh", "-c", "echo 'fixed — exiting 0'; exit 0"]   # succeeds
EOF

kubectl delete job flaky
kubectl apply -f job-fixed.yaml
kubectl get job flaky            # COMPLETIONS 1/1, STATUS Complete
```

**Question:** why did the failing Job stop after only a handful of Pods, and what would have
been different with `restartPolicy: OnFailure`?

**Question:** your nightly CronJob sometimes takes longer than a minute. With
`concurrencyPolicy: Forbid`, what happens at the next tick — and how would `Allow` or `Replace`
differ?

## Observe

- A **Job** runs to completion: exit `0` → `COMPLETIONS 1/1`, `Complete`, nothing restarts.
  Finished Pods linger (as `Completed`) for their logs until GC'd or `ttlSecondsAfterFinished`.
- A **CronJob** creates a new Job per tick (`*/1` = every minute), tracks `LAST SCHEDULE`, and
  trims finished Jobs past `successfulJobsHistoryLimit` / `failedJobsHistoryLimit`.
- A failing Job retries up to **`backoffLimit`** (rate-limited with exponential backoff) then is
  **Failed** with **`BackoffLimitExceeded`**; with `restartPolicy: Never` each retry is a new Pod.
- `concurrencyPolicy` decides overlap: **Forbid** skips, **Allow** overlaps, **Replace** supersedes.
- The core contrast with S06: a **Deployment** treats exit `0` as a fault and restarts forever;
  a **Job** treats it as success and stops.

## Challenge

Predict and then prove how concurrencyPolicy Forbid behaves when a CronJob tick
arrives while the previous Job is still Running — then contrast Allow and Replace
without retyping the whole guided history demo.

**Difficulty:** Intermediate

**Success criteria:** Identify from CronJob Events or Job timestamps that Forbid skips an overlapping tick,
compare one observable signal each for Allow (concurrent Jobs present) versus Replace,
and leave the CronJob suspended or deleted.

**Hints:** Suspend the CronJob when finished; inspect LAST SCHEDULE versus active Jobs; read
concurrencyPolicy on the CronJob spec.

[Spoiler: challenge solution](./15-jobs.solution.md#challenge-solution)

## Verify

Confirm Job/CronJob evidence before cleanup.

```bash
kubectl get cronjob,job,pods -n "$NS" -l app=s15
kubectl get job -n "$NS" -l app=s15 -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[*].type
```

Expected: labelled Jobs/CronJobs still show Complete or Failed status from the guided
steps (suspend the CronJob if it is still firing).

## Cleanup / reset

```bash
# scoped cleanup — everything this lab made is labelled app=s15
kubectl delete cronjob,job -l app=s15 -n "$NS" --ignore-not-found
kubectl delete pod -l app=s15 -n "$NS" --ignore-not-found     # any lingering Completed/Error Pods
rm -f job-report.yaml cronjob-report.yaml job-failing.yaml job-fixed.yaml job-queue.yaml

# panic reset (namespace): also removes anything else this lab could have left
# kubectl delete cronjob,job,pod --all -n "$NS" --ignore-not-found
# panic reset (kind): make kind-down && make kind-up   # or: kind delete cluster
```

> **Delete the CronJob when you're done.** A per-minute CronJob left running will keep spawning
> Jobs and Pods every minute in your namespace — `kubectl delete cronjob report` stops it (or
> `kubectl patch cronjob report -p '{"spec":{"suspend":true}}'` pauses without deleting).

## Stretch (optional) — a parallel work queue

A single Job can run many Pods. Set `completions` (how many successes finish the Job) and
`parallelism` (how many run at once) to process a batch in parallel.

```bash
cat > job-queue.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: batch
  labels: { app: s15 }
spec:
  completions: 6                     # 6 successful Pods = done
  parallelism: 2                     # at most 2 running at a time
  backoffLimit: 4
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: worker
          image: busybox:1.37
          command: ["sh", "-c", "echo \"worker $(date +%s)\"; sleep 4"]
EOF

kubectl apply -f job-queue.yaml
kubectl get job batch -w           # COMPLETIONS climbs 0/6 → 2/6 → 4/6 → 6/6, then Ctrl-C
```

---

> **Delivery note (repo convention).** Manifests here are authored against `batch/v1` and
> `kubectl apply --dry-run=server`-validated on a live cluster, but the lab was **not executed
> end-to-end** in the authoring environment (the only reachable cluster was a shared production
> namespace, out of bounds for creating objects). Before rehearsal, run this once in a clean
> **kind** cluster to confirm: the exact Pod count at `BackoffLimitExceeded`, the per-minute
> CronJob fire cadence, and the history-limit trimming after several ticks.
