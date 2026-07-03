<script setup lang="ts">
const props = defineProps<{
  /** Lab file path, e.g. "labs/day-1/03-pod.md". */
  lab?: string
  /** Rough duration, e.g. "25 min". */
  duration?: string
  /** Supported environments, e.g. "namespace + kind" or "kind-only". */
  env?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-lab">
    <div class="kw-lab-window kw-panel">
      <div class="kw-lab-titlebar">
        <span class="kw-lab-dot" style="background: #f85149" />
        <span class="kw-lab-dot" style="background: #d29922" />
        <span class="kw-lab-dot" style="background: #3fb950" />
        <code v-if="props.lab" class="kw-lab-path">{{ props.lab }}</code>
        <div class="kw-lab-chips">
          <span v-if="props.env" class="kw-lab-chip">{{ props.env }}</span>
          <span v-if="props.duration" class="kw-lab-chip">⏱ {{ props.duration }}</span>
        </div>
      </div>
      <div class="kw-lab-body">
        <div class="kw-kicker" style="margin-bottom: 0.5rem">Hands-on lab</div>
        <slot />
      </div>
      <div class="kw-lab-footer">
        Every task has a spoiler — if you get stuck, open it and keep moving.
      </div>
    </div>
  </div>
</template>

<style scoped>
.kw-lab {
  display: flex;
  align-items: center;
  justify-content: center;
}

.kw-lab-window {
  width: 100%;
  max-width: 46rem;
  overflow: hidden;
}

.kw-lab-titlebar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.9rem;
  background: var(--kw-bg-soft);
  border-bottom: 1px solid var(--kw-border);
}

.kw-lab-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
}

.kw-lab-path {
  margin-left: 0.6rem;
  font-size: 0.75rem;
  color: var(--kw-text-dim);
  background: none;
}

.kw-lab-chips {
  margin-left: auto;
  display: flex;
  gap: 0.4rem;
}

.kw-lab-chip {
  font-size: 0.65rem;
  color: var(--kw-text-dim);
  border: 1px solid var(--kw-border);
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
}

.kw-lab-body {
  padding: 1.2rem 1.5rem;
}

.kw-lab-body :deep(h1),
.kw-lab-body :deep(h2) {
  font-size: 1.35rem;
  margin: 0 0 0.5rem;
}

.kw-lab-body :deep(ul) {
  color: var(--kw-text-dim);
}

.kw-lab-footer {
  padding: 0.6rem 1.5rem;
  border-top: 1px solid var(--kw-border);
  font-size: 0.75rem;
  color: var(--kw-text-dim);
}
</style>
