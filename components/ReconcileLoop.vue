<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven reconciliation loop: observe → diff → act → repeat.
 * Bind `:step="$clicks"` so the loop advances in lockstep with the slide.
 * Controller-agnostic — reused by S21 (operators) and S22 (GitOps) by passing
 * a different `controller` / `resource` label.
 *
 * step 0: Observe (desired 3, observed 2 — a Pod was lost)
 * step 1: Diff    (desired ≠ observed → delta +1)
 * step 2: Act     (still observed 2 — creating the +1 to close the gap)
 * step 3: Repeat  (observed 3, desired = observed, keep watching)
 */
const props = withDefaults(
  defineProps<{
    step?: number
    desired?: number
    resource?: string
    controller?: string
    // Where desired/observed state is read FROM. Defaults keep the S03 built-in
    // controller framing (spec vs status); S21 passes desiredSource="Git" so the
    // same loop teaches GitOps (Git is the desired-state source) without a fork.
    desiredSource?: string
    observedSource?: string
  }>(),
  {
    step: 0,
    desired: 3,
    resource: 'Pod',
    controller: 'controller do ReplicaSet',
    desiredSource: 'spec',
    observedSource: 'status',
  },
)

const stages = ['Observar', 'Comparar', 'Agir'] as const

// A Pod is missing through Observe/Diff/Act (steps 0-2); it converges only at
// Repeat (step 3), so "Act" still shows the gap it is in the middle of closing.
const observed = computed(() => (props.step >= 3 ? props.desired : props.desired - 1))
const delta = computed(() => props.desired - observed.value)

// Which stage is lit. step 0 → Observe, 1 → Diff, 2 → Act, ≥3 → Observe again.
const active = computed(() => {
  if (props.step <= 0) return 0
  if (props.step === 1) return 1
  if (props.step === 2) return 2
  return 0
})

const converged = computed(() => props.step >= 3)
</script>

<template>
  <div class="kw-loop">
    <div class="kw-kicker">Reconciliação — {{ controller }}</div>

    <div class="kw-loop-ring">
      <template v-for="(name, i) in stages" :key="name">
        <div class="kw-loop-stage" :class="{ 'is-active': active === i && !converged }">
          <span class="kw-loop-stage-name">{{ name }}</span>
        </div>
        <span v-if="i < stages.length - 1" class="kw-loop-arrow">→</span>
      </template>
      <span class="kw-loop-repeat" :class="{ 'is-active': converged }">↻ repetir</span>
    </div>

    <div class="kw-loop-state">
      <span class="kw-loop-chip">desejado&nbsp;<strong>{{ desired }}</strong></span>
      <span class="kw-loop-chip" :class="{ 'is-sync': delta === 0, 'is-drift': delta !== 0 }">
        observado&nbsp;<strong>{{ observed }}</strong>
      </span>
      <span v-if="delta !== 0" class="kw-loop-chip is-drift">Δ&nbsp;<strong>+{{ delta }}</strong></span>
      <span v-else class="kw-loop-chip is-sync"><strong>em sincronia</strong></span>
    </div>

    <div class="kw-loop-caption">
      <template v-if="step <= 0">
        <strong>Observar</strong> — ler o desejado (<code>{{ desiredSource }}</code>) e o real (<code>{{ observedSource }}</code>). Falta 1 {{ resource }}.
      </template>
      <template v-else-if="step === 1">
        <strong>Comparar</strong> — desejado {{ desired }} ≠ observado {{ observed }}: o loop calcula um delta de +{{ delta }}.
      </template>
      <template v-else-if="step === 2">
        <strong>Agir</strong> — criar {{ delta === 0 ? 1 : delta }} {{ resource }} para fechar a diferença. Nenhum comando imperativo foi emitido.
      </template>
      <template v-else>
        <strong>Repetir</strong> — desejado = observado, então não há nada a fazer. O loop segue observando, para sempre.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-loop {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-loop-ring {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.kw-loop-stage {
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  background: var(--kw-bg-soft);
  padding: 0.45rem 1rem;
  color: var(--kw-text-dim);
  font-size: 0.9rem;
  transition: all 0.4s ease;
}

.kw-loop-stage.is-active {
  border-color: var(--kw-accent);
  color: var(--kw-accent-bright);
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-loop-stage-name {
  font-weight: 600;
}

.kw-loop-arrow {
  color: var(--kw-text-faint);
}

.kw-loop-repeat {
  margin-left: 0.4rem;
  font-size: 0.8rem;
  color: var(--kw-text-faint);
  border: 1px dashed var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.3rem 0.7rem;
  transition: all 0.4s ease;
}

.kw-loop-repeat.is-active {
  color: var(--kw-ok);
  border-color: var(--kw-ok);
  border-style: solid;
}

.kw-loop-state {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}

.kw-loop-chip {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.25rem 0.7rem;
  transition: all 0.4s ease;
}

.kw-loop-chip.is-drift {
  color: var(--kw-warn);
  border-color: var(--kw-warn);
}

.kw-loop-chip.is-sync {
  color: var(--kw-ok);
  border-color: var(--kw-ok);
}

.kw-loop-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.4rem;
}
</style>
