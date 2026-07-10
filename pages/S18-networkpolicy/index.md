---
layout: section-cover
image: /covers/section-18-paddock-fences.png
day: Day 3
section: '18'
tier: recommended
track: Security
---

# NetworkPolicy

Isolate workloads: default-deny, then explicit allows.

**recommended** · suggested Day 3 · Security track

<!--
Section S18 — NetworkPolicy. Day 3 (M5), the network complement to S17 (which hardened what a
Pod IS; here we control what a Pod may TALK to). Timing: ~25 min slides + 25 min lab. Outcome:
learners can take a flat pod network, apply a default-deny ingress policy to flip selected Pods
to deny-all, re-open a single targeted lane with an additive allow, and know the policy is a
no-op unless a policy-capable CNI enforces it.
Beats: problem (flat network — every Pod reaches every Pod → the S17 tie: a compromised Pod
roams) · mental model (NetworkPolicy = selector + allow rules; no policy = allow-all; the first
policy to select a Pod flips that direction to default-deny; policies are additive/allow-only) ·
code-annotated (the two-line default-deny) · magic-move (build allow-frontend-to-backend field by
field; final frame == the lab's file) · selectors (podSelector vs namespaceSelector; the AND/OR
gotcha; ingress vs egress) · CNI caveat (unenforced = silent no-op → the lab self-tests) ·
NetworkFence animation · debrief → S25 · lab.
Animation: NetworkFence.vue (new, self-contained) — flat → default-deny fence → one gate open.
NOT a reuse of AdmissionGate.vue: that is admission-time (a Pod CREATE request denied before it
exists); this is runtime pod-to-pod TRAFFIC allowed/dropped by the CNI — a different layer, so a
distinct component (same call as S11/S12/S13/S16).

ACCURACY LOCKS (verified against the current NetworkPolicy docs):
- No policy selecting a Pod = allow-all for that Pod. The FIRST policy that selects it for a
  direction flips that direction to default-deny; only the UNION of matching allow rules passes.
- default-deny (ingress) = `podSelector: {}` + `policyTypes: [Ingress]`, no ingress rules. Empty
  podSelector selects EVERY Pod in the namespace.
- Ingress and egress are INDEPENDENT. A default-deny *ingress* policy does NOT touch egress — DNS
  still works (that is the lab's "why didn't DNS break?" question; exit 28 timeout, not exit 6).
- Policies are ADDITIVE/ALLOW-ONLY (unioned). There is no deny rule; a Pod is default-deny for a
  direction only because a policy selected it and nothing allowed the traffic.
- In a `from[]` list: selectors in ONE element are AND-ed; separate elements are OR-ed.
- Enforced by the CNI. `kubectl apply` accepts the object even if the CNI ignores it (silent
  no-op). Enforcers: Calico, Cilium, Antrea, and modern kindnet; some managed/basic CNIs don't →
  the lab SELF-TESTS enforcement (apply default-deny, confirm traffic breaks) before relying on it.
CKx tie-in: CKA & CKAD Services & Networking (NetworkPolicy).
-->

---
layout: statement
kicker: The problem
---

By default, **every Pod can reach every other Pod** — across namespaces, no firewall between them.

The Kubernetes pod network is **flat**: your `frontend`, the `backend`, the database, and a Pod
you've never heard of can all open a connection to each other. Nothing you've built so far changed
that. So the moment **one** Pod is compromised — the exact scenario S17 was hardening against — it
can scan the whole cluster and talk to anything that will answer.

<!--
Speaker: the "why care" beat, and it deliberately continues S17. S17 shrank what a single Pod can
DO (non-root, no caps, seccomp). But even a perfectly hardened Pod sits on a flat L3 network where
it can reach every other Pod's IP directly — Services are just convenience names on top of that
flat reachability. Name the blast radius: a foothold in one web Pod can port-scan the namespace,
hit an unauthenticated internal API, reach the database. Edge firewalls do nothing about east-west
traffic between Pods. NetworkPolicy is the in-cluster firewall: "backend only accepts traffic from
frontend," enforced by the data plane. Default-deny then explicit-allow is the same shape as S17's
admission ladder — start closed, open only what you need. A named defence in S25.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · a selector plus a list of allowed peers</span>

# NetworkPolicy = *pick Pods* + *allow these connections*

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="It selects Pods and only ALLOWS" kind="netpol" variant="ok">
      A <code>podSelector</code> picks the Pods this policy governs. Rules list what's
      <strong>permitted</strong> — there is <strong>no deny rule</strong>. You allow
      <code>ingress</code> (who may connect <em>to</em> them) and/or <code>egress</code> (where
      they may connect <em>out</em>).
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="No policy = allow-all" icon="🌐" variant="warn">
      A Pod that <strong>no</strong> policy selects is wide open — the flat network. There's
      nothing to configure to be open; that's the default.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the one rule that trips everyone</span>

The **first** policy that selects a Pod for a direction flips that Pod to **default-deny** for
that direction — then only the **union** of matching allow rules gets through. So you deny by
*selecting*, and re-open with explicit allows. Policies are **additive**: more policies can only
*add* allowed traffic, never subtract. Ingress and egress are **independent** switches.

</div>

</div>

<!--
Speaker: three ideas, in order. (1) A NetworkPolicy is a selector + allow rules; it's allow-only,
there is deliberately no deny rule (deny is a different, newer API — AdminNetworkPolicy — out of
scope). Two independent directions: ingress = connections INTO the selected Pods, egress = OUT.
(2) The default with zero policies is allow-all — the flat network. (3) The counter-intuitive
part: you don't "turn on" deny. The moment ANY policy selects a Pod for ingress, that Pod's
ingress becomes default-deny, and only what policies explicitly allow passes. Multiple policies
selecting the same Pod are OR-ed (union of allows) — they can only widen, never narrow. That's why
the idiom is "default-deny policy first, then add allow policies": the default-deny is just a
policy that selects everything and allows nothing. Next: the two-line default-deny.
-->

---
layout: code-annotated
heading: 'Default-deny: select every Pod, allow nothing'
compact: true
lab: labs/day-3/18-networkpolicy.md
---

```yaml {none|7|8-9|all}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}            # selects every Pod in the namespace
  policyTypes:
    - Ingress                # govern ingress; with no rules below → deny all
```

::notes::

<CodeNote at="1" label="podSelector: {} — everything" variant="warn">
An <strong>empty</strong> selector matches <strong>every Pod</strong> in the namespace. Now every
Pod is "selected for ingress", so every Pod flips to default-deny.
</CodeNote>

<CodeNote at="2" label="policyTypes: Ingress — one direction" variant="ok">
We govern <strong>ingress</strong> and write <strong>no</strong> ingress rules → all incoming
traffic denied. <code>egress</code> is <em>not</em> listed, so it stays wide open — including DNS.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
That's the whole thing: no <code>ingress:</code> key means "zero allowed sources." This one object
takes a namespace from allow-all to <strong>deny-all inbound</strong> — the clean slate you then
poke holes in.
</div>

<!--
Speaker: the smallest useful policy. podSelector: {} = all Pods (an empty selector is "match
everything", the opposite of what people expect). policyTypes names the directions this policy is
responsible for; we list only Ingress. Because there is no `ingress:` block, the allowed-source set
is empty → deny all inbound. Crucially we did NOT list Egress, so egress is untouched — outbound
and DNS still work (that's the lab's "why didn't DNS break?" question). Apply this and every Pod in
the namespace stops accepting connections; next we open exactly one path back.
-->

---
layout: code-walkthrough
heading: 'Open one gate — allow ingress from `app=frontend`'
lab: labs/day-3/18-networkpolicy.md
---

````md magic-move
```yaml
# which Pods does THIS policy govern? → the backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend
```

```yaml
# +policyTypes — we're writing an ingress allow
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
```

```yaml
# +from — allow ingress only FROM Pods labelled app=frontend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
```

```yaml
# +ports — …and only to TCP 8080. Final frame == the lab's file.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend           # this policy governs the backend Pods
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # …only from Pods labelled app=frontend
      ports:
        - protocol: TCP
          port: 8080
```
````

<!--
Speaker: FOUR frames, building the allow policy that re-opens the one path we want. Frame 1:
podSelector picks the backend — "this policy is about who may talk to the backend." Frame 2:
policyTypes: Ingress — same as default-deny, we're governing inbound. Frame 3: the `from` list —
allow sources whose Pods carry app=frontend. Frame 4: narrow to port 8080 (a policy with a `ports`
list allows ONLY those ports). Two subtleties: (a) this policy and the default-deny COEXIST —
they're additive, so the effective rule is "backend accepts 8080 from frontend, nothing else"; you
don't delete the default-deny. (b) `from` selects the SOURCE Pods, the top `podSelector` selects
the DESTINATION Pods — beginners mix these up. Final frame is the exact file the lab applies.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Selecting peers · the shapes and the gotcha</span>

# `podSelector`, `namespaceSelector`, and AND vs OR

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Two selector kinds" kind="netpol" variant="ok">
      <code>podSelector</code> — peers by <strong>Pod label</strong>, same namespace by default.
      <code>namespaceSelector</code> — peers by <strong>namespace label</strong>, any Pod in
      matching namespaces (how you allow cross-namespace).
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Ingress vs egress" icon="↔️" variant="ok">
      <code>ingress.from</code> = allowed <strong>sources</strong>;
      <code>egress.to</code> = allowed <strong>destinations</strong>. Independent — set one, the
      other, or both.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the one-dash difference that flips the meaning</span>

Inside a **single** `from` element, `namespaceSelector` **and** `podSelector` are **AND**-ed —
*"frontend Pods **in** team=web namespaces."* Split them into **two** `from` elements and they're
**OR**-ed — *"anything in team=web namespaces, **or** any frontend Pod."* Same two lines, one dash
apart, opposite result. `egress.to` uses the exact same shapes.

</div>

</div>

<!--
Speaker: this is the slide that saves a debugging hour. podSelector matches peer POD labels;
namespaceSelector matches peer NAMESPACE labels. A bare podSelector is scoped to the policy's OWN
namespace — to allow from another namespace you need a namespaceSelector (namespaceSelector: {} =
all namespaces). The gotcha is pure YAML list structure: two selectors in ONE `from` element are
AND-ed ("pods matching X that also live in namespaces matching Y"); as TWO elements they're OR-ed.
One dash, opposite meaning. Point back to our lab policy: single podSelector, same namespace, one
source — the simplest case. Next: the catch that makes or breaks all of it.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The catch · a policy is only paper without an enforcer</span>

# NetworkPolicy needs a **policy-capable CNI**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="The API always accepts it" icon="⚠️" variant="danger">
      <code>kubectl apply</code> stores the policy on <strong>any</strong> cluster — no error.
      Whether it's <strong>enforced</strong> is entirely up to the CNI. A non-enforcing CNI makes
      every policy a <strong>silent no-op</strong>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="So: enforcers vs not" kind="netpol" variant="ok">
      Enforce: <strong>Calico, Cilium, Antrea</strong>, and modern <strong>kindnet</strong>. May
      not: some managed/basic CNIs. <strong>Verify by testing</strong>, never assume.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">
This is why Lab 18 is <strong>kind ✓</strong> with an <strong>enforcement self-test</strong> first
(apply default-deny; confirm traffic actually breaks). On a shared cluster whose CNI doesn't
enforce, the lab has a <strong>read-only</strong> path: inspect a pre-applied policy with
<code>kubectl describe netpol</code>.
</div>

</div>

<!--
Speaker: the operational landmine, and it's guardrail-critical (stay current). NetworkPolicy is an
API OBJECT enforced by the DATA PLANE — the CNI. The API server happily stores a policy on a
cluster whose CNI ignores it; you get zero feedback and zero enforcement. A green `kubectl apply`
proves nothing. Enforcing CNIs: Calico, Cilium, Antrea, Weave — and, on recent releases, kind's
own kindnet (via kube-network-policies). Older kind or a bare/managed CNI may not. The only safe
move is to TEST: apply a default-deny and confirm traffic breaks; if it doesn't, your CNI isn't
enforcing. That's exactly what the lab does up front, and why the shared-cluster path is read-only
when the room's CNI is a no-op. DELIVERY NOTE: re-verify the room's kind version enforces before
the session — the one fact most likely to have drifted.
-->

---

<span class="kw-kicker">Flat → fenced → one gate open</span>

# The fence goes up, then one gate opens

<div class="mt-2">
  <NetworkFence :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **No policy:** the network is flat — `frontend`, `other`, and `scanner` all reach the backend (`200`).
- **`default-deny` ingress:** the backend is selected → **every** connection is dropped (they hang, then time out).
- **`allow-frontend-to-backend`:** additive — exactly one gate opens. `frontend` gets through; `other` and `scanner` stay fenced out.

</v-clicks>
</div>

<!--
Speaker: drive with clicks; this is the lab as a picture, and the paddock-fence of the cover. (0)
flat: three green lanes into the backend — the default. (1) default-deny: the fence snaps up, all
three lanes go red — and say it: the packets are DROPPED, so the caller hangs and times out (not
"connection refused" — there's no one saying no, the packet just vanishes; that timeout-vs-refused
distinction is a lab question). (2) allow-frontend-to-backend: the frontend lane turns green while
other/scanner stay red — the union of allows is exactly one source. Same backend, same clients —
the only thing that changed is which policies select it. That's the whole loop of Lab 18.
-->

---
layout: recap
heading: 'Debrief — deny by selecting, allow on purpose'
story: 'The flat network let everything reach the backend. One default-deny policy fenced it off — every caller timed out. A single allow-from-frontend rule opened exactly one gate, and only the frontend got back in.'
next: 'S19 · RBAC — from "who may connect" to "who may act": identities, verbs, and least-privilege bindings'
---

- The pod network is **flat by default** — every Pod can reach every Pod; NetworkPolicy is the
  in-cluster firewall
- A policy **selects Pods and allows** ingress/egress — there is no deny rule; the **first** policy
  to select a Pod flips it to **default-deny** for that direction
- **default-deny + explicit allow** is the idiom; policies are **additive** (union of allows, never
  subtract)
- **`policyTypes` scopes the direction** — deny ingress and egress/DNS still work; lock egress and
  you must re-allow DNS
- Enforced by the **CNI only** — `kubectl apply` succeeds even when nothing enforces; **test it**
- Pairs with **S17** (workload hardening) and is a named defence in **S25** (pod escape)

<!--
Speaker: land the two-part model that carries into S25. S17 hardened what a Pod IS; S18 controls
what a Pod may TALK to — together they shrink both the foothold and the blast radius. Four things:
(1) flat by default; (2) you deny by SELECTING a Pod, then re-open with explicit allows, and
policies only ever add; (3) policyTypes decides which directions you govern — a default-deny
INGRESS leaves egress/DNS alone, usually what you want to start with; (4) none of it means anything
unless the CNI enforces, so verify. Hand to Lab 18: deploy the apps, prove they talk, drop a
default-deny and watch curl time out, then add one allow rule and watch exactly the frontend come
back — with the enforcement self-test first so nobody debugs a no-op CNI for twenty minutes.
-->

---
layout: lab
lab: labs/day-3/18-networkpolicy.md
duration: 25 min
env: 'kind ✓ (policy CNI) / namespace: read-only'
---

## Lab 18 — Fence the traffic

- **Self-test:** confirm your CNI actually enforces (default-deny must break traffic)
- Deploy `frontend`, `other`, `scanner`, and `backend`; prove all three curl the backend (`200`)
- **Break:** apply `default-deny-ingress` → every curl **times out** (dropped, not refused)
- **Fix:** apply `allow-frontend-to-backend` → only `frontend` gets back in; the others stay blocked
- Observe: DNS still resolves under the ingress deny; relabel `frontend` and the allow stops matching
