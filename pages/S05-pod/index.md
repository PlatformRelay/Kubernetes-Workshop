---
layout: section-cover
day: Day 1
section: '05'
tier: core
track: Core
---

# Pod

Red line 1/5 · The smallest thing Kubernetes runs — build its manifest,
watch it live, break it on purpose.

**core** · suggested Day 1 · Core track

<!--
Section S05 — Pod. Timing: ~30 min slides + 25 min lab.
Outcome: learners can author, run, inspect, and delete a Pod, read its
lifecycle, and diagnose ImagePullBackOff.
Beats: problem (K8s runs Pods, not containers) · mental model (shared context) ·
lifecycle (phases + restartPolicy) · magic-move canonical pod.yaml ·
run + observe · init/sidecar/imagePullSecrets · break (ImagePullBackOff) ·
debrief punchline to Deployment. No shared animation.
Red-line seed: the pod.yaml built here IS labs/day-1/05-pod's manifest —
S06/S07/S08 all extend it. CKx: CKAD Pod design & lifecycle.
-->

---
layout: statement
kicker: The problem
---

You hand Kubernetes a **container** to run… except you don't.

The smallest thing the scheduler ever places on a node is a **Pod** — a thin
wrapper around one or more containers. Master the Pod and every workload later
(Deployment, StatefulSet, Job) is just a machine that **makes Pods for you**.

<!--
Speaker: this is the atom the whole rest of the course builds on. Nobody runs
bare Pods in production — but everything that IS run in production ultimately
schedules Pods. Get this right and the red line unrolls itself. Lab 05 follows
this section.
-->

---

<span class="kw-kicker">Mental model</span>

# One Pod, one shared context

<div class="kw-cols-2 mt-4">
  <KwCard heading="Containers that share a context" kind="pod">
    A Pod is <strong>one or more</strong> containers that always land on the
    <strong>same node</strong> and share a <strong>network namespace</strong>
    (one Pod IP; containers reach each other on <code>localhost</code>) and can
    share <strong>volumes</strong>.
  </KwCard>
  <KwCard heading="The unit of scheduling" icon="🧩" variant="plain">
    The scheduler places a <strong>whole Pod</strong>, never a lone container.
    A Pod is created, scheduled, and deleted <strong>atomically</strong> — its
    containers live and die together on that node.
  </KwCard>
</div>

<div v-click class="mt-5 kw-muted text-sm">

Most Pods hold **one** container. Reach for a second only when it must share the
first's network or filesystem — a log shipper, a proxy — the **sidecar** pattern
we meet in a moment.

</div>

<!--
Speaker: hammer "same node, shared network, shared volumes." The classic wrong
mental model is "a Pod is a tiny VM" — it isn't; it's a shared execution context
for co-scheduled containers. The one-container default keeps early manifests
simple.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Lifecycle · Mina's Pod `web`</span>

# Phases, and what "restart" really means

<div class="mt-2">
  <PodLifecycle :step="$clicks" />
</div>

<div class="kw-cols-2 mt-3 text-sm">
  <div v-click>

**Phase** (`status.phase`) is a coarse headline:
`Pending → Running → Succeeded` / `Failed` — detail lives in container statuses
and **Events**.

  </div>
  <div v-click>

**`restartPolicy`** restarts the **container in place** — never the **Pod**.
Delete the Pod object and *nothing* brings it back. That's the S06 gap.

  </div>
</div>

</div>

<!--
Speaker: click through Mina's story — Pending while scheduling/pulling, Running
when Ready, a crash that bumps RESTARTS but keeps the same Pod, then delete and
nothing recreates it. Image prompt (optional cover art): dark technical slide,
single Pod glyph moving through four states on a timeline, graphite background,
Kubernetes blue accent, no text in the image.

Speaker: draw the line hard between "container restarted" (RESTARTS counter goes
up, same Pod) and "Pod recreated" (a controller's job — not a Pod's). That
distinction is the whole punchline of this section and the reason Deployment
exists. Lab 05's stretch has them kill PID 1 and watch RESTARTS climb.
-->

---
layout: code-walkthrough
heading: 'The canonical Pod — every red-line resource extends this'
lab: labs/day-1/05-pod.md
---

````md magic-move
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # how Lab 07's Service will find this Pod
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27   # a real, pinned tag — never :latest
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80   # documents the port; the app must listen on it
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      resources:              # scheduler hint now; Lab 13 grows this into QoS
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
```
````

<!--
Speaker: build it field by field. apiVersion+kind (what) → metadata.name (who) →
labels (the join key the Service uses later) → containers (the payload) → ports
(documentation + Service target) → resources (a stub, so QoS in S13 is a diff,
not a rewrite). THIS is the red-line seed asset: it IS labs/day-1/05-pod's
pod.yaml, and S06 wraps it in a Deployment template unchanged. Do not maintain a
second copy anywhere.
-->

---
layout: code-annotated
heading: 'Run it, then read it'
lab: labs/day-1/05-pod.md
---

```bash {none|1|2|3|4}
kubectl apply -f pod.yaml
kubectl get pod web -w
kubectl describe pod web
kubectl exec -it web -- sh
```

::notes::

<CodeNote at="1" label="apply">
Declarative: you state the object, the API server stores it, the kubelet makes it
real. Re-running <code>apply</code> converges — it doesn't duplicate.
</CodeNote>

<CodeNote at="2" label="get -w">
<code>-w</code> streams changes live: <code>Pending → ContainerCreating →
Running</code>, <code>READY 0/1 → 1/1</code>.
</CodeNote>

<CodeNote at="3" label="describe" variant="ok">
The debugging workhorse — its <code>Events</code> section holds the truth. Pair
it with <code>kubectl logs web</code> for the app's own output.
</CodeNote>

<CodeNote at="4" label="exec">
The kubelet runs <code>sh</code> <em>inside</em> the container's namespaces — not
SSH, no extra port. In Lab 05 you confirm nginx is PID 1.
</CodeNote>

<!--
Speaker: these five commands are the entire debugging toolkit for the rest of
the workshop — get/describe/logs/exec recur in every section. Emphasise
describe → Events as the reflex. Everything here is exactly Lab 05, step by step.
-->

---

<span class="kw-kicker">Beyond one container</span>

# Init, sidecars, and pulling private images

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="initContainers" icon="⏳">
      Run to completion <strong>before</strong> app containers start, in order —
      wait for a dependency, run a migration. If one fails, the Pod retries it.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Native sidecars" icon="🤝">
      An <code>initContainer</code> with <code>restartPolicy: Always</code> —
      the stable way to run a helper (log shipper, proxy) for the Pod's whole
      life, started before the app.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="imagePullSecrets" kind="secret" variant="plain">
      Names a Secret holding registry credentials so the kubelet can pull from a
      <strong>private</strong> registry. Public images (like nginx) need none.
    </KwCard>
  </v-click>
</div>

<div v-click class="mt-5 kw-muted text-sm">

Notice what a Pod **can't** do: heal itself, scale, or roll out a new version.
A bare Pod is a teaching tool — real workloads are owned by a controller. That's
**S06, next.**

</div>

<!--
Speaker: "native sidecars" (restartPolicy:Always init container) are stable and
the current best practice — mention the old bare-second-container hack is
superseded. Land the closing point hard: the Pod's limitations ARE the argument
for Deployment. Don't oversell init/sidecar detail — one line each, it recurs
later.
-->

---
layout: code-annotated
heading: 'Break it on purpose — the #1 Pod failure'
lab: labs/day-1/05-pod.md
---

```bash {none|1|2|3}
kubectl run web-typo --image=nginx:1.27-typo --restart=Never
kubectl get pod web-typo
kubectl describe pod web-typo | sed -n '/Events:/,$p'
```

::notes::

<CodeNote at="1" label="a typo'd tag">
<code>1.27-typo</code> doesn't exist in the registry. The Pod is accepted and
<em>scheduled</em> — the failure comes later, at pull time.
</CodeNote>

<CodeNote at="2" label="ImagePullBackOff" variant="warn">
The <code>STATUS</code> reads <code>ImagePullBackOff</code>: the kubelet tried,
failed, and is backing off before retrying. A status word, not a reason.
</CodeNote>

<CodeNote at="3" label="the real answer" variant="danger">
The <code>Events</code> spell it out: <code>Failed to pull image … manifest not
found</code>. <strong>Status tells you something's wrong; Events tell you what.</strong>
</CodeNote>

<!--
Speaker: this is THE failure everyone hits first, so make it familiar now. The
teaching point isn't the fix (delete + correct the tag) — it's the reflex: bad
status → read Events. Lab 05 has them do this hands-on and fix it.
-->

---
layout: recap
heading: 'Debrief — the Pod you delete stays deleted'
story: 'Mina fixed the crash, but deleting `web` still left the app down — no controller was watching.'
next: 'S06 · Deployment — a controller that keeps your Pod alive'
---

- A Pod is the **atom of scheduling**: co-scheduled containers sharing network
  and volumes — usually just one container
- `restartPolicy` restarts a **container**; nothing restarts a **deleted Pod**
- `pod.yaml` is the **red-line seed** — S06 wraps it in a Deployment template
  unchanged, and S07/S08 build on that
- Read failures the same way every time: **status → `describe` → Events**

<!--
Speaker: the emotional beat is "delete the Pod and it's gone — no magic brings it
back." That gap is exactly what a Deployment fills. Hand off to Lab 05 now: they
run every command from these slides and finish on the same punchline. Keep
pod.yaml on disk — Lab 06 opens it.
-->

---
layout: lab
lab: labs/day-1/05-pod.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 05 — Your first Pod

- Apply `pod.yaml`, watch `Pending → Running`, confirm `READY 1/1`
- Inspect it three ways: `describe` (Events), `logs`, `exec` (nginx is PID 1)
- **Break it:** a typo'd image tag → `ImagePullBackOff`; diagnose from Events
- **The punchline:** delete the Pod — nothing recreates it. Keep `pod.yaml` for Lab 06.
