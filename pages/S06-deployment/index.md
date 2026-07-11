---
layout: section-cover
image: /covers/section-06-the-herd.png
day: Day 1
section: '06'
tier: core
track: Core
---

# Deployment

Red line 2/5 · A controller that keeps your Pods alive, scales them, and rolls
out new versions without an outage.

**core** · suggested Day 1 · Core track

<!--
Section S06 — Deployment. Timing: ~35 min slides + 30 min lab.
Outcome: learners can wrap a Pod in a Deployment, explain the
Deployment→ReplicaSet→Pod chain, drive a rolling update, and roll back.
Beats: problem (bare Pods don't heal/scale) · ownership chain · magic-move
extend pod.yaml → deployment.yaml · rolling update animation (US-X2) ·
rollout verbs + recommended labels · scaling (spec vs status) · recap to S07.
Red line: the deployment.yaml built here IS labs/day-1/06-deployment's manifest,
and it wraps S05's pod.yaml unchanged under spec.template. CKx: CKAD Deployments,
rolling updates & rollbacks.
-->

---
layout: statement
kicker: The problem
---

You deleted a Pod in Lab 05 and **nothing brought it back.**

A bare Pod can't self-heal, can't scale, and can't roll out a new version — it's
a single life with no replacement. Real workloads hand that job to a **controller**
that holds a *desired state* and works to keep it true. For stateless apps that
controller is the **Deployment.**

<!--
Speaker: call back to S05's punchline directly — the deleted Pod that stayed
deleted. The fix isn't "be more careful," it's "let a controller own the Pod."
This is the first time the reconciliation loop from S03 becomes something they
hold in their hands. Lab 06 follows this section.
-->

---

<span class="kw-kicker">Mental model</span>

# One object you edit, three that do the work

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Deployment" kind="deploy">
      What <strong>you</strong> edit. Holds the Pod <code>template</code> and the
      desired <code>replicas</code>. Manages rollouts — it owns
      <strong>ReplicaSets</strong>, not Pods directly.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="ReplicaSet" kind="rs" variant="plain">
      One per Pod-template version. Its only job: keep exactly
      <code>replicas</code> Pods of <em>its</em> template alive. A new image ⇒ a
      <strong>new ReplicaSet</strong>.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Pods" kind="pod">
      The S05 Pod, minted from the template. Each carries an
      <code>ownerReferences</code> back to its ReplicaSet — delete one and the
      owner remints it.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

`Deployment → ReplicaSet → Pods`. You almost never touch a ReplicaSet by hand —
you edit the Deployment, and it drives the rest through the **reconciliation loop
from S03.**

</div>

<!--
Speaker: the key surprise is the *middle* object. People expect Deployment→Pods;
the ReplicaSet in between is what makes rollouts and rollback work — each version
gets its own RS. Show ownerReferences later in the lab with
`kubectl get pod -o yaml`. Reveal one box per click, then the chain line.
-->

---
layout: code-walkthrough
heading: 'Extend the Pod — same spec, now inside a template'
lab: labs/day-1/06-deployment.md
---

````md magic-move
```yaml
# pod.yaml from S05 — the red-line seed we extend
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
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
```

```yaml
apiVersion: apps/v1        # workloads live in apps/v1, not core v1
kind: Deployment           # Pod → Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3              # NEW — how many Pods you want
  selector:
    matchLabels:
      app: web             # NEW — which Pods this Deployment owns
  template:                # everything below is the S05 Pod, indented one level
    metadata:
      labels:
        app: web           # the Pod's own labels — must satisfy the selector
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # must match template.metadata.labels below
  template:
    metadata:
      labels:
        app: web        # the Pod labels — Lab 07's Service selects these
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
```
````

<!--
Speaker: THREE frames. (1) the exact S05 pod.yaml — "you already wrote this."
(2) the move that trips everyone: the metadata SPLITS — the Pod's identity goes
two places. Pod name → Deployment metadata.name; Pod labels → BOTH
template.metadata.labels (stamped on every Pod) AND selector.matchLabels (how the
Deployment finds them). The whole S05 container spec drops under spec.template
UNCHANGED. (3) the clean file you apply — this frame IS
labs/day-1/06-deployment's deployment.yaml, byte-for-byte. Hammer: selector must
match template labels or the API server rejects it.
-->

---

<span class="kw-kicker">The payoff · rolling update</span>

# Change the image → zero-downtime rollout

<div class="mt-2">
  <RollingUpdate :step="$clicks" />
</div>

<div class="mt-4 text-sm">
<v-clicks at="1">

- **`maxSurge`** lets the new ReplicaSet add Pods *above* desired first — capacity never dips.
- **`maxUnavailable`** caps how many old Pods may be down at once — here, one leaves only after a new one is `Ready`.
- The **old ReplicaSet is kept at 0**, which is exactly what makes `rollout undo` instant.

</v-clicks>
</div>

<!--
Speaker: this is the shared US-X2 rolling-update animation, owned here and reused
by S12 (StatefulSet contrast) and anywhere a rollout is shown. Click through:
steady 3 → surge +1 (new Pod created above desired) → new Ready, one old
terminates → migrated, old RS drained to 0. Land the pairing: maxSurge is the
"how much extra" knob, maxUnavailable the "how much less" knob. Defaults are 25%
each. Lab 06 Step 3 watches this exact churn with `kubectl get rs -w`.
-->

---
layout: code-annotated
heading: 'Drive it: set image, watch, undo'
lab: labs/day-1/06-deployment.md
---

```bash {none|1|2|3|4}
kubectl set image deployment/web web=nginx:1.28
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
```

::notes::

<CodeNote at="1" label="set image">
Edits the Pod template's image in place. That template change is what mints a
<strong>new ReplicaSet</strong> — the rollout you just watched.
</CodeNote>

<CodeNote at="2" label="rollout status" variant="ok">
Blocks until every new Pod is <code>Ready</code> (or the rollout stalls). Its
exit code is your CI gate: <code>0</code> = shipped.
</CodeNote>

<CodeNote at="3" label="history">
Each template change is a numbered <strong>revision</strong>. This is the audit
trail of what shipped when — kept because old ReplicaSets stay around.
</CodeNote>

<CodeNote at="4" label="undo" variant="warn">
Promotes the previous ReplicaSet back to full replicas and drains the current
one — the rollout in reverse. No YAML editing, no redeploy.
</CodeNote>

<!--
Speaker: these four verbs are the whole rollout lifecycle. Emphasise that undo is
possible ONLY because the old RS was retained at 0 — tie back to the animation's
last frame. Lab 06 Step 5 does the scary version: roll a bad tag, watch it stall
(old Pods keep serving), then undo. Mention revisionHistoryLimit trims old RSs.
-->

---

<span class="kw-kicker">Scaling & labelling</span>

# Scale by editing desire; label so tools can find it

<div class="kw-cols-2 mt-3">
  <div>

```bash
kubectl scale deployment/web --replicas=5
```

<div class="mt-3 text-sm" v-click="1">

Scaling changes **one number** — `spec.replicas`. The ReplicaSet adds or removes
Pods until `status.replicas` matches. You state the *want*; the loop makes it so —
no Pods created by hand.

</div>

  </div>
  <div v-click="2">

```yaml
metadata:
  labels:
    app.kubernetes.io/name: web
    app.kubernetes.io/version: "1.27"
    app.kubernetes.io/component: frontend
```

<div class="mt-3 text-sm">

The **recommended labels** (`app.kubernetes.io/*`) are a shared vocabulary every
tool understands — dashboards, `kubectl get -l`, and the Service selector in
**S07 next.**

</div>

  </div>
</div>

<div v-click="3" class="mt-5">
  <KwChip variant="ok">spec.replicas = desired</KwChip>
  <KwChip>status.replicas = observed</KwChip>
  <KwChip variant="warn">HPA (S16) writes replicas for you</KwChip>
</div>

<!--
Speaker: two ideas on one slide. (1) scaling is just editing desired state — the
same reconciliation muscle, no new mechanism. Spec vs status again (from S03).
(2) recommended labels are how the ecosystem agrees on names; they also feed the
S07 Service selector, so it's the natural bridge. Don't dwell — one line each.
Note HPA later automates the replica number.
-->

---
layout: recap
heading: 'Recap — you edit desire, the controller does the work'
next: 'S07 · Service — a stable address in front of these churning Pods'
---

- A **Deployment** owns **ReplicaSets** which own **Pods**; you edit the
  Deployment and the reconciliation loop does the rest
- `deployment.yaml` **wraps S05's `pod.yaml` unchanged** inside `spec.template` —
  red line 2/5, and Lab 07's Service will select these same `app: web` Pods
- A new image ⇒ a **new ReplicaSet**; `maxSurge`/`maxUnavailable` keep the app up
  through the rollout, and the old RS stays at 0 so `rollout undo` is instant
- **Scaling** is just editing `spec.replicas` — desired vs observed, one more time

<!--
Speaker: the emotional beat flips from S05's "it's gone" to "it heals, scales,
and upgrades itself." But note the gap S07 fills: every rollout changed the Pod
IPs — clients can't chase a moving target. That's the Service. Hand off to Lab 06;
keep deployment.yaml on disk, Lab 07 adds a Service beside it.
-->

---
layout: lab
lab: labs/day-1/06-deployment.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 06 — Rollouts & rollbacks

- Extend `pod.yaml` into `deployment.yaml`; watch **Deployment → ReplicaSet → 3 Pods**
- Delete a Pod — the ReplicaSet remints it; **scale** to 5 and back
- **Roll out** `nginx:1.28`, watch two ReplicaSets churn, read `rollout history`
- **Break it:** roll a bad tag → rollout **stalls** while old Pods keep serving → `rollout undo`
- Keep `deployment.yaml` for Lab 07.
