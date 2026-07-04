<script setup lang="ts">
const props = defineProps<{
  /** Small mono label above the statement, e.g. "Mental model". */
  kicker?: string
}>()
</script>

<!-- One big idea per slide: a claim, a definition, a rule of thumb. -->
<template>
  <div class="slidev-layout kw-statement">
    <div class="kw-stmt-inner">
      <span v-if="props.kicker" class="kw-kicker">{{ props.kicker }}</span>
      <div class="kw-stmt-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.kw-statement {
  display: flex;
  align-items: center;
}

.kw-stmt-inner {
  max-width: 80%;
  border-left: 4px solid var(--kw-accent);
  padding-left: 2rem;
}

.kw-stmt-body {
  margin-top: 0.6rem;
}

.kw-stmt-body :deep(h1),
.kw-stmt-body :deep(p:first-child) {
  font-size: 1.9rem;
  line-height: 1.3;
  font-weight: 650;
  color: var(--kw-text);
  margin: 0;
}

.kw-stmt-body :deep(p + p) {
  margin-top: 0.9rem;
  font-size: 1.05rem;
  color: var(--kw-text-dim);
}

.kw-stmt-body :deep(code) {
  font-size: 0.85em;
}
</style>
