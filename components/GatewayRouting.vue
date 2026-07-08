<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven Gateway API routing — the S09 routing animation.
 * Bind `:step="$clicks"`. The Service-routing story (ServiceRouting.vue) shows
 * selector → EndpointSlice → Pods; this shows the layer *above* it: the typed,
 * role-separated Gateway API stack that replaces an Ingress — infra owns the
 * Gateway (listeners, ports), the app team owns the HTTPRoute (paths, headers,
 * weights), attached by `parentRefs`.
 *
 * Pure Vue + CSS on the kw-* vocabulary (ADR 0001); every fixed `step` is a
 * meaningful static state for PDF/static export.
 *
 * step 0: the stack, at rest — Gateway ← parentRefs ← HTTPRoute → backendRefs
 *         → web / web2, with the two ownership lanes coloured.
 * step 1: GET /            → path rule matches → the `web` Service.
 * step 2: GET / + header   → the more-specific header rule wins → a weighted
 *         x-env: canary      canary split across web / web2.
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

// Which HTTPRoute rule the current request matches.
const activeRule = computed(() => {
  if (props.step === 1) return 'path'
  if (props.step >= 2) return 'canary'
  return ''
})

const request = computed(() => {
  if (props.step === 1) return { method: 'GET', path: '/', header: '' }
  if (props.step >= 2) return { method: 'GET', path: '/', header: 'x-env: canary' }
  return null
})

const backends = [
  { name: 'web', hot: (rule: string) => rule === 'path' || rule === 'canary', weight: 90 },
  { name: 'web2', hot: (rule: string) => rule === 'canary', weight: 10 },
]

const live = computed(() => props.step >= 1)
</script>

<template>
  <div class="kw-gw">
    <div class="kw-gw-flow">
      <!-- the request in flight -->
      <div class="kw-gw-req" :class="{ 'is-live': live }">
        <div class="kw-gw-req-label">request</div>
        <template v-if="request">
          <code class="kw-gw-req-line">{{ request.method }} {{ request.path }}</code>
          <code v-if="request.header" class="kw-gw-req-hdr">{{ request.header }}</code>
        </template>
        <span v-else class="kw-gw-req-idle">—</span>
      </div>

      <div class="kw-gw-arrow" :class="{ 'is-live': live }">→</div>

      <!-- infra lane: the Gateway -->
      <div class="kw-gw-node kw-gw-gateway">
        <div class="kw-gw-owner">owned by · infra / cluster-op</div>
        <div class="kw-kicker">Gateway · <code>web</code></div>
        <div class="kw-gw-listener">
          listener <code>http</code> · <code>:80</code> · <code>HTTP</code>
        </div>
        <div class="kw-gw-class">gatewayClassName <code>nginx</code></div>
      </div>

      <div class="kw-gw-arrow kw-gw-parentref">
        <span>▲ parentRefs</span>
      </div>

      <!-- app lane: the HTTPRoute -->
      <div class="kw-gw-node kw-gw-route">
        <div class="kw-gw-owner">owned by · app team</div>
        <div class="kw-kicker">HTTPRoute · <code>web</code></div>
        <div class="kw-gw-rule" :class="{ 'is-hot': activeRule === 'canary' }">
          <code>path /</code> + <code>x-env: canary</code>
          <span class="kw-gw-rule-to">→ web 90 / web2 10</span>
        </div>
        <div class="kw-gw-rule" :class="{ 'is-dim': activeRule === 'canary' }">
          <code>path /v2</code><span class="kw-gw-rule-to">→ web2</span>
        </div>
        <div class="kw-gw-rule" :class="{ 'is-hot': activeRule === 'path' }">
          <code>path /</code><span class="kw-gw-rule-to">→ web</span>
        </div>
      </div>

      <div class="kw-gw-arrow" :class="{ 'is-live': live }">→</div>

      <!-- backendRefs: the Services from S07/S08 -->
      <div class="kw-gw-backends">
        <div
          v-for="b in backends"
          :key="b.name"
          class="kw-gw-backend"
          :class="{ 'is-hot': live && b.hot(activeRule) }"
        >
          <code class="kw-gw-backend-name">{{ b.name }}</code>
          <span class="kw-gw-backend-kind">Service · :80</span>
          <span v-if="activeRule === 'canary'" class="kw-gw-backend-weight">weight {{ b.weight }}</span>
        </div>
      </div>
    </div>

    <div class="kw-gw-caption">
      <template v-if="props.step <= 0">
        Two owners, one stack: <strong>infra</strong> declares the
        <strong>Gateway</strong> (listeners, ports, TLS); the <strong>app team</strong>
        declares the <strong>HTTPRoute</strong> (paths, headers, weights) and attaches it
        with <code>parentRefs</code>. Typed fields — no controller-specific annotations.
      </template>
      <template v-else-if="props.step === 1">
        <code>GET /</code> hits the listener, matches the <code>path /</code> rule, and
        routes to the <strong>web</strong> Service — the same backend the Ingress fronted.
      </template>
      <template v-else>
        Add <code>x-env: canary</code> and a <strong>more specific</strong> rule wins:
        a <strong>typed weighted split</strong> — 90/10 across <code>web</code> and
        <code>web2</code>. That was an untyped annotation under Ingress.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-gw {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-gw-flow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.kw-gw-req {
  flex: 0 0 auto;
  width: 8.5rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.55rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  transition: border-color 0.4s ease;
}

.kw-gw-req.is-live {
  border-color: var(--kw-accent);
}

.kw-gw-req-label {
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kw-text-faint);
}

.kw-gw-req-line {
  background: none;
  padding: 0;
  font-size: 0.82rem;
  color: var(--kw-accent-bright);
}

.kw-gw-req-hdr {
  background: var(--kw-bg-soft);
  border-radius: var(--kw-radius-sm);
  padding: 0.1rem 0.35rem;
  font-size: 0.7rem;
  color: var(--kw-warn, var(--kw-accent-bright));
}

.kw-gw-req-idle {
  color: var(--kw-text-faint);
}

.kw-gw-node {
  flex: 0 0 auto;
  width: 11rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.55rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.kw-gw-gateway {
  border-color: var(--kw-accent);
}

.kw-gw-route {
  width: 13rem;
  border-color: var(--kw-ok);
}

.kw-gw-owner {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--kw-text-faint);
}

.kw-gw-listener,
.kw-gw-class {
  font-size: 0.72rem;
  color: var(--kw-text-dim);
}

.kw-gw-rule {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.7rem;
  color: var(--kw-text-dim);
  border-left: 2px solid var(--kw-border);
  padding: 0.15rem 0 0.15rem 0.4rem;
  transition: all 0.4s ease;
}

.kw-gw-rule-to {
  color: var(--kw-text-faint);
}

.kw-gw-rule.is-hot {
  border-left-color: var(--kw-accent-bright);
  color: var(--kw-accent-bright);
}

.kw-gw-rule.is-hot .kw-gw-rule-to {
  color: var(--kw-accent-bright);
}

.kw-gw-rule.is-dim {
  opacity: 0.4;
}

.kw-gw-arrow {
  font-size: 1.3rem;
  color: var(--kw-text-faint);
  transition: color 0.4s ease;
}

.kw-gw-arrow.is-live {
  color: var(--kw-accent-bright);
}

.kw-gw-parentref {
  font-size: 0.6rem;
  color: var(--kw-ok);
  writing-mode: horizontal-tb;
  text-align: center;
  width: 3.5rem;
}

.kw-gw-backends {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1 1 auto;
}

.kw-gw-backend {
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.45rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  transition: all 0.45s ease;
}

.kw-gw-backend.is-hot {
  border-color: var(--kw-accent);
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-gw-backend-name {
  background: none;
  padding: 0;
  font-size: 0.82rem;
  color: var(--kw-accent-bright);
}

.kw-gw-backend-kind {
  font-size: 0.66rem;
  color: var(--kw-text-dim);
}

.kw-gw-backend-weight {
  font-size: 0.64rem;
  color: var(--kw-ok);
}

.kw-gw-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 3rem;
}
</style>
