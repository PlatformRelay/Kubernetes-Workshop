---
layout: section-cover
image: /covers/section-09-modular-customs-house.png
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
Stack: Gateway API standard-channel CRDs v1.5.1 + Envoy Gateway v1.8.2 (class `eg`)
— pinned in infra/versions.env.
Beats: problem (Ingress annotation sprawl, concretely) · mental model (3-box role
split, parentRefs) · magic-move Ingress → Gateway + HTTPRoute → typed header match →
weighted split · GatewayRouting animation · prereq (CRDs on the standard channel + a
conformant controller + an explicitly declared GatewayClass) · state (conditions vs
Ingress opaqueness) · red-line recap · lab.
Red line: the Gateway + HTTPRoute built here route to the S07 `web`/`web2` Services
— it REPLACES S08's ingress.yaml in front of the same backends. CKx: CKA now
includes Gateway API; CKAD service exposure.
-->

---
layout: statement
kicker: The problem
---

In Lab 08 the moment you needed **more than host + path**, the config left the spec.

A response timeout, a header match, a canary weight — none of that is in the Ingress
schema, so it lives in **controller-specific annotations**: untyped strings,
unvalidated, and different for every controller. An Ingress tuned for one controller
doesn't move to the next — the annotations don't carry. And one flat object mixes what
the **cluster operator** owns (ports, TLS) with what the **app team** owns (paths,
weights). You've outgrown the object.

<!--
Speaker: this is the S08 cliff-hanger made concrete. Show it as: the moment a real
requirement (timeout, header routing, canary) appears, you drop into per-vendor
annotations and lose typing, validation, portability, and any role boundary. S08's
controller taught this honestly — Contour reads a handful of projectcontour.io/*
annotations, and its richer answer is its own HTTPProxy CRD: same lock-in shape,
different vendor. That is the exact gap Gateway API was designed to close — it is not
a replacement for the routing *idea*, just a better-typed home for it. Lab 09 follows
this section.
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
# Ingress — one flat object; anything past host/path becomes an annotation
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    projectcontour.io/response-timeout: "15s"    # untyped string
    projectcontour.io/websocket-routes: "/ws"    # one controller's dialect
spec:
  ingressClassName: contour
  rules:
    - host: web.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: eg             # must match `kubectl get gatewayclass`
  listeners:
    - name: http
      port: 80
      protocol: HTTP
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web                    # attach to the Gateway named "web"
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }  # the SAME Service from Lab 07
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
          headers:
            - { name: x-env, value: canary }   # typed match — no annotation
      backendRefs:
        - { name: web2, port: 80 }
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:                     # typed weighted split — no annotation
        - { name: web,  port: 80, weight: 90 }
        - { name: web2, port: 80, weight: 10 }
```
````

<!--
Speaker: FOUR frames. (1) Lab 08's Ingress — boiled down to its first host rule and
pushed past the ceiling: a timeout or a websocket route needs projectcontour.io/*
annotations, untyped, one controller's dialect, and they don't move with you. (2) split it: a Gateway (infra, listener :80) and an HTTPRoute
(app, parentRefs → the Gateway) routing / to the SAME `web` Service — red line
continues, new front door, same backend. This frame is the lab's `gateway.yaml` +
`route.yaml`, byte-for-byte — the anchor. (3) the app team's upgrade: a TYPED headers:
match on x-env=canary → web2 — this frame IS the lab's `route-header.yaml`. (4) the
canary weight that used to be an annotation is a validated integer: weighted
backendRefs 90/10 across web/web2 — the lab's stretch `route-canary.yaml`. Point at
parentRefs as the handshake, and at gateway.networking.k8s.io/v1 (GA, standard
channel). In frame 3 the more-specific header rule wins — specificity, not order,
decides.
-->

---

<span class="kw-kicker">The payoff · same routing model, one layer up</span>

# Gateway ← HTTPRoute → your Services, live

<div class="mt-2">
  <GatewayRouting :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- A plain `GET /` matches the path rule and lands on the **`web`** Service — its body answers `workshop-web v1`, the backend the Ingress fronted.
- Add `x-env: canary` and the **more specific** rule wins: a **typed** 90/10 weighted split — countable straight off the `v1`/`v2` version line.

</v-clicks>
</div>

<!--
Speaker: this is the GatewayRouting animation — the routing story from S07 lifted up a
level: instead of selector→EndpointSlice→Pods, it's request→Gateway→HTTPRoute→backendRefs.
Click through: rest state (two ownership lanes) → GET / routes to web → GET / with the
canary header hits the weighted split. Land it: HTTPRoute picks the backends, the
Gateway just owns the door; every match and weight is a typed field the API validates.
The lab makes this observable without any HTML tricks: every workshop-web response
prints its version (v1/v2) and pod name, so the header match and the 90/10 split are
readable straight from curl output.
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
    (Envoy Gateway, Istio, Contour, a cloud LB…) owns the
    <code>gatewayClassName</code> and programs real proxies.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

Same two-part shape as Ingress — **API vs implementation** — plus one explicit step:
**you declare the `GatewayClass` yourself** (ours is `eg`), naming the controller that
owns it. A `gatewayClassName` no controller owns leaves your Gateway waiting forever —
the tell is `kubectl get gatewayclass`. That's the deliberate break in Lab 09.

</div>

<!--
Speaker: reassure them this is the Ingress pattern they already know — CRDs are the API,
a controller is the implementation, and nothing routes until a controller claims the
class. The one new wrinkle is "channels": standard = GA (GatewayClass/Gateway/HTTPRoute),
experimental = newer stuff (TCPRoute, TLSRoute, some HTTPRoute extras). Teach standard.
Version nuance worth saying out loud: pin the CRD channel version your controller
COMPILES AGAINST, not the newest release — a newer standard channel exists (v1.6.0),
but our controller (Envoy Gateway v1.8) is built and conformance-tested against v1.5.1,
so v1.5.1 is the deliberate pin (infra/versions.env). Second wrinkle: the controller
install doesn't create a GatewayClass — infra declares it explicitly, the exact mirror
of Lab 08's IngressClass beat. Lab 09 Step 1 does all three on kind (CRDs, controller,
GatewayClass); the shared cluster has them pre-provided, mirroring Lab 08's split.
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
$ kubectl get gateway web
NAME   CLASS   ADDRESS   PROGRAMMED   AGE
web    eg                False        30s
# the condition says WHY: Programmed=False (AddressNotAssigned) — kind has no
# load balancer to hand out an address; the proxy still serves via port-forward.
```

</div>

<!--
Speaker: this is the quality-of-life win teams feel immediately. Accepted = the
controller claimed it and provisioned a data plane; Programmed = an address is assigned
and Envoy replicas are available; ResolvedRefs (on the route) = every backendRef
resolved to a real Service/port. The console block is the HONEST kind output: our
controller provisions a LoadBalancer Service per Gateway, kind has no LB controller, so
no address is ever assigned and Programmed stays False with reason AddressNotAssigned —
a typed condition that names exactly what's missing, where Ingress just showed a silent
empty ADDRESS. On a cloud/shared cluster it flips True with the LB address. The lab's
break→fix goes one level deeper: a gatewayClassName nobody owns leaves the CRD's own
default conditions — Unknown (Pending) "Waiting for controller" — and the
ResolvedRefs=False question (BackendNotFound) shows the controller-reported "typed why".
When routing breaks you read a condition and a reason instead of guessing.
-->

---
layout: recap
heading: 'Recap — the red line is complete'
story: 'One app, one manifest family — from a lone Pod to a typed Gateway front door, every step extended the last.'
compact: true
next: 'ConfigMap & Secret — separate config from the image (Day 2 continues)'
---

- **Gateway API** — typed successor: **GatewayClass** → **Gateway** → **HTTPRoute**, wired by `parentRefs`
- Fronts the **same** `web`/`web2` Services — replaces `ingress.yaml`, not the backends — red line **5/5**
- Annotations become **typed fields**: header/method matches and weighted splits are first-class
- **CRDs + conformant controller** — and a **declared** `GatewayClass`; nothing routes until a controller owns the class
- **`status.conditions`** (**Accepted / Programmed / ResolvedRefs**) tell you *why* — reason strings, not silence
- Day-1 spine: **`pod` → `deployment` → `service` → `ingress` → `gateway` + `httproute`**

<!--
Speaker: this closes the red line that started with a single Pod. Walk it out loud one
last time — a Pod runs the container, a Deployment keeps N healthy, a Service gives a
stable address, an Ingress/Gateway exposes it — every step extended the last. Then pivot
to the rest of Day 2: now that the app is reachable, we make it configurable (S10),
durable (S11), stateful (S12), and well-behaved under load. Hand off to Lab 09 — install
the CRDs + the controller, declare the `eg` GatewayClass, translate the Ingress, add a
header-matched canary, and point a Gateway at a class nobody owns to watch its status
wait for a controller that never comes.
-->

---
layout: lab
lab: labs/day-2/09-gateway-api.md
duration: 25 min
env: kind ✓ (CRDs + controller install) · namespace ✓ (CRDs/controller pre-provided)
---

## Lab 09 — Route with a Gateway and an HTTPRoute

- **kind:** install the Gateway API CRDs + a controller, then **declare** the `eg`
  GatewayClass · **shared:** pre-provided — confirm `kubectl get gatewayclass` shows `ACCEPTED=True`
- Apply a **Gateway** (listener `:80`); read `Accepted=True` — and the typed reason why
  `Programmed` stays `False` on kind (no load balancer)
- Apply an **HTTPRoute** (`parentRefs` → Gateway, `PathPrefix /` → the `web` Service);
  `curl` via port-forward → `workshop-web v1`
- Extend it with a **header match** (`x-env: canary`) to `web2`; `curl` with and without the header
- **Break it:** a `gatewayClassName` nobody owns → status stays `Waiting for controller`; fix and watch it get claimed
- Stretch: split one path **90/10** across two `backendRefs` and count the `v1`/`v2` lines.
