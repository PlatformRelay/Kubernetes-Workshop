<script setup lang="ts">
export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'Terminating'

const props = defineProps<{
  name: string
  image: string
  phase: PodPhase
}>()

const phaseColor: Record<PodPhase, string> = {
  Pending: 'var(--kw-text-dim)',
  ContainerCreating: 'var(--kw-warn)',
  Running: 'var(--kw-ok)',
  Terminating: 'var(--kw-danger)',
}
</script>

<template>
  <div class="kw-pod" :style="{ borderColor: phaseColor[props.phase] }">
    <div class="kw-pod-head">
      <img src="/icons/kubernetes-icon-white.svg" alt="" class="kw-pod-logo" />
      <code class="kw-pod-name">{{ props.name }}</code>
    </div>
    <code class="kw-pod-image">{{ props.image }}</code>
    <div class="kw-pod-phase" :style="{ color: phaseColor[props.phase] }">
      <span
        class="kw-pod-dot"
        :class="{ 'kw-pod-dot-pulse': props.phase === 'ContainerCreating' }"
        :style="{ background: phaseColor[props.phase] }"
      />
      {{ props.phase }}
    </div>
  </div>
</template>

<style scoped>
.kw-pod {
  width: 11.5rem;
  background: var(--kw-panel);
  border: 1.5px solid;
  border-radius: var(--kw-radius);
  padding: 0.7rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.kw-pod-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.kw-pod-logo {
  height: 1rem;
}

.kw-pod-name {
  background: none;
  padding: 0;
  font-size: 0.75rem;
  color: var(--kw-text);
}

.kw-pod-image {
  background: none;
  padding: 0;
  font-size: 0.7rem;
  color: var(--kw-text-dim);
}

.kw-pod-phase {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.kw-pod-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.kw-pod-dot-pulse {
  animation: kw-pulse 1s ease-in-out infinite;
}

@keyframes kw-pulse {
  50% {
    opacity: 0.3;
  }
}
</style>
