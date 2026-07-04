<script setup lang="ts">
const props = defineProps<{
  heading?: string
  /** Leading emoji or short glyph, e.g. "📦". */
  icon?: string
  /** accent (default) · ok · warn · danger · plain */
  variant?: 'accent' | 'ok' | 'warn' | 'danger' | 'plain'
}>()
</script>

<!-- Concept card for grids: icon + heading + short body. -->
<template>
  <div class="kw-card" :class="`kw-card--${props.variant ?? 'accent'}`">
    <div v-if="props.icon || props.heading" class="kw-card-head">
      <span v-if="props.icon" class="kw-card-icon">{{ props.icon }}</span>
      <span v-if="props.heading" class="kw-card-heading">{{ props.heading }}</span>
    </div>
    <div class="kw-card-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.kw-card {
  --kw-card-color: var(--kw-accent);
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-top: 3px solid var(--kw-card-color);
  border-radius: var(--kw-radius-sm);
  padding: 0.7rem 0.9rem;
  min-width: 0;
}

.kw-card--ok {
  --kw-card-color: var(--kw-ok);
}

.kw-card--warn {
  --kw-card-color: var(--kw-warn);
}

.kw-card--danger {
  --kw-card-color: var(--kw-danger);
}

.kw-card--plain {
  --kw-card-color: var(--kw-border);
}

.kw-card-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.3rem;
}

.kw-card-icon {
  font-size: 0.95rem;
  line-height: 1;
}

.kw-card-heading {
  font-weight: 650;
  font-size: 0.88rem;
}

.kw-card-body {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
}

.kw-card-body :deep(p) {
  margin: 0;
}

.kw-card-body :deep(strong) {
  color: var(--kw-text);
}
</style>
