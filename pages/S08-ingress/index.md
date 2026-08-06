---
layout: section-cover
image: /covers/section-08-grand-gate.webp
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
Ingress object is inert without a controller, route by host with a required
pathType, terminate TLS, place the 2026 ingress-nginx retirement (frozen API,
controller choice matters, Contour is the maintained CNCF path here), and
articulate why Ingress motivates Gateway API.
Beats: problem (a Service is L4 + in-cluster only) · dependency (Ingress inert
without a controller; IngressClass links them) · rules (host/path/mandatory
pathType) · magic-move build ingress.yaml (web.example.com → web,
web2.example.com → web2, + tls) · IngressActivation animation (inert → claimed
→ programmed → routed) · retirement beat (the ONLY slide in the workshop that
names the retired controller) · pain-points → Gateway API (S09, red line 5/5)
· end-of-Day-1 recap of the whole manifest family · lab handoff.
Red line: the ingress.yaml built here IS labs/day-1/08-ingress's manifest; it
fronts the workshop-web backends — `web` (workshop-web:v1) and `web2`
(workshop-web:v2), Service port 80 → container 8080 — behind one entry point.
Closes the Day-1 spine Pod → Deployment → Service → Ingress. CKx: CKAD Ingress
& service exposure.
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
backends. Land it as "one door, many rooms." Lab 08 follows this section — it
installs Contour on kind (the shared cluster has a controller pre-provided).
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
    A Pod (Contour, Traefik, HAProxy, a cloud LB…) that <strong>watches</strong>
    Ingress objects and actually reverse-proxies traffic. A <strong>separate
    install</strong> — not built into Kubernetes.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

An **`IngressClass`** ties the two together: your Ingress names a class
(`ingressClassName: contour`), and the controller that owns that class picks it up.
**No controller ⇒ your Ingress gets no address and routes nothing** — the number-one
Ingress gotcha, and the first thing to check when "the Ingress doesn't work."

</div>

<!--
Speaker: this is THE Ingress mental model and the source of most confusion. The
YAML applying cleanly means nothing — an Ingress with no matching controller sits
there with an empty ADDRESS forever, no error. Say it plainly: Kubernetes ships
the Ingress *API* but not an *implementation*; you install the controller. The
IngressClass is the matchmaker. Lab 08 Step 1 installs Contour on kind (or uses
the shared cluster's controller) — that split is the whole point. The activation
animation two slides ahead plays this exact transition out.
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
      specific matching path wins, so <code>/api</code> beats the <code>/</code>
      catch-all. The path is forwarded <em>as-is</em> — the backend must serve it.
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
matches the whole string. Also plant the "forwarded as-is" point on the path card:
Ingress cannot rewrite a path — /v2 fan-out only works if the backend serves /v2.
The lab demo routes by HOST for exactly that reason, and the lab has a spoiler
question on it (it foreshadows the annotation pain-point). Don't rabbit-hole; the
lab's break→fix on pathType makes the "required" point concrete.
-->

---
layout: code-walkthrough
heading: 'Build the Ingress — route by host, then add TLS'
lab: labs/day-1/08-ingress.md
---

````md magic-move
```yaml
apiVersion: networking.k8s.io/v1   # Ingress lives in networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # which controller handles this
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostnames
      http:
        paths:
          - path: /                # everything on this host → the v1 backend
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # must match `kubectl get ingressclass`
  rules:
    - host: web.example.com        # shared cluster: use your assigned hostnames
      http:
        paths:
          - path: /                # everything on this host → the v1 backend
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: web2.example.com       # second site, same single entry point
      http:
        paths:
          - path: /                # → the v2 backend
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour
  tls:                             # terminate HTTPS for the first host
    - hosts: [web.example.com]
      secretName: web-tls          # a kubernetes.io/tls Secret (cert + key)
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: web2.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
```
````

<!--
Speaker: FOUR frames. (1) skeleton — note the apiVersion is networking.k8s.io/v1,
not core v1, and ingressClassName names the controller. (2) one host rule:
web.example.com → the `web` Service — the red line continues, the Ingress sits IN
FRONT of the Service pattern from Lab 07; the backend port 80 is the SERVICE port
(the Service maps it to the container's 8080). (3) add a second host →
`web2` — one entry point fronting two sites; this is host-based fan-out, and the
Host header decides. THIS third frame IS labs/day-1/08-ingress's ingress.yaml,
byte-for-byte — the anchor. (4) add a tls: block terminating HTTPS with a web-tls
Secret — that's the lab's stretch goal (secretName matches). Point at
backend.service.name/port: an Ingress routes to Services, never straight to Pods.
-->

---

<span class="kw-kicker">The payoff · from inert YAML to routed traffic</span>

# Applied ≠ working — watch the controller bring it alive

<div class="mt-2">
  <IngressActivation :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Install a controller and the **IngressClass** name matches them up — the Ingress is **claimed**.
- The controller **programs** its proxy: listeners and host rules become real data-plane config.
- Requests route by **Host**: `web.example.com` → **web** (v1), `web2.example.com` → **web2** (v2).

</v-clicks>
</div>

<!--
Speaker: this is the IngressActivation animation — the S08-specific transition no
other section has: an object that is VALID but INERT until an engine claims it.
Click through: rest state (Ingress applied, dashed empty controller slot, "routes
nothing", no data plane) → Contour installed, the IngressClass name matches, the
Ingress is claimed → Envoy programmed (listeners :80/:443, routes loaded) → two
curls routed by Host header to web (v1) and web2 (v2). Land it: kubectl accepting
your YAML proves nothing about traffic — activation is the controller's job. The
lab replays every one of these states for real, including the silent-failure
variant (an ingressClassName nobody owns).
-->

---

<span class="kw-kicker">2026 reality check · the one slide that names names</span>

# The reference controller retired — the API didn't

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="ingress-nginx: retired" icon="🪦" variant="warn">
    The reference controller most of the internet ran. Retirement announced
    <strong>Nov 2025</strong>; maintenance and CVE fixes <strong>ended March
    2026</strong>; the repo is archived. Still running it = accumulating
    unpatched CVEs at your front door.
  </KwCard>
  <KwCard heading="Ingress: frozen, not dead" kind="ing">
    The API (<code>networking.k8s.io/v1</code>) is <strong>stable and
    ubiquitous</strong> — it is not going away. But it is <strong>frozen</strong>:
    no new features. New routing capability lands in Gateway API instead.
  </KwCard>
  <KwCard heading="Controller choice now matters" icon="⚙️">
    The controller is swappable by design — that's what <code>IngressClass</code>
    is for. This workshop uses <strong>Contour</strong>: CNCF, Envoy-based,
    maintained, vendor-neutral. Traefik, HAProxy, and cloud LBs are fine too.
  </KwCard>
  <KwCard heading="The exit is mechanical" icon="🌉" variant="plain">
    <code>ingress2gateway</code> (kubernetes-sigs) converts Ingress resources into
    Gateway API resources. Your rules survive the migration — the lab's stretch
    goal previews it.
  </KwCard>
</div>

<!--
Speaker: the ONLY place in the workshop that names nginx — keep it that way.
Story in one breath: for a decade "Ingress" effectively meant ingress-nginx; the
project announced retirement in November 2025, best-effort maintenance ended in
March 2026, and the repo was archived — no more CVE fixes for the thing
terminating TLS at the edge of thousands of clusters. Two lessons, carefully
separated: (1) the Ingress API is fine — frozen at v1, stable, everywhere in the
wild, you WILL meet it; (2) the controller behind it is a choice you now have to
make consciously. We teach on Contour because it's CNCF, Envoy-based, and
maintained. And the bridge out is mechanical: kubernetes-sigs/ingress2gateway
translates Ingress → Gateway + HTTPRoute — which is exactly where S09 goes.
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
    An Ingress tuned for one controller's annotation dialect doesn't move to the
    next — the annotations don't carry. Every controller swap is a rewrite.
  </KwCard>
  <KwCard heading="No role separation" icon="👥" variant="plain">
    One flat object mixes what the <strong>cluster operator</strong> owns (ports,
    TLS, the load balancer) with what the <strong>app team</strong> owns (paths,
    weights). No clean boundary.
  </KwCard>
  <KwCard heading="Thin data model" icon="📉" variant="plain">
    Host + path + backend, and that's about it. Header/method matching, traffic
    splitting, and path rewrites simply aren't in the spec.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

The fix is a typed, role-separated successor: **Gateway API** — red line **5/5**,
next up.

</div>

<!--
Speaker: Ingress is frozen but everywhere — teach it. Be honest about the ceiling:
the moment you need anything beyond host/path you fall into per-vendor
annotations, and portability + typing + role separation all break. The retirement
sharpened this: annotation dialects die with their controller. Even our lab felt
the thin data model — we route by host because the spec has no typed way to
rewrite a path. That's precisely the gap Gateway API (GatewayClass/Gateway/
HTTPRoute) fills, and it reuses the same routing mental model. Bridge to S09 as
red line 5/5 — Day 2, taught on Envoy Gateway (class `eg`); ingress2gateway
carries your Ingress rules over.
-->

---
layout: recap
heading: 'Recap — the full Day-1 spine, one manifest family'
next: 'Gateway API — the typed, role-separated successor to Ingress (red line 5/5)'
---

- An **Ingress** is L7 HTTP rules (host + path + required `pathType`) that route to
  **Services** — the north-south front door a `ClusterIP` couldn't be
- It is **inert without a controller**; `IngressClass` links them, and a missing
  controller = an Ingress with no address and no traffic (check that first)
- `ingress.yaml` fronts two sites on one entry point — `web.example.com` → **`web`**
  (v1), `web2.example.com` → **`web2`** (v2) — and can terminate **TLS** — red line 4/5
- The API is **frozen** and the retired reference controller made **controller choice
  real** — we run **Contour** (CNCF, maintained); `ingress2gateway` bridges forward
- Day 1 built one growing family: **`pod.yaml` → `deployment.yaml` → `service.yaml`
  → `ingress.yaml`** — problem, mental model, minimal YAML, run, observe, break, fix

<!--
Speaker: this is the Day-1 capstone. Walk the manifest family out loud: a Pod runs
the container, a Deployment keeps N of them healthy and upgradable, a Service gives
them one stable in-cluster address, an Ingress exposes that by host with TLS.
Every step extended the last. Then set up Day 2: Gateway API finishes the red line
(same web/web2 backends, typed routing, Envoy Gateway), and the rest of Day 2
layers config, storage, and running-well concerns. Hand off to Lab 08 — it
installs Contour on kind (or uses the shared controller), creates the
IngressClass, and proves host routing plus the loud pathType break and the silent
wrong-class break.
-->

---
layout: lab
lab: labs/day-1/08-ingress.md
duration: 25 min
env: kind ✓ (controller install) · namespace ✓ (shared controller)
---

## Lab 08 — Route two hostnames through a controller

- **kind:** install **Contour** (pinned quickstart) and create the `contour`
  **IngressClass** · **shared:** use the provided controller + your assigned hostnames
- Deploy two backends — `web` (**workshop-web:v1**) and `web2` (**v2**), Service
  port 80 → container 8080; add `ingress.yaml` routing one host to each
- `curl` with a `Host:` header — the response body **names the version** that answered
- **Break it twice:** drop `pathType` → `apply` **rejected** (loud); point
  `ingressClassName` at a class nobody owns → **silent** 404; fix both
- Stretch: terminate **TLS** with a self-signed Secret · preview `ingress2gateway`.
