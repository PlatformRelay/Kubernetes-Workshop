---
layout: section-cover
day: Day 1
section: '04'
tier: core
track: Foundations
---

# kubectl

The one tool you drive every cluster with — discover, inspect, and change.

**core** · suggested Day 1 · Foundations track

<!--
Section S04 — kubectl. Timing: ~25 min slides + 25 min lab.
Outcome: learners can drive and inspect any cluster fluently — the core verbs,
output modes (incl. jsonpath), client-vs-server dry-run, and labels/selectors as
a query language — building the "explain habit" from S03.
Beats: imperative one-off vs declarative apply · verb tour · output modes with a
jsonpath example (magic-move growing one command) · dry-run client vs server ·
labels & selectors · namespaces/contexts back to Lab 00.
CKx tie-in: CKAD/CKA — core kubectl workflow across every domain.
Lab: labs/day-1/04-kubectl.md.
-->

---
layout: comparison
heading: 'Two ways to drive — and when each fits'
leftHeading: Imperative
rightHeading: Declarative
leftBadge: 'kubectl run / create / scale'
rightBadge: 'kubectl apply -f'
---

- One-off commands that act **now**: `run`, `create`, `scale`, `delete`.
- Fast for **exploring**, demos, and generating a starting manifest.
- Nothing records *what you wanted* — only the cluster remembers.
- Repeat a change? You retype it, and hope you match last time.

::right::

- You keep the desired state in **files** and `apply` them.
- The file is the source of truth — **version it, review it, re-apply it**.
- Re-running `apply` is safe and converges to the same result (idempotent).
- This is how every real workload ships — and what S05 onward builds.

<div class="mt-4 text-sm" v-click>

Use imperative to **learn and scaffold** (`--dry-run=client -o yaml` prints the
manifest); use declarative to **run and keep** it. Today's labs generate YAML
imperatively, then `apply` it.

</div>

<!--
Speaker: don't moralise "declarative good, imperative bad" — imperative is the
fastest way to produce a first manifest. The bridge is `--dry-run=client -o yaml`,
which the output slide and the lab both lean on. Ties straight into S05's pod.yaml.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Eight verbs cover almost everything</span>

# The core verb tour

<div class="kw-cols-3 mt-3">
  <v-click at="1">
    <KwCard heading="Read" icon="🔍">
      <strong>get</strong> · <strong>describe</strong> · <strong>explain</strong> —
      list, deep-dive with Events, and read the schema.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Change" icon="✏️">
      <strong>apply</strong> · <strong>diff</strong> · <strong>edit</strong> —
      declare, preview, or patch live objects.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Run &amp; debug" icon="🐚" variant="plain">
      <strong>logs</strong> · <strong>exec</strong> · <strong>port-forward</strong> —
      output, shell in, and tunnel when you need them.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: keep to one line per verb. The pairing to land: get→describe→logs is the
triage sequence; apply→diff is the safe-change sequence. `exec` returns in every
lab that inspects a running container.
-->

---

<span class="kw-kicker">Story · walk the verbs in order</span>

# See the command, then the payoff

<div class="mt-2">
  <KubectlVerbDemo :step="$clicks" />
</div>

<!--
Speaker: click through the on-call chain. Each step shows a realistic command and
the snippet of output that actually answers the question — not a feature tour.
Land the habit: get for the headline, describe for Events, logs for app truth,
diff before apply when changing files.
-->

---
layout: code-walkthrough
heading: 'Output modes — grow one command to get exactly what you need'
lab: labs/day-1/04-kubectl.md
---

````md magic-move
```bash
# default: a human table
kubectl get pods
```

```bash
# -o wide: same table, more columns (node, IP)
kubectl get pods -o wide
```

```bash
# -o yaml: the full object as the API server stores it
kubectl get pods -o yaml
```

```bash
# -o jsonpath: extract exactly one field, script-friendly
kubectl get pods -o jsonpath='{.items[*].spec.nodeName}'
```

```bash
# the same query, one node's name — no grep/awk needed
kubectl get nodes -o jsonpath='{.items[0].metadata.name}'
```
````

<div class="mt-4 text-sm" v-click>

`-o json` is the same as `yaml` for tools that want JSON. **`jsonpath`** turns
`kubectl` into a precise data source — the lab uses it to pull a single value.

</div>

<!--
Speaker: build it up — table for eyes, yaml for the whole truth, jsonpath for one
value. The jsonpath path mirrors the object tree they saw with `explain` in S03
(`.spec.nodeName`). `-o wide` is the cheapest habit: always more context for free.
-->

---
layout: code-annotated
heading: '`--dry-run` — render, or validate, without changing anything'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl apply -f pod.yaml --dry-run=client
kubectl apply -f pod.yaml --dry-run=server
kubectl apply -f pod.yaml
```

::notes::

<CodeNote at="1" label="--dry-run=client">
Renders and does <strong>local</strong> checks only — never contacts the API
server's admission or validation. Great for <em>generating YAML</em>
(<code>-o yaml</code>) and quick sanity checks. It can't know anything only the
<strong>server</strong> knows — like whether the target namespace even exists.
</CodeNote>

<CodeNote at="2" label="--dry-run=server" variant="ok">
Sends the object through the <strong>full server path</strong> — schema
validation, defaulting, and <strong>admission</strong> — then discards it instead
of persisting. This catches what client can't: quota, webhooks, missing
references. Same output shape, real validation.
</CodeNote>

<CodeNote at="3" label="no flag" variant="warn">
The real apply — validates <em>and</em> writes to etcd. The lab's break shows an
object that <strong>passes client but fails server</strong>, so you feel the
difference before it bites you for real.
</CodeNote>

<!--
Speaker: the one-liner — client = "does this render", server = "would the cluster
actually accept this". The lab makes it concrete: apply into a nonexistent
namespace passes client dry-run and fails server dry-run.
-->

---
layout: code-annotated
heading: 'Labels & selectors — kubectl has a query language'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl get pods -l app=web
kubectl get pods -l 'env in (staging, prod)'
kubectl get pods -l app=web,tier=frontend
```

::notes::

<CodeNote at="1" label="equality">
<code>-l key=value</code> — the everyday filter. Selects objects carrying that
exact label. This is how a Service finds its Pods (S07) and how every lab's
cleanup scopes a delete.
</CodeNote>

<CodeNote at="2" label="set-based">
<code>in (…)</code>, <code>notin (…)</code>, and bare <code>key</code> /
<code>!key</code> for existence. More expressive when one value isn't enough.
</CodeNote>

<CodeNote at="3" label="AND-ed" variant="ok">
Comma-separate to require <strong>all</strong> of them. Labels aren't decoration —
they're the join key the whole system selects on. Set them deliberately.
</CodeNote>

<!--
Speaker: frame labels as a query language, not metadata. Foreshadow S06 (a
Deployment's selector) and S07 (a Service's selector) — both are label queries.
The recommended `app.kubernetes.io/*` labels show up in S06.
-->

---
layout: statement
kicker: 'Where am I, and the habit that saves you'
---

You are always pointed at **one context** and **one namespace** — the pair you
set back in **Lab 00**.

<div class="mt-6 text-base kw-muted">

```bash
kubectl config current-context                 # which cluster?
kubectl config view --minify | grep namespace: # which namespace?
kubectl config set-context --current --namespace=<ns>
```

</div>

<div class="mt-6" v-click>

When anything surprises you: **`kubectl explain <field>`** and
**`kubectl get … -o yaml`**. The cluster documents itself — reach for it before a
web search. That's the habit the rest of the workshop assumes.

</div>

<!--
Speaker: close the loop to Lab 00 — most "it's not working" moments are a wrong
context/namespace. Then re-plant the explain habit from S03. The lab is a
scavenger hunt that forces get/describe/explain before anyone creates a thing.
-->

---
layout: lab
lab: labs/day-1/04-kubectl.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 04 — Discovery scavenger hunt

- **Inspect only:** answer questions with `get`, `describe`, `explain` — create nothing
- **Generate YAML:** `kubectl run … --dry-run=client -o yaml` and `create deployment … --dry-run=client -o yaml`
- **Query:** pull one node's name with `-o jsonpath`; filter with `-l`
- **Break it on purpose:** an object that **passes `--dry-run=client` but fails `--dry-run=server`**
- **Nothing applied** — generated YAML is local and deletable
