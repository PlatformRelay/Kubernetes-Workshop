<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    heading?: string
    /** Kicker above the heading. */
    kicker?: string
    /** Number of card columns for the agenda list. */
    columns?: number | string
  }>(),
  { kicker: 'Agenda', columns: 2 },
)
</script>

<template>
  <div class="slidev-layout kw-agenda">
    <header class="kw-agenda-header">
      <span class="kw-kicker">{{ props.kicker }}</span>
      <h1>{{ props.heading ?? 'Agenda' }}</h1>
    </header>

    <div
      class="kw-agenda-body"
      :style="{ '--kw-agenda-cols': String(props.columns) }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.kw-agenda {
  display: flex;
  flex-direction: column;
}

.kw-agenda-header h1 {
  font-size: 1.6rem;
  margin: 0.3rem 0 0.9rem;
}

.kw-agenda-body {
  flex: 1;
  min-height: 0;
}

/* A plain markdown list becomes a numbered card grid. */
.kw-agenda-body :deep(ul) {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(var(--kw-agenda-cols, 2), minmax(0, 1fr));
  gap: 0.55rem 0.9rem;
  counter-reset: kw-agenda;
}

.kw-agenda-body :deep(ul > li) {
  counter-increment: kw-agenda;
  position: relative;
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.55rem 0.8rem 0.55rem 2.6rem;
  font-size: 0.88rem;
  line-height: 1.4;
}

.kw-agenda-body :deep(ul > li)::before {
  content: counter(kw-agenda, decimal-leading-zero);
  position: absolute;
  left: 0.8rem;
  top: 0.72rem;
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--kw-accent-bright);
}

.kw-agenda-body :deep(li em) {
  font-style: normal;
  color: var(--kw-text-dim);
  font-size: 0.82em;
}

/* Optional day sub-headers between lists. */
.kw-agenda-body :deep(h2) {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--kw-text-dim);
  margin: 1rem 0 0.5rem;
}
</style>
