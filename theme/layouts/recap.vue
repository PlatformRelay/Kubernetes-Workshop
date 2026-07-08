<script setup lang="ts">
const props = defineProps<{
  heading?: string
  /** What comes after this section, e.g. "Next: Deployments". */
  next?: string
  /** One-line narrative hook shown above the bullet list. */
  story?: string
  /** Tighter spacing for long recap lists. */
  compact?: boolean
}>()
</script>

<template>
  <div class="slidev-layout kw-recap" :class="{ 'kw-recap--compact': props.compact }">
    <header class="kw-recap-header">
      <span class="kw-kicker">Recap</span>
      <h1>{{ props.heading ?? 'What you should take away' }}</h1>
    </header>

    <blockquote v-if="props.story" class="kw-recap-story">
      {{ props.story }}
    </blockquote>

    <div class="kw-recap-body">
      <slot />
    </div>

    <footer v-if="props.next" class="kw-recap-next">
      <span class="kw-kicker">Up next</span>
      <span>{{ props.next }}</span>
    </footer>
  </div>
</template>

<style scoped>
.kw-recap {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.kw-recap-header h1 {
  font-size: 1.5rem;
  margin: 0.25rem 0 0.55rem;
}

.kw-recap-story {
  margin: 0 0 0.65rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border-left: 3px solid var(--kw-accent);
  border-radius: 0 var(--kw-radius-sm) var(--kw-radius-sm) 0;
}

.kw-recap-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kw-recap-body :deep(ul) {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.kw-recap-body :deep(ul > li) {
  padding-left: 1.6rem;
  position: relative;
  margin-bottom: 0.45rem;
  font-size: 0.88rem;
  line-height: 1.38;
}

.kw-recap-body :deep(ul > li)::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--kw-ok);
  font-weight: 700;
}

.kw-recap-body :deep(.kw-muted) {
  font-size: 0.78rem;
  line-height: 1.35;
  margin-top: 0.45rem;
}

.kw-recap--compact .kw-recap-header h1 {
  font-size: 1.35rem;
  margin-bottom: 0.4rem;
}

.kw-recap--compact .kw-recap-body :deep(ul > li) {
  margin-bottom: 0.32rem;
  font-size: 0.82rem;
  line-height: 1.32;
}

.kw-recap--compact .kw-recap-story {
  margin-bottom: 0.45rem;
  padding: 0.35rem 0.65rem;
  font-size: 0.78rem;
}

.kw-recap-next {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  border-top: 1px solid var(--kw-border);
  padding-top: 0.55rem;
  margin-top: 0.35rem;
  color: var(--kw-text-dim);
  font-size: 0.82rem;
}
</style>
