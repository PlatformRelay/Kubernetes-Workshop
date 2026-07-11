---
layout: section-cover
image: /covers/section-08-grand-gate.png
day: Day 1
section: '08'
tier: core
track: Core
---

# Ingress

Red line 4/5 · One L7 entry point that routes external HTTP by **host and path**
into your Services — and does nothing until a controller stands behind it.

**core** · suggested Day 1 · Core track

<!--
Section S08 — Ingress. Timing: ~25 min slides + 25 min lab.
Outcome: learners can front their Services with an Ingress, explain that the
Ingress object is inert without a controller, route by host/path with a required
pathType, terminate TLS, and articulate why Ingress motivates Gateway API.
Beats: problem (a Service is L4 + in-cluster only) · dependency (Ingress inert
without a controller; IngressClass links them) · rules (host/path/mandatory
pathType) · magic-move build ingress.yaml (/ → web, /v2 → web2, + tls) ·
pain-points → Gateway API (S09, red line 5/5) · end-of-Day-1 recap of the whole
manifest family · lab handoff.
Red line: the ingress.yaml built here IS labs/day-1/08-ingress's manifest; it
routes / to the S07 `web` Service and /v2 to a second `web2` backend. Closes the
Day-1 spine Pod → Deployment → Service → Ingress. CKx: CKAD Ingress & service
exposure.
-->

---
layout: statement
kicker: The problem
---

Your Service in Lab 07 was reachable **only from inside the cluster.**

A `ClusterIP` is an L4 virtual IP — it forwards TCP to Pods, but it can't read an
HTTP request. It can't route `shop.example.com/` to one app and `/api` to another,
can't terminate **shared TLS**, and can't be reached from a browser at all. Giving
every app its own `LoadBalancer` burns one cloud IP each and still can't route by
URL. You need **one** L7 entry point in front of many Services — an **Ingress.**

<!--
Speaker: the frame is the reach ladder from S07. ClusterIP = inside only;
LoadBalancer = one external IP per service, and still L4 (no host/path). The gap
Ingress fills is L7 HTTP routing + shared TLS + one shared entry point for many
backends. Land it as "one door, many rooms." Lab 08 follows this section.
-->

---

<span class="kw-kicker">Mental model · the catch that bites everyone</span>

# An Ingress is just rules — the controller does the work

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Ingress (the object)" kind="ing">
    A set of HTTP routing <strong>rules</strong> you write: for this host and
    path, send traffic to that Service. Pure declaration — it moves no packets on
    its own.
  </KwCard>
  <KwCard heading="Ingress controller (the engine)" icon="⚙️">
    A Pod (nginx, Traefik, HAProxy, a cloud LB…) that <strong>watches</strong>
    Ingress objects and actually reverse-proxies traffic. A <strong>separate
    install</strong> — not built into Kubernetes.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

An **`IngressClass`** ties the two together: your Ingress names a class
(`ingressClassName: nginx`), and the controller that owns that class picks it up.
**No controller ⇒ your Ingress gets no address and routes nothing** — the number-one
Ingress gotcha, and the first thing to check when "the Ingress doesn't work."

</div>

<!--
Speaker: this is THE Ingress mental model and the source of most confusion. The
YAML applying cleanly means nothing — an Ingress with no matching controller sits
there with an empty ADDRESS forever, no error. Say it plainly: Kubernetes ships
the Ingress *API* but not an *implementation*; you install the controller. The
IngressClass is the matchmaker. Lab 08 Step 1 installs ingress-nginx on kind (or
uses the shared cluster's controller) — that split is the whole point.
-->

---

<span class="kw-kicker">The rules · three things every path needs</span>

# Host, path, and the `pathType` nobody remembers

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading="host" icon="🌐">
      Which hostname this rule matches — <code>shop.example.com</code>. Omit it and
      the rule matches <em>any</em> host. This is how one Ingress fronts many sites.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="path" icon="🛣️" variant="plain">
      The URL prefix — <code>/</code>, <code>/api</code>, <code>/v2</code>. The most
      specific matching path wins, so <code>/v2</code> beats the <code>/</code>
      catch-all.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="pathType" icon="⚠️" variant="warn">
      <strong>Required.</strong> <code>Prefix</code> (match this and everything
      under it), <code>Exact</code> (this string only), or
      <code>ImplementationSpecific</code> (controller decides).
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

Forget `pathType` and the API server **rejects the manifest** — it has no default.
That's the deliberate break in the lab: a missing `pathType` fails at `apply`, long
before any traffic flows.

</div>

<!--
Speaker: reveal one card per click, then the warning. pathType being mandatory (no
server-side default) trips everyone migrating from old examples that omitted it.
Prefix is what you want 95% of the time. Contrast Prefix vs Exact briefly: Prefix
matches by URL path SEGMENTS (/foo matches /foo and /foo/bar, not /foobar), Exact
matches the whole string. Don't rabbit-hole; the lab's break→fix on pathType makes
the "required" point concrete.
-->

---
layout: code-walkthrough
heading: 'Build the Ingress — route by path, then add TLS'
lab: labs/day-1/08-ingress.md
---

````md magic-move
```yaml
apiVersion: networking.k8s.io/v1   # Ingress lives in networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx          # which controller handles this
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx          # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostname
      http:
        paths:
          - path: /                # catch-all — the S07 `web` Service
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx          # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostname
      http:
        paths:
          - path: /v2              # more specific rule — wins for /v2*
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
          - path: /                # catch-all — everything else
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx
  tls:                             # terminate HTTPS for this host
    - hosts: [web.example.com]
      secretName: web-tls          # a kubernetes.io/tls Secret (cert + key)
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /v2
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```
````

<!--
Speaker: FOUR frames. (1) skeleton — note the apiVersion is networking.k8s.io/v1,
not core v1, and ingressClassName names the controller. (2) one path: / → the S07
`web` Service — the red line continues, the Ingress sits IN FRONT of Lab 07's
Service. (3) add /v2 → a second `web2` backend, placed first because most-specific
wins. THIS third frame IS labs/day-1/08-ingress's ingress.yaml, byte-for-byte —
the anchor. (4) add a tls: block terminating HTTPS with a web-tls Secret — that's
the lab's stretch goal (secretName matches). Point at backend.service.name/port:
an Ingress routes to Services, never straight to Pods.
-->

---

<span class="kw-kicker">Why there's a red line 5/5</span>

# Ingress works — but it hit a ceiling

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Annotation sprawl" icon="🏷️" variant="warn">
    Anything past host/path — rewrites, canary weights, header matches, timeouts —
    lives in <strong>controller-specific annotations</strong>. Untyped, unvalidated,
    and different for every controller.
  </KwCard>
  <KwCard heading="Not portable" icon="📦" variant="warn">
    An Ingress tuned for nginx doesn't move to Traefik or a cloud LB — the
    annotations don't carry. You rewrite per controller.
  </KwCard>
  <KwCard heading="No role separation" icon="👥" variant="plain">
    One flat object mixes what the <strong>cluster operator</strong> owns (ports,
    TLS, the load balancer) with what the <strong>app team</strong> owns (paths,
    weights). No clean boundary.
  </KwCard>
  <KwCard heading="Thin data model" icon="📉" variant="plain">
    Host + path + backend, and that's about it. Header/method matching and traffic
    splitting simply aren't in the spec.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

The fix is a typed, role-separated successor: **Gateway API** — red line **5/5**,
next up in **S09.**

</div>

<!--
Speaker: Ingress is not deprecated and is everywhere — teach it. But be honest
about the ceiling: the moment you need anything beyond host/path you fall into
per-vendor annotations, and portability + typing + role separation all break.
That's precisely the gap Gateway API (GatewayClass/Gateway/HTTPRoute) fills, and
it reuses the same routing mental model. Bridge to S09 as red line 5/5 — Day 2.
-->

---
layout: recap
heading: 'Recap — the full Day-1 spine, one manifest family'
next: 'S09 · Gateway API — the typed, role-separated successor to Ingress (red line 5/5)'
---

- An **Ingress** is L7 HTTP rules (host + path + required `pathType`) that route to
  **Services** — the north-south front door a `ClusterIP` couldn't be
- It is **inert without a controller**; `IngressClass` links them, and a missing
  controller = an Ingress with no address and no traffic (check that first)
- `ingress.yaml` routes `/` to the S07 **`web`** Service and `/v2` to a second
  backend, and can terminate **TLS** — red line 4/5
- Day 1 built one growing family: **`pod.yaml` → `deployment.yaml` → `service.yaml`
  → `ingress.yaml`** — problem, mental model, minimal YAML, run, observe, break, fix
- Ingress's annotation sprawl and missing role split **motivate Gateway API** — red
  line 5/5, Day 2

<!--
Speaker: this is the Day-1 capstone. Walk the manifest family out loud: a Pod runs
the container, a Deployment keeps N of them healthy and upgradable, a Service gives
them one stable in-cluster address, an Ingress exposes that by host/path with TLS.
Every step extended the last. Then set up Day 2: Gateway API finishes the red line,
and the rest of Day 2 layers config, storage, and running-well concerns. Hand off
to Lab 08 — it installs a controller on kind (or uses the shared one) and proves
path routing plus the pathType break.
-->

---
layout: lab
lab: labs/day-1/08-ingress.md
duration: 25 min
env: kind ✓ (controller install) · namespace ✓ (shared controller, read-only alt)
---

## Lab 08 — Route a hostname through a controller

- **kind:** recreate the cluster ingress-ready and install a controller · **shared:**
  use the provided controller + your assigned hostname
- Deploy two backends; add `ingress.yaml` routing `/` → `web`, `/v2` → `web2`
- `curl` by host and path — confirm each backend answers; read the `ADDRESS`
- **Break it:** drop `pathType` → `apply` is **rejected**; fix it and re-verify
- Stretch: terminate **TLS** with a self-signed Secret.
