<script setup lang="ts">
const props = defineProps<{
  /** Lab file path, e.g. "labs/day-1/03-pod.md". */
  lab: string
  duration?: string
}>()
</script>

<template>
  <div class="kw-lab-callout">
    <span class="kw-lab-callout-icon">🧪</span>
    <code>{{ props.lab }}</code>
    <span v-if="props.duration" class="kw-lab-callout-time">⏱ {{ props.duration }}</span>
  </div>
</template>

<style scoped>
.kw-lab-callout {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.75rem;
}

.kw-lab-callout code {
  background: none;
  color: var(--kw-accent-soft);
  padding: 0;
}

.kw-lab-callout-time {
  color: var(--kw-text-dim);
}
</style>
