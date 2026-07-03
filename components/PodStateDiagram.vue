<script setup lang="ts">
import { computed } from 'vue'
import type { PodState } from './usePodReplace'
import { NEW_TAG, OLD_TAG } from './usePodReplace'

/**
 * Click-driven cluster state, meant to sit next to a `magic-move` manifest:
 * bind `:step="$clicks"` so the diagram advances in lockstep with the code.
 * step 0: old pod Running · 1: new pod creating · 2: replaced
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

const pods = computed<PodState[]>(() => {
  const old: PodState = {
    id: 'old',
    name: 'web-6f9c-x2lqp',
    image: OLD_TAG,
    phase: props.step >= 2 ? 'Terminating' : 'Running',
  }
  const fresh: PodState = {
    id: 'new',
    name: 'web-7d4b-m8trz',
    image: NEW_TAG,
    phase: props.step >= 2 ? 'Running' : 'ContainerCreating',
  }
  if (props.step <= 0) return [old]
  if (props.step === 1) return [old, fresh]
  return [fresh]
})
</script>

<template>
  <div class="kw-state">
    <div class="kw-kicker">Cluster state</div>
    <TransitionGroup name="kw-state-pods" tag="div" class="kw-state-pods">
      <PodCard v-for="pod in pods" :key="pod.id" v-bind="pod" />
    </TransitionGroup>
    <div class="kw-state-caption">
      <template v-if="props.step <= 0">Desired = observed. Nothing to do.</template>
      <template v-else-if="props.step === 1">Spec changed → new Pod is created first.</template>
      <template v-else>New Pod ready → old Pod is terminated.</template>
    </div>
  </div>
</template>

<style scoped>
.kw-state {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.kw-state-pods {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 11rem;
  position: relative;
}

.kw-state-caption {
  font-size: 0.78rem;
  color: var(--kw-text-dim);
}

.kw-state-pods-enter-active,
.kw-state-pods-leave-active,
.kw-state-pods-move {
  transition: all 0.5s ease;
}

.kw-state-pods-enter-from {
  opacity: 0;
  transform: translateX(1.5rem);
}

.kw-state-pods-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.kw-state-pods-leave-active {
  position: absolute;
}
</style>
