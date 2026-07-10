---
layout: section-cover
image: /covers/section-23-observatory.png
day: Day 3
section: '23'
tier: recommended
track: Operators
---

# Prometheus Operator

See an operator manage a real system; learn observability basics.

**recommended** · suggested Day 3 · Operators track

<!--
Section S23 — Prometheus Operator. Recommended, Day 3, Operators track. The operator pattern
from S22 made CONCRETE: S22 taught operator = CRD + controller running the reconcile loop; here
a real, ubiquitous operator (the Prometheus Operator, shipped in kube-prometheus-stack) watches
ServiceMonitor/PodMonitor CRs and GENERATES Prometheus scrape config — the exact S22 pattern in
the wild. Timing: ~30 min slides + 25 min lab. Outcome: learners can explain why dynamic Pods
break hand-written scrape config, name the four key CRDs (Prometheus, ServiceMonitor, PodMonitor,
Alertmanager), state that a ServiceMonitor selects a Service by label and the operator turns it
into scrape config, name the four golden signals and metrics-vs-logs-vs-traces, name
kube-state-metrics + node-exporter as the standard sources, read a ServiceMonitor + one PromQL
rate() query, and in the lab install kube-prometheus-stack, expose a /metrics app, wire a
ServiceMonitor (break it with a mismatched selector, diagnose on /targets, fix it), and run a
PromQL query.
Beats: problem (dozens of dynamic Pods — hand-editing scrape config doesn't scale) · mental model
(operator watches ServiceMonitor/PodMonitor → GENERATES scrape config = S22 made concrete, call
back explicitly) · the four CRDs (Prometheus/ServiceMonitor/PodMonitor/Alertmanager) · the four
golden signals + metrics vs logs vs traces · the two standard sources (kube-state-metrics +
node-exporter) · code-annotated (a ServiceMonitor selecting a Service by label + named port) ·
magic-move (ServiceMonitor selects Service → target appears in Prometheus → one PromQL query
returns data) · a taste of PromQL (rate() over a counter) · debrief → lab.
Animation: NONE (guardrail: S23 is "made concrete" — magic-move + comparison + cards). Do NOT
author a Vue component. ReconcileLoop reuse is optional and not used here; the teaching device is
the ServiceMonitor→scrape-config generation, shown via the code-annotated + magic-move slides.

ACCURACY LOCKS (web-verified 2026-07-10):
- Sample app: quay.io/brancz/prometheus-example-app — tags v0.6.0 (latest, MULTI-ARCH, works on
  Apple-Silicon kind) and v0.5.0 (amd64-only) both exist. Serves /metrics on port 8080; exposes
  the counter `http_requests_total` (plus http_request_duration_seconds histogram, version gauge)
  and endpoints / (200) and /err (404). The rate() demo is on http_requests_total.
- CRD API group: monitoring.coreos.com. ServiceMonitor/PodMonitor/Prometheus/Alertmanager are
  apiVersion monitoring.coreos.com/v1; CRDs listed as servicemonitors.monitoring.coreos.com etc.
- Helm chart: prometheus-community/kube-prometheus-stack (repo
  https://prometheus-community.github.io/helm-charts). Bundles the Prometheus Operator + a
  Prometheus + Alertmanager + Grafana + kube-state-metrics + node-exporter.
- TWO selector layers (do NOT conflate): (1) Prometheus→ServiceMonitor DISCOVERY — the chart's
  Prometheus only picks up ServiceMonitors carrying `release: monitoring` by default
  (serviceMonitorSelectorNilUsesHelmValues=true → selector = release label). (2) ServiceMonitor→
  Service TARGET selection — spec.selector.matchLabels picks the Service. The lab's deliberate
  BREAK is on layer (2). A THIRD, separate field: spec.endpoints[].port is a NAME (string) that
  must match the Service's named port — that's the lab's port-name QUESTION, not the break.
CKx tie-in: CKA/CKAD observability (metrics, monitoring) — a one-liner on the recap.
-->

---
layout: statement
kicker: The problem
---

You have **forty Pods** across a dozen Deployments, and they come and go every deploy. How does a monitoring system know **what to scrape**?

Classic Prometheus reads a **static scrape config**: a hand-written list of hosts and ports to poll for `/metrics`. That was fine for three servers with fixed IPs. But Kubernetes Pods are **cattle** — they're created, rescheduled, and destroyed constantly, and every one gets a fresh IP. Hand-editing `prometheus.yml` every time a Deployment scales or rolls is **impossible**, and it's the exact opposite of everything you've learned: you declare *intent* with labels and let a controller do the bookkeeping. So what if **monitoring itself** worked that way?

<!--
Speaker: the "why care" beat. Prometheus's original model is pull-based over a STATIC scrape
config — a file listing targets (host:port) to poll for /metrics every N seconds. In a fixed
fleet that's fine. In Kubernetes it's untenable: Pods are ephemeral and get new IPs on every
reschedule, Deployments scale up and down, rollouts churn ReplicaSets. You cannot hand-maintain a
target list against that. The whole workshop has taught label-driven, declarative intent —
Services select Pods by label, not IP; NetworkPolicy allows by label. Monitoring should be no
different: declare "scrape whatever backs THIS Service" and let something keep the scrape config in
sync as Pods churn. That "something" is an operator — and it's the S22 pattern, shipped for real.
Next: the mental model, called back to S22 explicitly.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · S22 made concrete — a CRD + a controller you didn't write</span>

# The operator watches CRs and **generates the scrape config**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="You declare intent as a CR" icon="🎯" variant="ok">
      A <strong>ServiceMonitor</strong> says <em>"scrape whatever backs the Service with these
      labels, on this port."</em> It's just YAML you <code>kubectl apply</code> — no host, no IP,
      no <code>prometheus.yml</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="The operator does the bookkeeping" icon="⚙️" variant="ok">
      The <strong>Prometheus Operator</strong> watches ServiceMonitors, resolves the current Pods
      behind each Service, and <strong>writes the scrape config</strong> for you — re-writing it
      every time Pods come and go.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">this is literally S22</span>

Recall the equation: **operator = CRD + custom controller running observe → diff → act.** Here the
**CRDs** are `ServiceMonitor`/`PodMonitor` (your intent) and the **controller** is the Prometheus
Operator. Its **"act"** step is: *turn the CRs into a live Prometheus scrape config.* You met the
pattern in S22 with an illustrative `Backup`; this is the same pattern, **shipped and running in
production everywhere.**

</div>

</div>

<!--
Speaker: THE load-bearing slide, and the explicit S22 callback the story requires. Say it: S22 =
operator is a CRD (extends the API) + a controller (runs observe→diff→act). Now name the concrete
instance. The CRD you'll use is ServiceMonitor: a small YAML that expresses monitoring INTENT —
"scrape the endpoints of any Service matching these labels, on this named port, at this path." The
controller is the Prometheus Operator. Its reconcile loop watches ServiceMonitors (and PodMonitors,
Prometheus, Alertmanager objects), figures out the current set of Pod endpoints behind each
selected Service, and GENERATES/updates the Prometheus scrape configuration — the thing you used to
hand-edit. As Pods churn, the operator keeps that config current. That's the "act" step: CRs in,
scrape config out. Nobody edits prometheus.yml. The lab makes you feel it: apply a ServiceMonitor,
watch a target appear in Prometheus. Next: name the four CRDs this operator gives you.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The API the operator adds · four kinds in monitoring.coreos.com</span>

# Four CRDs: `Prometheus`, `ServiceMonitor`, `PodMonitor`, `Alertmanager`

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.7rem;">
  <v-click at="1">
    <KwCard heading="Prometheus" kind="crd" variant="ok">
      Declares a <strong>Prometheus server</strong> — replicas, retention, which monitors to pick
      up. The operator turns it into a running <code>StatefulSet</code>. <em>Desired state for the
      server itself.</em>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="ServiceMonitor" kind="crd" variant="ok">
      Scrape targets <strong>via a Service</strong> — select the Service by label, name its
      metrics port. The operator resolves it to the Service's <strong>endpoints</strong>. <em>The
      one you'll use in the lab.</em>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="PodMonitor" kind="crd" variant="ok">
      Scrape Pods <strong>directly</strong> by Pod label — no Service required. Same idea, one
      layer down, for workloads that don't sit behind a Service.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Alertmanager" kind="crd" variant="ok">
      Declares an <strong>Alertmanager</strong> deployment that routes and de-duplicates alerts
      (email, chat, pager). Paired with <code>PrometheusRule</code> CRs that define the alert
      expressions.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
Confirm they're installed with <code>kubectl get crd | grep monitoring.coreos.com</code> — every
one is <code>monitoring.coreos.com/v1</code>.
</div>

</div>

<!--
Speaker: the CRD roll-call — these are the new kinds the operator registers (all group
monitoring.coreos.com, version v1). Prometheus: a declarative Prometheus SERVER — you don't run a
Deployment yourself, you declare a Prometheus object (replicas, retention, storage, and a
selector for which ServiceMonitors it adopts) and the operator materialises a StatefulSet.
ServiceMonitor: the star of the lab — target discovery THROUGH a Service: select the Service by
label, name its metrics port, and the operator scrapes the Service's Endpoints (i.e. the current
Pods). PodMonitor: same but selects Pods directly (for things not behind a Service). Alertmanager:
a declarative Alertmanager for alert routing/dedup/silencing, fed by PrometheusRule objects
(the alert expressions). There are more (Probe, ThanosRuler, PrometheusRule) but these four are the
backbone. The verification one-liner — kubectl get crd | grep monitoring.coreos.com — is the first
thing the lab checks. Next: what should you even measure? The golden signals.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">What to measure · the four golden signals</span>

# Latency · Traffic · Errors · Saturation

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;">
  <v-click at="1">
    <KwCard heading="Latency" icon="⏱️" variant="ok">
      How <strong>long</strong> requests take — and watch the <em>tail</em> (p95/p99), not just the
      average. Slow is a failure mode too.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Traffic" icon="📈" variant="ok">
      How <strong>much</strong> demand — requests/sec, queries/sec. The denominator for almost
      everything else.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Errors" icon="❌" variant="ok">
      The <strong>rate of failures</strong> — HTTP 5xx, timeouts, wrong answers. Often expressed
      as a fraction of traffic.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Saturation" icon="🌡️" variant="ok">
      How <strong>full</strong> the system is — CPU, memory, queue depth. The leading indicator of
      the other three going bad.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm">

<span class="kw-kicker">metrics ≠ logs ≠ traces — the three pillars</span>

**Metrics** are cheap numeric time-series — *"how many, how fast, how full"* — perfect for
dashboards and alerts (this is Prometheus). **Logs** are discrete text events — *"what exactly
happened here."* **Traces** follow **one request** across services — *"where did the time go."*
You need all three; Prometheus owns the **metrics** pillar.

</div>

</div>

<!--
Speaker: the "what do I even watch" beat. The four golden signals (from Google SRE) are the
starting checklist for any service: LATENCY (how long — and always look at the tail, p95/p99, an
average hides the pain); TRAFFIC (how much demand — req/s, the denominator for rates); ERRORS (rate
of failures — 5xx, timeouts, bad responses); SATURATION (how full — CPU/mem/queue, the leading
indicator that the other three are about to degrade). If you instrument only these four you already
have most of the value. Then the three-pillars framing so they don't think metrics are everything:
METRICS = cheap numeric time-series, great for dashboards + alerting (Prometheus); LOGS = discrete
text events, for "what exactly happened"; TRACES = one request followed across many services, for
"where did the latency go." Complementary, not competing. Prometheus is the metrics pillar; logs and
traces are separate systems. Next: where the cluster-wide metrics come from.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The two standard sources · what the stack scrapes out of the box</span>

# `kube-state-metrics` + `node-exporter`

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="kube-state-metrics" icon="📊" variant="ok">
      Listens to the <strong>API server</strong> and exposes the <strong>state of Kubernetes
      objects</strong> as metrics: how many Deployment replicas are desired vs ready, Pod phase,
      Job success, PVC status. <em>Answers "what does the cluster think it has?"</em>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="node-exporter" icon="🖥️" variant="ok">
      A <code>DaemonSet</code> — one Pod per <strong>node</strong> — exposing <strong>host</strong>
      metrics: CPU, memory, disk, filesystem, network. <em>Answers "how are the machines
      themselves doing?"</em> (the saturation signal for nodes.)
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">

Both ship <strong>inside</strong> <code>kube-prometheus-stack</code>, each already wired up with its
own ServiceMonitor. So the moment the stack is installed you're scraping cluster + node health —
<strong>before</strong> you add a single app. In the lab you add <em>your</em> app's ServiceMonitor
on top.

</div>

</div>

<!--
Speaker: the two sources every k8s Prometheus setup includes, and the distinction people blur.
kube-state-metrics (KSM): a Deployment that WATCHES the API server and turns the state of Kubernetes
OBJECTS into metrics — kube_deployment_status_replicas, kube_pod_status_phase, kube_job_* etc. It is
NOT about node CPU; it's "what does the control plane think exists and in what state." node-exporter:
a DaemonSet (one Pod per node) exposing the HOST's own metrics — CPU, memory, disk, filesystem,
network — i.e. the machine-level saturation signal. Rule of thumb: KSM = cluster/object state,
node-exporter = machine/OS state; you need both. The payoff: kube-prometheus-stack ships BOTH, each
with its own ServiceMonitor already applied, so a fresh install is already scraping cluster + node
health with zero config. Your job in the lab is to add ONE more ServiceMonitor for your own app —
which is exactly the day-to-day task. Next: what that ServiceMonitor looks like, field by field.
-->

---
layout: code-annotated
heading: 'A ServiceMonitor: select a Service, name its metrics port'
compact: true
lab: labs/day-3/23-prometheus.md
---

```yaml {none|4-6|7-9|10-13|all}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  labels:
    release: monitoring        # (1) so THIS Prometheus adopts the monitor
spec:
  selector:
    matchLabels:
      app: sample-app          # (2) pick the Service by label
  endpoints:
    - port: web                # (3) the Service's NAMED port (a string)
      path: /metrics
```

::notes::

<CodeNote at="1" label="labels.release — discovery" variant="warn">
The stack's Prometheus only adopts ServiceMonitors carrying <code>release: monitoring</code> (its
<code>serviceMonitorSelector</code>). Miss this and the monitor is <strong>ignored entirely</strong>
— a different failure from the one below.
</CodeNote>

<CodeNote at="2" label="spec.selector — target selection" variant="ok">
<code>matchLabels</code> selects the <strong>Service</strong> (not the Pods) by its labels. The
operator then scrapes that Service's <strong>endpoints</strong> — the live Pods behind it.
</CodeNote>

<CodeNote at="3" label="endpoints[].port — a NAME" variant="warn">
<code>port</code> is the Service port's <strong>name</strong> (<code>web</code>), a string — never
a number. It must match a <code>name:</code> on the Service's <code>ports</code>.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
Two selector layers, one string field — and the lab breaks exactly one of them so you can see how
each fails.
</div>

<!--
Speaker: the anatomy that the whole lab hangs on — and the three fields are THREE DIFFERENT THINGS,
say so explicitly. (1) metadata.labels.release: monitoring — this is the DISCOVERY layer: the
kube-prometheus-stack Prometheus is configured (serviceMonitorSelectorNilUsesHelmValues=true) to
only pick up ServiceMonitors carrying the release label. Omit it and Prometheus never even looks at
your monitor — it's inert, like a CRD with no controller watching. (2) spec.selector.matchLabels —
the TARGET-SELECTION layer: this selects the SERVICE (by the Service's labels), and the operator
scrapes that Service's Endpoints (the current Pods). (3) spec.endpoints[].port: web — a NAMED port,
a STRING, that must match a named port on the Service. Not a number. This is why the Service must
give its port a name. The lab deliberately breaks layer (2) — a selector that matches no Service —
and asks the port-name question separately. Don't fuse them. Next: watch it come alive in three
frames.
-->

---
layout: code-walkthrough
heading: 'From a CR to a live target to an answer, in three frames'
lab: labs/day-3/23-prometheus.md
---

````md magic-move
```yaml
# 1 — THE SERVICE: give the metrics port a NAME
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  labels:
    app: sample-app
spec:
  selector:
    app: sample-app
  ports:
    - name: web            # ← the name the ServiceMonitor references
      port: 8080
      targetPort: 8080
```

```yaml
# 2 — THE SERVICEMONITOR: intent — "scrape that Service's /metrics on port 'web'"
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  labels:
    release: monitoring    # discovered by this Prometheus
spec:
  selector:
    matchLabels:
      app: sample-app      # picks the Service above
  endpoints:
    - port: web            # matches the Service's NAMED port
      path: /metrics
```

```text
# 3 — THE OPERATOR generated the scrape config; the target is now UP.
#     Ask Prometheus a question about the metric it scraped:
rate(http_requests_total[5m])

#   → per-second request rate, averaged over 5 minutes, per series:
#   {job="sample-app", code="200", method="get"}   4.73
#   {job="sample-app", code="404", method="get"}   0.20
```
````

<!--
Speaker: the payoff arc, three frames. Frame 1: the Service — the ONLY special thing is that its
metrics port has a NAME (name: web). That name is the contract the ServiceMonitor references. Frame
2: the ServiceMonitor — pure intent: release label so this Prometheus adopts it, selector picks the
Service by app=sample-app, endpoints.port: web references the named port, path /metrics. You apply
these two objects and touch nothing else — no prometheus.yml. Frame 3: what happened without you —
the operator saw the ServiceMonitor, resolved the Service's endpoints, WROTE the scrape config, and
Prometheus started scraping; the target shows UP on /targets. Now you can query the scraped metric:
rate(http_requests_total[5m]) = the per-second request rate averaged over a 5-minute window, one
result series per label combination (status code, method). That's the loop: CR in → target UP →
data out. The lab does exactly this, but breaks frame 2's selector first so you diagnose it on
/targets. Next: read that PromQL properly.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">A taste of PromQL · turn a raw counter into a rate</span>

# `rate(http_requests_total[5m])`

<div class="mt-3 text-sm">

```text
rate(http_requests_total{code="200"}[5m])
```

</div>

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="http_requests_total is a COUNTER" icon="🔢" variant="ok">
      It only ever <strong>goes up</strong> (until the process restarts). The raw value —
      <em>"12,904 requests since boot"</em> — is almost never what you want to graph or alert on.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="rate(…[5m]) makes it useful" icon="📉" variant="ok">
      <code>rate</code> gives the <strong>per-second increase</strong> over the trailing
      <strong>5-minute window</strong> — <em>"~4.7 requests/sec right now"</em> — and it handles
      counter <strong>resets</strong> for you.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

The `{code="200"}` inside the braces is a **label filter** — PromQL selects time-series by label,
exactly like everything else in Kubernetes selects by label. Wrap that in `sum(rate(...))` and
you've aggregated across every Pod. **Traffic** (golden signal #2) in one line — and errors is the
same query with `code=~"5.."`.

</div>

</div>

<!--
Speaker: demystify the one query the lab runs. http_requests_total is a COUNTER — a
monotonically-increasing total (requests since the process started). Its raw value is nearly
useless: "12,904 total" tells you nothing about now. rate(counter[5m]) is the workhorse: it computes
the per-SECOND average increase over the trailing 5-minute window, and crucially it's
reset-aware — when a Pod restarts and the counter drops to 0, rate() doesn't report a huge negative
spike. {code="200"} is a label matcher — PromQL is a label-selection language, the same
label-thinking as Services and NetworkPolicy, applied to time-series. Land the golden-signals tie:
sum(rate(http_requests_total[5m])) = total traffic (signal 2); the same with code=~"5.." over total
= the error rate (signal 3). One function turns a boring counter into the two most important signals.
This is the query the learner runs against their own app in the lab. Next: debrief, then go do it.
-->

---
layout: recap
heading: 'Debrief — declare monitoring intent; let the operator write the config'
story: 'Hand-editing scrape config against ephemeral Pods is impossible. So monitoring became declarative: you apply a ServiceMonitor CR that selects a Service by label and names its metrics port, and the Prometheus Operator — the S22 pattern shipped for real — watches it and generates the scrape config. The target appears in Prometheus, and one rate() query turns the scraped counter into a live request rate.'
next: 'S24 · Operator dev 101 — you''ve USED operators (cert-manager, Prometheus); now peek at building one with kubebuilder'
---

- **The problem:** ephemeral Pods make **static scrape config** unmaintainable — monitoring must be
  **declarative and label-driven**, like everything else in Kubernetes
- **S22 made concrete:** the **Prometheus Operator** watches `ServiceMonitor`/`PodMonitor` CRs and
  **generates the scrape config** — CRD + controller, exactly the operator equation
- **Four CRDs** in `monitoring.coreos.com/v1`: **`Prometheus`** (the server), **`ServiceMonitor`**
  (targets via a Service), **`PodMonitor`** (targets by Pod), **`Alertmanager`** (alert routing)
- **What to watch:** the **four golden signals** — latency, traffic, errors, saturation; and
  **metrics ≠ logs ≠ traces** — Prometheus owns the **metrics** pillar
- **Standard sources:** **`kube-state-metrics`** (object state) + **`node-exporter`** (host
  metrics), both shipped and wired by the stack
- **A ServiceMonitor** selects the **Service by label** and names its **metrics port** (a
  **name**, not a number); **`rate(counter[5m])`** turns a raw counter into a per-second rate
- **CKx tie-in:** CKA/CKAD **observability** (metrics, monitoring) — knowing *how* the cluster is
  scraped and querying it is the exam-relevant skill

<!--
Speaker: tie the bow and point forward. The problem: you cannot hand-maintain scrape config against
ephemeral Pods, so monitoring had to become declarative and label-driven like the rest of
Kubernetes. The answer: the Prometheus Operator — S22's CRD+controller pattern shipped for real —
watches ServiceMonitor/PodMonitor CRs and GENERATES the scrape config. Facts to leave them with: the
four CRDs (Prometheus = the server, ServiceMonitor = targets via a Service, PodMonitor = via Pods,
Alertmanager = alert routing); the four golden signals (latency/traffic/errors/saturation) and the
metrics/logs/traces split (Prometheus = metrics); the two standard sources (kube-state-metrics for
object state, node-exporter for host state); and the ServiceMonitor mechanics — select the Service
by label, name the metrics port (a NAME), and rate() to read a counter as a rate. Hand to Lab 23:
install kube-prometheus-stack, expose an app on /metrics, wire a ServiceMonitor, break it with a
mismatched selector and diagnose on the /targets page, fix it, then run rate(http_requests_total).
Forward to S24: you've now USED two operators — next, a peek at building one.
-->

---
layout: lab
lab: labs/day-3/23-prometheus.md
duration: 25 min
env: kind ✓ (self-install) / namespace: read-only
---

## Lab 23 — Scrape your app

- Install **`kube-prometheus-stack`** (Helm); confirm the operator + CRDs (`kubectl get crd | grep monitoring.coreos.com`)
- Deploy an app exposing **`/metrics`** on a **named** port; apply a **`ServiceMonitor`** selecting its Service by label
- **Break:** a **mismatched selector** → no target appears; diagnose on the Prometheus **`/targets`** page (`port-forward`)
- **Fix:** match the selector to the Service's labels → the target goes **UP**
- Generate load, then run **`rate(http_requests_total[5m])`** and read the result
