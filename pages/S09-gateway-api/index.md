---
layout: section-cover
day: Day 2
section: '09'
tier: recommended
track: Core
---

# Gateway API

Red line 5/5 · The typed, role-separated successor to Ingress — same routing mental
model, none of the annotation sprawl.

**recommended** · suggested Day 2 · Core track

<!--
Section S09 — Gateway API. Timing: ~30 min slides + 25 min lab. Opens Day 2 and
closes the red line Pod → Deployment → Service → Ingress → Gateway API.
Outcome: learners can explain WHY Gateway API exists (Ingress's ceiling from S08),
name the three roles (GatewayClass / Gateway / HTTPRoute) and who owns each,
translate an Ingress into a Gateway + HTTPRoute that fronts the SAME web/web2
Services, add a typed header match + weighted split, and read status.conditions
(Accepted / Programmed / ResolvedRefs) as the "did it wire up" signal.
Beats: problem (Ingress annotation sprawl, concretely) · mental model (3-box role
split, parentRefs) · magic-move Ingress → Gateway + HTTPRoute → +header match/weight
· GatewayRouting animation · prereq (CRDs on the standard channel + a conformant
controller) · state (conditions vs Ingress opaqueness) · red-line recap · lab.
Red line: the Gateway + HTTPRoute built here route to the S07 `web`/`web2` Services
— it REPLACES S08's ingress.yaml in front of the same backends. CKx: CKA now
includes Gateway API; CKAD service exposure.
-->

---
layout: statement
kicker: The problem
---

In Lab 08 the moment you needed **more than host + path**, the config left the spec.

A canary weight, a header match, a rewrite — none of that is in the Ingress schema, so
it lives in **controller-specific annotations**: untyped strings, unvalidated, and
different for every controller. An Ingress tuned for nginx doesn't move to Traefik.
And one flat object mixes what the **cluster operator** owns (ports, TLS) with what the
**app team** owns (paths, weights). You've outgrown the object.

<!--
Speaker: this is the S08 cliff-hanger made concrete. Show it as: the moment a real
requirement (canary, header routing, timeout) appears, you drop into per-vendor
annotations and lose typing, validation, portability, and any role boundary. That is
the exact gap Gateway API was designed to close — it is not a replacement for the
routing *idea*, just a better-typed home for it. Lab 09 follows this section.
-->

---

<span class="kw-kicker">Mental model · one object became three roles</span>

# Three resources, two owners, attached by name

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading="GatewayClass" icon="🏭">
      <strong>Infra.</strong> Names a controller implementation (like an
      <code>IngressClass</code>). Cluster-scoped, installed once. The app team never
      touches it.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Gateway" icon="🚪">
      <strong>Cluster-operator.</strong> The actual entry point — <strong>listeners</strong>,
      ports, protocol, and shared <strong>TLS</strong>. References a
      <code>gatewayClassName</code>.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="HTTPRoute" icon="🛣️" variant="plain">
      <strong>App team.</strong> The routing rules — paths, <strong>headers</strong>,
      methods, <strong>weights</strong>. Attaches to a Gateway with
      <code>parentRefs</code>.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

That split is the whole point. Infra owns the door; the app team owns the routing —
each in its **own typed object**, in its **own namespace**, wired together by a
`parentRefs` reference. No shared flat object, no annotation free-for-all.

</div>

<!--
Speaker: reveal the three cards, then the payoff. Map each back to Ingress: GatewayClass
≈ IngressClass (infra); Gateway is the NEW thing — a first-class, typed entry point the
operator owns (Ingress had no equivalent — ports/TLS were smeared across annotations);
HTTPRoute is the app team's rules. The parentRefs handshake is what lets the two teams
ship independently. This role separation is the #1 reason large orgs adopt Gateway API,
not the extra match types.
-->

---
layout: code-walkthrough
heading: 'Translate the Ingress — one object into Gateway + HTTPRoute'
lab: labs/day-2/09-gateway-api.md
---

````md magic-move
```yaml
# S08 — one flat object; anything past host/path becomes an annotation
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"        # untyped
    nginx.ingress.kubernetes.io/canary-weight: "10"   # nginx-only, unvalidated
spec:
  ingressClassName: nginx
  rules:
    - host: web.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }
```

```yaml
# infra / cluster-operator owns this — the entry point
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: { name: web }
spec:
  gatewayClassName: nginx            # a controller must own this class
  listeners:
    - { name: http, port: 80, protocol: HTTP }
---
# app team owns this — attaches to the Gateway by name
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: web }
spec:
  parentRefs: [ { name: web } ]      # ← attach to the Gateway above
  rules:
    - matches: [ { path: { type: PathPrefix, value: / } } ]
      backendRefs: [ { name: web, port: 80 } ]     # the SAME S07 Service
```

```yaml
# HTTPRoute only — the Gateway above is unchanged
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: web }
spec:
  parentRefs: [ { name: web } ]
  rules:
    - matches:                       # typed header match — was an annotation
        - path: { type: PathPrefix, value: / }
          headers: [ { name: x-env, value: canary } ]
      backendRefs:                   # typed weighted split — was an annotation
        - { name: web,  port: 80, weight: 90 }
        - { name: web2, port: 80, weight: 10 }
    - matches: [ { path: { type: PathPrefix, value: / } } ]
      backendRefs: [ { name: web, port: 80 } ]
```
````

<!--
Speaker: THREE frames. (1) the S08 Ingress, but honest — a canary needs two nginx
annotations, untyped and vendor-locked. (2) split it: a Gateway (infra, listener :80)
and an HTTPRoute (app, parentRefs → the Gateway) routing / to the SAME `web` Service —
red line continues, new front door, same backend. (3) the annotations become TYPED
fields: a headers: match on x-env=canary and weighted backendRefs 90/10 across web/web2.
Point at parentRefs as the handshake, and at gateway.networking.k8s.io/v1 (GA, standard
channel). The more-specific header rule is listed first — specificity, not order, decides.
-->

---

<span class="kw-kicker">The payoff · same routing model, one layer up</span>

# Gateway ← HTTPRoute → your Services, live

<div class="mt-2">
  <GatewayRouting :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- A plain `GET /` matches the path rule and lands on the **`web`** Service — the backend the Ingress fronted.
- Add `x-env: canary` and the **more specific** rule wins: a **typed** 90/10 weighted split, no annotation in sight.

</v-clicks>
</div>

<!--
Speaker: this is the GatewayRouting animation — the routing story from S07 lifted up a
level: instead of selector→EndpointSlice→Pods, it's request→Gateway→HTTPRoute→backendRefs.
Click through: rest state (two ownership lanes) → GET / routes to web → GET / with the
canary header hits the weighted split. Land it: HTTPRoute picks the backends, the
Gateway just owns the door; every match and weight is a typed field the API validates.
The lab makes the same two curls (with and without the header) real.
-->

---

<span class="kw-kicker">Prerequisite · it isn't built in either</span>

# CRDs on the standard channel + a conformant controller

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="The API ships as CRDs" icon="📦">
    Gateway API is <strong>not</strong> in core Kubernetes. You install the
    <strong>standard-channel</strong> CRDs (GatewayClass, Gateway, HTTPRoute are GA) —
    one <code>kubectl apply</code> from the Gateway API release.
  </KwCard>
  <KwCard heading="A controller implements it" icon="⚙️">
    Just like Ingress: the CRDs are inert until a <strong>conformant controller</strong>
    (NGINX Gateway Fabric, Envoy Gateway, Istio, a cloud LB…) owns the
    <code>gatewayClassName</code> and programs real proxies.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

Same two-part shape as S08 — **API vs implementation** — so the same gotcha applies:
a `gatewayClassName` no controller owns leaves your Gateway **unreconciled** — no address,
empty status, nothing routes (the tell is `kubectl get gatewayclass`). That's the deliberate
break in Lab 09.

</div>

<!--
Speaker: reassure them this is the Ingress pattern they already know — CRDs are the API,
a controller is the implementation, and nothing routes until a controller claims the
class. The one new wrinkle is "channels": standard = GA (GatewayClass/Gateway/HTTPRoute),
experimental = newer stuff (TCPRoute, TLSRoute, some HTTPRoute extras). Teach standard.
Lab 09 Step 1 installs the CRDs + a controller on kind; the shared cluster has them
pre-provided, mirroring Lab 08's split exactly.
-->

---

<span class="kw-kicker">Observability · Ingress never told you this</span>

# Read the status — `Accepted`, `Programmed`, `ResolvedRefs`

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Ingress was opaque" icon="🌫️" variant="warn">
    An Ingress with an empty <code>ADDRESS</code> gives you no reason. Wrong class?
    No controller? You <code>describe</code> and guess. There is no typed "why".
  </KwCard>
  <KwCard heading="Gateway API tells you" icon="✅">
    Every object carries <code>status.conditions</code>:
    <code>Gateway: Accepted / Programmed</code>,
    <code>HTTPRoute: Accepted / ResolvedRefs</code> — each with a reason string.
  </KwCard>
</div>

<div v-click class="mt-4 text-sm">

```console
$ kubectl get gateway web -o wide
NAME   CLASS   ADDRESS       PROGRAMMED   AGE
web    nginx   10.96.1.20    True         30s
# ResolvedRefs=False on the HTTPRoute → a backendRef Service name/port is wrong.
```

</div>

<!--
Speaker: this is the quality-of-life win teams feel immediately. Accepted = the
controller claimed it; Programmed = real data-plane config exists and there's an
address; ResolvedRefs (on the route) = every backendRef resolved to a real Service/port.
When routing breaks you read a condition and a reason instead of guessing. The lab's
break→fix (bad gatewayClassName → unreconciled, empty status — no owner to write conditions)
and its ResolvedRefs=False question (the controller-reported "typed why") make this muscle
memory. Contrast hard with S08's silent empty ADDRESS.
-->

---
layout: recap
heading: 'Debrief — the red line is complete'
story: 'One app, one manifest family — from a lone Pod to a typed Gateway front door, every step extended the last.'
compact: true
next: 'S10 · ConfigMap & Secret — separate config from the image (Day 2 continues)'
---

- **Gateway API** — typed successor: **GatewayClass** → **Gateway** → **HTTPRoute**, wired by `parentRefs`
- Fronts the **same** `web`/`web2` Services — replaces `ingress.yaml`, not the backends — red line **5/5**
- Annotations become **typed fields**: header/method matches and weighted splits are first-class
- **CRDs + conformant controller** — nothing routes until a controller owns `gatewayClassName`
- **`status.conditions`** (**Accepted / Programmed / ResolvedRefs**) tell you *why*
- Day-1 spine: **`pod` → `deployment` → `service` → `ingress` → `gateway` + `httproute`**

<!--
Speaker: this closes the red line that started with a single Pod. Walk it out loud one
last time — a Pod runs the container, a Deployment keeps N healthy, a Service gives a
stable address, an Ingress/Gateway exposes it — every step extended the last. Then pivot
to the rest of Day 2: now that the app is reachable, we make it configurable (S10),
durable (S11), stateful (S12), and well-behaved under load. Hand off to Lab 09 — install
the CRDs + a controller, translate the Ingress, add a header-matched canary, and break
the gatewayClassName to watch Accepted flip.
-->

---
layout: lab
lab: labs/day-2/09-gateway-api.md
duration: 25 min
env: kind ✓ (CRDs + controller install) · namespace ✓ (CRDs/controller pre-provided)
---

## Lab 09 — Route with a Gateway and an HTTPRoute

- **kind:** install the Gateway API CRDs + a controller · **shared:** they're
  pre-provided — confirm `kubectl get gatewayclass` shows `ACCEPTED=True`
- Apply a **Gateway** (listener `:80`); read `Programmed=True` from its status
- Apply an **HTTPRoute** (`parentRefs` → Gateway, `PathPrefix /` → the `web` Service); `curl` → **200**
- Extend it with a **header match** (`x-env: canary`) to `web2`; `curl` with and without the header
- **Break it:** point `gatewayClassName` at a class nobody owns → unreconciled, no address; fix and watch it program
- Stretch: split one path across two `backendRefs` by **weight**.
