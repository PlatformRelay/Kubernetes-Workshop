<script setup lang="ts">
const props = defineProps<{
  heading?: string
  /** What comes after this section, e.g. "Next: Deployments". */
  next?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-recap">
    <header class="kw-recap-header">
      <span class="kw-kicker">Recap</span>
      <h1>{{ props.heading ?? 'What you should take away' }}</h1>
    </header>

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
}

.kw-recap-header h1 {
  font-size: 1.6rem;
  margin: 0.3rem 0 0.8rem;
}

.kw-recap-body {
  flex: 1;
  min-height: 0;
}

.kw-recap-body :deep(ul) {
  list-style: none;
  padding-left: 0;
}

.kw-recap-body :deep(ul > li) {
  padding-left: 1.8rem;
  position: relative;
  margin-bottom: 0.55rem;
}

.kw-recap-body :deep(ul > li)::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--kw-ok);
  font-weight: 700;
}

.kw-recap-next {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  border-top: 1px solid var(--kw-border);
  padding-top: 0.7rem;
  color: var(--kw-text-dim);
}
</style>
