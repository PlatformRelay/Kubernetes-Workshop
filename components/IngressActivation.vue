<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven Ingress activation — the S08 state-transition animation.
 * Bind `:step="$clicks"`.
 *
 * New component (not a reuse): the inert → claimed → programmed controller-
 * activation transition exists in no shared component — ServiceRouting and
 * GatewayRouting both animate routing over an already-live data plane.
 *
 * Pure Vue + CSS on the kw-* vocabulary (ADR 0001); every fixed `step` is a
 * meaningful static state for PDF/static export.
 *
 * step 0: the Ingress is applied and valid — but INERT. No controller exists,
 *         nobody reads the rules: no address, no data plane, no traffic.
 * step 1: a controller (Contour) is installed; the IngressClass name is the
 *         matchmaker — the controller CLAIMS the Ingress.
 * step 2: the controller PROGRAMS its proxy (Envoy): listeners live, routes
 *         loaded — the rules finally exist somewhere packets flow.
 * step 3: two requests, routed by Host header to the right Service —
 *         web.example.com → web (v1), web2.example.com → web2 (v2).
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

const claimed = computed(() => props.step >= 1)
const programmed = computed(() => props.step >= 2)
const routing = computed(() => props.step >= 3)

const status = computed(() => {
  if (props.step >= 2) return 'programado · rotas no ar'
  if (props.step >= 1) return 'reivindicado por contour'
  return 'ADDRESS — · não roteia nada'
})

const requests = [
  { host: 'web.example.com', backend: 'web' },
  { host: 'web2.example.com', backend: 'web2' },
]

const backends = [
  { name: 'web', version: 'v1' },
  { name: 'web2', version: 'v2' },
]
</script>

<template>
  <div class="kw-ia">
    <!-- control plane: the object, the matchmaker, the controller -->
    <div class="kw-ia-row">
      <div class="kw-ia-node kw-ia-ingress" :class="{ 'is-programmed': programmed }">
        <div class="kw-ia-role">o objeto · só regras</div>
        <div class="kw-kicker">Ingress · <code>web</code></div>
        <div class="kw-ia-rule"><code>web.example.com</code><span class="kw-ia-rule-to">→ web</span></div>
        <div class="kw-ia-rule"><code>web2.example.com</code><span class="kw-ia-rule-to">→ web2</span></div>
        <div class="kw-ia-status" :class="{ 'is-ok': claimed }">{{ status }}</div>
      </div>

      <div class="kw-ia-match" :class="{ 'is-live': claimed }">
        <span class="kw-ia-match-label">IngressClass</span>
        <code>contour</code>
        <span class="kw-ia-match-verb">{{ claimed ? '⇄ reivindicado' : '⇢ sem dono' }}</span>
      </div>

      <div class="kw-ia-node kw-ia-controller" :class="{ 'is-absent': !claimed }">
        <div class="kw-ia-role">o motor · uma instalação à parte</div>
        <template v-if="claimed">
          <div class="kw-kicker">Contour · controller</div>
          <div class="kw-ia-detail">observa Ingresses com a class <code>contour</code></div>
        </template>
        <template v-else>
          <div class="kw-ia-absent-label">nenhum controller instalado</div>
          <div class="kw-ia-detail">ninguém lê essas regras</div>
        </template>
      </div>
    </div>

    <div class="kw-ia-programs" :class="{ 'is-live': programmed }">
      {{ programmed ? '▼ programa o proxy' : '▼ nada para programar' }}
    </div>

    <!-- data plane: request → proxy → Services -->
    <div class="kw-ia-row">
      <div class="kw-ia-requests">
        <template v-if="routing">
          <div v-for="r in requests" :key="r.host" class="kw-ia-req is-live">
            <code class="kw-ia-req-line">GET /</code>
            <code class="kw-ia-req-host">Host: {{ r.host }}</code>
          </div>
        </template>
        <div v-else class="kw-ia-req">
          <span class="kw-ia-req-idle">sem tráfego</span>
        </div>
      </div>

      <div class="kw-ia-arrow" :class="{ 'is-live': routing }">→</div>

      <div class="kw-ia-node kw-ia-proxy" :class="{ 'is-absent': !programmed }">
        <div class="kw-ia-role">data plane</div>
        <template v-if="programmed">
          <div class="kw-kicker">Envoy proxy</div>
          <div class="kw-ia-detail">listener <code>:80</code> / <code>:443</code> · rotas carregadas</div>
        </template>
        <template v-else>
          <div class="kw-ia-absent-label">sem data plane</div>
          <div class="kw-ia-detail">os pacotes não têm para onde ir</div>
        </template>
      </div>

      <div class="kw-ia-arrow" :class="{ 'is-live': routing }">→</div>

      <div class="kw-ia-backends">
        <div
          v-for="b in backends"
          :key="b.name"
          class="kw-ia-backend"
          :class="{ 'is-hot': routing }"
        >
          <code class="kw-ia-backend-name">{{ b.name }}</code>
          <span class="kw-ia-backend-kind">Service · :80</span>
          <span v-if="routing" class="kw-ia-backend-version">responde “workshop-web {{ b.version }}”</span>
        </div>
      </div>
    </div>

    <div class="kw-ia-caption">
      <template v-if="props.step <= 0">
        O Ingress <strong>foi aplicado sem erro</strong> — e não faz <strong>nada</strong>.
        Sem controller, não há address, nem proxy, nem tráfego. E nem erro: ele só fica
        ali parado. Essa é a pegadinha nº 1 do Ingress.
      </template>
      <template v-else-if="props.step === 1">
        Um controller é instalado e o <strong>nome da IngressClass</strong> é o casamenteiro:
        <code>ingressClassName: contour</code> casa com a class que o Contour observa, então
        o controller <strong>reivindica</strong> o Ingress.
      </template>
      <template v-else-if="props.step === 2">
        O controller <strong>programa</strong> seu proxy: o Envoy carrega os listeners e as
        regras de host. Só agora as regras existem em algum lugar por onde os pacotes passam.
      </template>
      <template v-else>
        As requisições são roteadas por <strong>Host</strong>: <code>web.example.com</code>
        cai no <strong>web</strong> (v1), <code>web2.example.com</code> no
        <strong>web2</strong> (v2) — um ponto de entrada, vários Services.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-ia {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.kw-ia-row {
  display: flex;
  align-items: stretch;
  gap: 0.6rem;
}

.kw-ia-node {
  flex: 0 0 auto;
  width: 15rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  transition: all 0.45s ease;
}

.kw-ia-ingress {
  border-color: var(--kw-accent);
}

.kw-ia-ingress.is-programmed {
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-ia-controller,
.kw-ia-proxy {
  width: 15rem;
}

.kw-ia-node.is-absent {
  border-style: dashed;
  background: transparent;
  opacity: 0.75;
}

.kw-ia-role {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--kw-text-faint);
}

.kw-ia-rule {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: var(--kw-text-dim);
  border-left: 2px solid var(--kw-border);
  padding: 0.1rem 0 0.1rem 0.4rem;
}

.kw-ia-rule-to {
  color: var(--kw-text-faint);
}

.kw-ia-status {
  font-size: 0.66rem;
  color: var(--kw-warn, var(--kw-text-faint));
  transition: color 0.4s ease;
}

.kw-ia-status.is-ok {
  color: var(--kw-ok);
}

.kw-ia-detail {
  font-size: 0.7rem;
  color: var(--kw-text-dim);
}

.kw-ia-absent-label {
  font-size: 0.78rem;
  color: var(--kw-text-faint);
  font-style: italic;
}

.kw-ia-match {
  flex: 1 1 auto;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  font-size: 0.68rem;
  color: var(--kw-text-faint);
  transition: color 0.4s ease;
}

.kw-ia-match.is-live {
  color: var(--kw-ok);
}

.kw-ia-match.is-live code {
  color: var(--kw-ok);
}

.kw-ia-match-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.6rem;
}

.kw-ia-match-verb {
  font-size: 0.64rem;
}

.kw-ia-programs {
  align-self: center;
  font-size: 0.64rem;
  color: var(--kw-text-faint);
  transition: color 0.4s ease;
}

.kw-ia-programs.is-live {
  color: var(--kw-accent-bright);
}

.kw-ia-requests {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 12rem;
  flex: 0 0 auto;
  justify-content: center;
}

.kw-ia-req {
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.35rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  transition: border-color 0.4s ease;
}

.kw-ia-req.is-live {
  border-color: var(--kw-accent);
}

.kw-ia-req-line {
  background: none;
  padding: 0;
  font-size: 0.74rem;
  color: var(--kw-accent-bright);
}

.kw-ia-req-host {
  background: var(--kw-bg-soft);
  border-radius: var(--kw-radius-sm);
  padding: 0.08rem 0.3rem;
  font-size: 0.64rem;
  color: var(--kw-text-dim);
}

.kw-ia-req-idle {
  font-size: 0.72rem;
  color: var(--kw-text-faint);
  font-style: italic;
}

.kw-ia-arrow {
  align-self: center;
  font-size: 1.2rem;
  color: var(--kw-text-faint);
  transition: color 0.4s ease;
}

.kw-ia-arrow.is-live {
  color: var(--kw-accent-bright);
}

.kw-ia-backends {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1 1 auto;
  justify-content: center;
}

.kw-ia-backend {
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.35rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  transition: all 0.45s ease;
}

.kw-ia-backend.is-hot {
  border-color: var(--kw-accent);
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-ia-backend-name {
  background: none;
  padding: 0;
  font-size: 0.78rem;
  color: var(--kw-accent-bright);
}

.kw-ia-backend-kind {
  font-size: 0.62rem;
  color: var(--kw-text-dim);
}

.kw-ia-backend-version {
  font-size: 0.62rem;
  color: var(--kw-ok);
}

.kw-ia-caption {
  font-size: 0.8rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
}
</style>
