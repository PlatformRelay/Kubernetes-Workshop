<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven "who may talk to whom" NetworkPolicy animation (S18).
 * Bind `:step="$clicks"` so it advances alongside the default-deny → allow beat.
 *
 * The state transition the section turns on: on a flat pod network every Pod can
 * reach the backend. The moment ONE NetworkPolicy selects the backend for ingress,
 * that Pod flips to default-deny — all ingress is dropped. An additive
 * `allow-frontend-to-backend` rule then opens exactly one gate: frontend → backend,
 * while `other` and `scanner` stay fenced out. The lab does exactly this — curl
 * works, default-deny makes it time out, the allow rule restores just the one caller.
 *
 * This is the "paddock fence" of the section cover: the fence goes up around the
 * backend, and only the named gate is open.
 *
 * Self-contained (K8sIcon is read-only) and every fixed `step` renders a meaningful
 * static state, so PDF/static export is faithful (ADR 0001).
 *
 * Steps map 1:1 to the companion bullets on the slide:
 * step 0: flat network — all three clients reach the backend (allow-all)
 * step 1: default-deny ingress fences the backend — every client is dropped
 *          (connections hang → time out; dropped, not refused)
 * step 2: allow-frontend-to-backend opens one gate — only `app=frontend` gets
 *          through; `other` and `scanner` stay blocked
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

const fenced = computed(() => props.step >= 1)     // backend selected by a policy
const allowRule = computed(() => props.step >= 2)  // targeted allow in place

type Lane = { app: string; allowed: boolean }
const lanes = computed<Lane[]>(() => [
  { app: 'frontend', allowed: !fenced.value || allowRule.value },
  { app: 'other', allowed: !fenced.value },
  { app: 'scanner', allowed: !fenced.value },
])

const policyLabel = computed(() => {
  if (allowRule.value) return 'allow-frontend-to-backend'
  if (fenced.value) return 'default-deny · Ingress'
  return 'no policy'
})
</script>

<template>
  <div class="kw-nf">
    <div class="kw-nf-track">
      <!-- clients -->
      <div class="kw-nf-clients">
        <div
          v-for="l in lanes"
          :key="l.app"
          class="kw-nf-client"
          :class="l.allowed ? 'is-allowed' : 'is-blocked'"
        >
          <K8sIcon kind="pod" variant="unlabeled" size="1.4rem" />
          <div class="kw-nf-podlabel">{{ l.app }}</div>
          <div class="kw-nf-verb">{{ l.allowed ? 'curl → 200' : 'curl → timeout' }}</div>
        </div>
      </div>

      <!-- the fence -->
      <div class="kw-nf-fence" :class="{ 'is-up': fenced }">
        <K8sIcon v-if="fenced" kind="netpol" variant="unlabeled" size="1.4rem" />
        <div class="kw-nf-fencelabel">{{ policyLabel }}</div>
      </div>

      <!-- backend -->
      <div class="kw-nf-backend" :class="{ 'is-fenced': fenced }">
        <K8sIcon kind="pod" variant="unlabeled" size="1.7rem" />
        <div class="kw-nf-podlabel">backend</div>
        <div class="kw-nf-select">{{ fenced ? 'podSelector: {app: backend}' : 'reachable by all' }}</div>
      </div>
    </div>

    <div v-if="props.showCaption" class="kw-nf-caption">
      <template v-if="props.step <= 0">
        Flat network: with <strong>no policy</strong>, every Pod reaches the backend —
        <code>frontend</code>, <code>other</code>, and <code>scanner</code> all get a <code>200</code>.
      </template>
      <template v-else-if="props.step === 1">
        A <code>default-deny</code> ingress policy selects the backend → <strong>all</strong> ingress
        is dropped. Every curl now <strong>hangs and times out</strong> — dropped, not refused.
      </template>
      <template v-else>
        <code>allow-frontend-to-backend</code> is <strong>additive</strong>: it opens only the
        <code>frontend</code> gate. <code>other</code> and <code>scanner</code> stay cut — allow-only.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-nf {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-nf-track {
  display: grid;
  grid-template-columns: 1fr 1.3fr 1fr;
  align-items: center;
  gap: 1.4rem;
}

.kw-nf-clients {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.kw-nf-client,
.kw-nf-backend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 0.7rem;
  border: 1.5px solid var(--kw-border);
  border-radius: 0.5rem;
  background: var(--kw-panel);
  text-align: center;
  transition: border-color 0.45s ease, opacity 0.45s ease;
}

.kw-nf-client.is-allowed {
  border-color: var(--kw-ok);
}

.kw-nf-client.is-blocked {
  border-color: var(--kw-danger);
  opacity: 0.6;
}

.kw-nf-backend.is-fenced {
  border-color: var(--kw-accent, var(--kw-border));
}

.kw-nf-podlabel {
  font-size: 0.78rem;
  font-weight: 600;
}

.kw-nf-verb {
  font-size: 0.6rem;
  color: var(--kw-text-faint);
}

.kw-nf-client.is-allowed .kw-nf-verb {
  color: var(--kw-ok);
}

.kw-nf-client.is-blocked .kw-nf-verb {
  color: var(--kw-danger);
}

.kw-nf-select {
  margin-top: 0.2rem;
  font-size: 0.58rem;
  color: var(--kw-text-faint);
}

.kw-nf-fence {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  border: 1.5px dashed transparent;
  transition: border-color 0.45s ease, background 0.45s ease;
}

.kw-nf-fence.is-up {
  border-style: solid;
  border-color: var(--kw-danger);
  background: var(--kw-bg-soft, rgba(255, 255, 255, 0.03));
}

.kw-nf-fencelabel {
  font-size: 0.64rem;
  font-weight: 600;
  color: var(--kw-text-dim);
  text-align: center;
}

.kw-nf-fence.is-up .kw-nf-fencelabel {
  color: var(--kw-danger);
}

.kw-nf-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
  text-align: center;
  max-width: 48rem;
  margin: 0 auto;
}
</style>
