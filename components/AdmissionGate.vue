<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven "Pod Security Admission gate" animation (S17).
 * Bind `:step="$clicks"` so it advances alongside the admission beat.
 *
 * The state transition the section turns on: a Pod's create request hits the
 * API server, PSA checks it against the namespace's `enforce: restricted`
 * label, and the request is either DENIED (never persisted) or ADMITTED. The
 * lab does exactly this — a bare insecure Pod is rejected, then hardened field
 * by field until the same gate admits it.
 *
 * The checklist rows are the FOUR fields `restricted` actually gates (nothing
 * else — readOnlyRootFilesystem is deliberately NOT here; it's beyond-restricted
 * hardening, a later slide). PSA is built-in admission, not an external webhook.
 *
 * Self-contained (K8sIcon is read-only) and every fixed `step` renders a
 * meaningful static state, so PDF/static export is faithful (ADR 0001).
 *
 * Steps map 1:1 to the companion bullets on the slide:
 * step 0: an insecure Pod request travels toward the gate (root, no context)
 * step 1: PSA evaluates — all four checks FAIL → verdict DENIED, request bounced
 *          (Forbidden; the Pod is never created)
 * step 2: the hardened Pod request travels toward the gate (four gates set)
 * step 3: PSA evaluates — all four checks PASS → verdict ADMITTED, Pod enters
 *          the namespace
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

// Which Pod is in flight, and whether the gate has ruled on it yet.
const hardened = computed(() => props.step >= 2)
const ruled = computed(() => props.step === 1 || props.step >= 3)
const denied = computed(() => props.step === 1)
const admitted = computed(() => props.step >= 3)

// The four fields `restricted` gates. `pass` is null until the gate rules.
const checks = computed(() => {
  const p = ruled.value ? hardened.value : null
  return [
    { field: 'runAsNonRoot: true', pass: p },
    { field: 'allowPrivilegeEscalation: false', pass: p },
    { field: 'capabilities.drop: ["ALL"]', pass: p },
    { field: 'seccompProfile: RuntimeDefault', pass: p },
  ]
})

// Pod token position: left of the gate until admitted, through it once admitted;
// on denial it recoils to the far left.
const podLane = computed(() => {
  if (denied.value) return 'is-denied'
  if (admitted.value) return 'is-admitted'
  return 'is-approaching'
})

const verdict = computed(() => {
  if (denied.value) return { label: 'DENIED · Forbidden', tone: 'danger' as const }
  if (admitted.value) return { label: 'ADMITTED', tone: 'ok' as const }
  return { label: 'evaluating…', tone: 'dim' as const }
})
</script>

<template>
  <div class="kw-ag">
    <div class="kw-ag-track">
      <!-- source: kubectl apply -->
      <div class="kw-ag-source">
        <div class="kw-kicker">kubectl apply</div>
        <div class="kw-ag-pod" :class="[podLane, hardened ? 'is-hard' : 'is-soft']">
          <K8sIcon kind="pod" variant="unlabeled" size="1.7rem" />
          <div class="kw-ag-podlabel">{{ hardened ? 'hardened Pod' : 'insecure Pod' }}</div>
          <div class="kw-ag-podnote">{{ hardened ? '4 gates set' : 'root · no securityContext' }}</div>
        </div>
      </div>

      <!-- the PSA gate -->
      <div class="kw-ag-gate" :class="`is-${verdict.tone}`">
        <div class="kw-ag-gatehead">
          <div class="kw-ag-gatetitle">Pod Security Admission</div>
          <div class="kw-kicker">enforce: restricted · built-in</div>
        </div>
        <ul class="kw-ag-checks">
          <li v-for="c in checks" :key="c.field" :class="{ 'is-pass': c.pass === true, 'is-fail': c.pass === false }">
            <span class="kw-ag-mark">{{ c.pass === true ? '✓' : c.pass === false ? '✗' : '·' }}</span>
            <code>{{ c.field }}</code>
          </li>
        </ul>
        <div class="kw-ag-verdict" :class="`is-${verdict.tone}`">{{ verdict.label }}</div>
      </div>

      <!-- target: the namespace -->
      <div class="kw-ag-target" :class="{ 'is-live': admitted }">
        <K8sIcon kind="ns" variant="unlabeled" size="1.7rem" />
        <div class="kw-ag-nslabel">your namespace</div>
        <div v-if="admitted" class="kw-ag-running">
          <K8sIcon kind="pod" variant="unlabeled" size="1.3rem" />
          <span>Running</span>
        </div>
        <div v-else class="kw-ag-empty">— empty —</div>
      </div>
    </div>

    <div v-if="props.showCaption" class="kw-ag-caption">
      <template v-if="props.step <= 0">
        A bare Pod with no <code>securityContext</code> is submitted to a namespace labelled
        <code>enforce: restricted</code>.
      </template>
      <template v-else-if="props.step === 1">
        PSA checks the Pod against the standard <strong>before it is stored</strong> — all four
        gates fail, so the request is <strong>rejected (Forbidden)</strong> and
        <strong>no Pod is ever created</strong>.
      </template>
      <template v-else-if="props.step === 2">
        Set the four fields <code>restricted</code> requires and re-apply the <em>same</em> Pod.
      </template>
      <template v-else>
        Every gate passes → the Pod is <strong>admitted</strong> and scheduled. Same gate, same
        namespace — the manifest changed, not the policy.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-ag {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-ag-track {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  align-items: stretch;
  gap: 1.4rem;
}

/* source + target columns */
.kw-ag-source,
.kw-ag-target {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.8rem;
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  background: var(--kw-panel);
  text-align: center;
}

.kw-ag-target.is-live {
  border-color: var(--kw-ok);
}

.kw-ag-pod {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.55rem 0.7rem;
  border: 1.5px solid var(--kw-border);
  border-radius: 0.5rem;
  background: var(--kw-bg-soft, rgba(255, 255, 255, 0.03));
  transition: transform 0.5s ease, border-color 0.45s ease, opacity 0.45s ease;
}

.kw-ag-pod.is-soft {
  border-color: var(--kw-danger);
}

.kw-ag-pod.is-hard {
  border-color: var(--kw-ok);
}

.kw-ag-pod.is-approaching {
  transform: translateX(0.6rem);
}

.kw-ag-pod.is-denied {
  transform: translateX(-0.5rem);
  opacity: 0.55;
}

.kw-ag-pod.is-admitted {
  opacity: 0.25;
}

.kw-ag-podlabel {
  font-size: 0.78rem;
  font-weight: 600;
}

.kw-ag-podnote {
  font-size: 0.6rem;
  color: var(--kw-text-faint);
}

/* the gate */
.kw-ag-gate {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 2px solid var(--kw-border);
  border-radius: var(--kw-radius);
  background: var(--kw-panel);
  transition: border-color 0.45s ease;
}

.kw-ag-gate.is-danger {
  border-color: var(--kw-danger);
}

.kw-ag-gate.is-ok {
  border-color: var(--kw-ok);
}

.kw-ag-gatetitle {
  font-size: 0.82rem;
  font-weight: 700;
}

.kw-ag-checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.kw-ag-checks li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.7rem;
  color: var(--kw-text-dim);
  transition: color 0.4s ease;
}

.kw-ag-checks li code {
  font-size: 0.68rem;
}

.kw-ag-checks li.is-pass {
  color: var(--kw-ok);
}

.kw-ag-checks li.is-fail {
  color: var(--kw-danger);
}

.kw-ag-mark {
  display: inline-flex;
  width: 1rem;
  justify-content: center;
  font-weight: 700;
}

.kw-ag-verdict {
  margin-top: 0.15rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.kw-ag-verdict.is-danger {
  color: var(--kw-danger);
}

.kw-ag-verdict.is-ok {
  color: var(--kw-ok);
}

.kw-ag-verdict.is-dim {
  color: var(--kw-text-faint);
}

.kw-ag-nslabel {
  font-size: 0.78rem;
  font-weight: 600;
}

.kw-ag-running {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--kw-ok);
  font-weight: 600;
}

.kw-ag-empty {
  font-size: 0.68rem;
  color: var(--kw-text-faint);
}

.kw-ag-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
  text-align: center;
  max-width: 48rem;
  margin: 0 auto;
}
</style>
