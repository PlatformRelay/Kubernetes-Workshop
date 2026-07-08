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
 * step 2: Act     (create 1 → observed 3)
 * step 3: Repeat  (desired = observed, keep watching)
 */
const props = withDefaults(
  defineProps<{
    step?: number
    desired?: number
    resource?: string
    controller?: string
  }>(),
  { step: 0, desired: 3, resource: 'Pod', controller: 'ReplicaSet controller' },
)

const stages = ['Observe', 'Diff', 'Act'] as const

// step 0 and 1 see one Pod missing; from step 2 on the world is converged.
const observed = computed(() => (props.step >= 2 ? props.desired : props.desired - 1))
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
    <div class="kw-kicker">Reconciliation — {{ controller }}</div>

    <div class="kw-loop-ring">
      <template v-for="(name, i) in stages" :key="name">
        <div class="kw-loop-stage" :class="{ 'is-active': active === i && !converged }">
          <span class="kw-loop-stage-name">{{ name }}</span>
        </div>
        <span v-if="i < stages.length - 1" class="kw-loop-arrow">→</span>
      </template>
      <span class="kw-loop-repeat" :class="{ 'is-active': converged }">↻ repeat</span>
    </div>

    <div class="kw-loop-state">
      <span class="kw-loop-chip">desired&nbsp;<strong>{{ desired }}</strong></span>
      <span class="kw-loop-chip" :class="{ 'is-sync': delta === 0, 'is-drift': delta !== 0 }">
        observed&nbsp;<strong>{{ observed }}</strong>
      </span>
      <span v-if="delta !== 0" class="kw-loop-chip is-drift">Δ&nbsp;<strong>+{{ delta }}</strong></span>
      <span v-else class="kw-loop-chip is-sync"><strong>in sync</strong></span>
    </div>

    <div class="kw-loop-caption">
      <template v-if="step <= 0">
        <strong>Observe</strong> — read desired (<code>spec</code>) and actual (<code>status</code>). A {{ resource }} was lost.
      </template>
      <template v-else-if="step === 1">
        <strong>Diff</strong> — desired {{ desired }} ≠ observed {{ observed }}: the loop computes a delta of +{{ delta }}.
      </template>
      <template v-else-if="step === 2">
        <strong>Act</strong> — create {{ delta === 0 ? 'the missing' : delta }} {{ resource }} to close the gap. No imperative command was issued.
      </template>
      <template v-else>
        <strong>Repeat</strong> — desired = observed, so there is nothing to do. The loop keeps watching, forever.
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
