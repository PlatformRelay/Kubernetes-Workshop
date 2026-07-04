<script setup lang="ts">
const props = defineProps<{
  heading?: string
  /** Panel titles, e.g. "Ingress" / "Gateway API". */
  leftHeading?: string
  rightHeading?: string
  /** Small chips next to the panel titles, e.g. "today" / "successor". */
  leftBadge?: string
  rightBadge?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-comparison">
    <header class="kw-cmp-header">
      <h1 v-if="props.heading">{{ props.heading }}</h1>
      <slot name="title" />
    </header>

    <div class="kw-cmp-cols">
      <section class="kw-cmp-panel">
        <header class="kw-cmp-panel-head">
          <h2>{{ props.leftHeading }}</h2>
          <span v-if="props.leftBadge" class="kw-cmp-badge">{{ props.leftBadge }}</span>
        </header>
        <div class="kw-cmp-panel-body">
          <slot />
        </div>
      </section>

      <section class="kw-cmp-panel">
        <header class="kw-cmp-panel-head">
          <h2>{{ props.rightHeading }}</h2>
          <span v-if="props.rightBadge" class="kw-cmp-badge">{{ props.rightBadge }}</span>
        </header>
        <div class="kw-cmp-panel-body">
          <slot name="right" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kw-comparison {
  display: flex;
  flex-direction: column;
}

.kw-cmp-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.7rem;
}

.kw-cmp-cols {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;
  min-height: 0;
  align-items: stretch;
}

.kw-cmp-panel {
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.kw-cmp-panel-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-bottom: 1px solid var(--kw-border-soft);
  padding-bottom: 0.5rem;
  margin-bottom: 0.7rem;
}

.kw-cmp-panel-head h2 {
  font-size: 1.02rem;
  margin: 0;
}

.kw-cmp-badge {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kw-text-dim);
  border: 1px solid var(--kw-border);
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
}

.kw-cmp-panel-body {
  flex: 1;
  min-height: 0;
  font-size: 0.88rem;
}

.kw-cmp-panel-body :deep(pre.slidev-code) {
  font-size: 0.78em;
  line-height: 1.45;
  background: var(--kw-bg-soft) !important;
}
</style>
