<script setup lang="ts">
import LabCallout from '../components/LabCallout.vue'

const props = defineProps<{
  /** Slide heading shown in the header bar. */
  heading?: string
  /** Optional lab reference, e.g. "labs/day-1/05-pod.md". */
  lab?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-code-walkthrough">
    <header class="kw-cw-header">
      <h1 v-if="props.heading">{{ props.heading }}</h1>
      <slot name="title" />
    </header>

    <div class="kw-cw-body">
      <slot />
    </div>

    <LabCallout v-if="props.lab" :lab="props.lab" class="kw-cw-lab" />
  </div>
</template>

<style scoped>
.kw-code-walkthrough {
  display: flex;
  flex-direction: column;
}

.kw-cw-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.6rem;
}

.kw-cw-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
}

/* Code is the star of this layout: give it room. */
.kw-cw-body :deep(.slidev-code-wrapper) {
  max-height: 100%;
}

.kw-cw-body :deep(pre.slidev-code) {
  font-size: 0.95em;
  line-height: 1.5;
}

.kw-cw-lab {
  position: absolute;
  right: 1.6rem;
  bottom: 1.2rem;
}
</style>
