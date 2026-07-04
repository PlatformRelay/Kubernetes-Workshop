<script setup lang="ts">
import LabCallout from '../components/LabCallout.vue'

const props = defineProps<{
  /** Slide heading shown in the header bar. */
  heading?: string
  /** Optional lab reference, e.g. "labs/day-1/07-service.md". */
  lab?: string
}>()
</script>

<!--
  Code left, annotation rail right. Pair Shiki click-highlighting with
  <CodeNote> items in the ::notes:: slot: start the highlight spec with `none`
  (```yaml {none|2-4|6-9}```) so note 1 + lines 2-4 light up on the same click.
-->
<template>
  <div class="slidev-layout kw-code-annotated">
    <header class="kw-ca-header">
      <h1 v-if="props.heading">{{ props.heading }}</h1>
      <slot name="title" />
    </header>

    <div class="kw-ca-cols">
      <div class="kw-ca-code">
        <slot />
      </div>
      <aside class="kw-ca-rail">
        <slot name="notes" />
      </aside>
    </div>

    <LabCallout v-if="props.lab" :lab="props.lab" class="kw-ca-lab" />
  </div>
</template>

<style scoped>
.kw-code-annotated {
  display: flex;
  flex-direction: column;
}

.kw-ca-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.6rem;
}

.kw-ca-cols {
  flex: 1;
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 1.3rem;
  min-height: 0;
  align-items: center;
}

.kw-ca-code :deep(pre.slidev-code) {
  font-size: 0.88em;
  line-height: 1.5;
}

.kw-ca-rail {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.65rem;
  min-height: 0;
}

.kw-ca-lab {
  position: absolute;
  right: 1.6rem;
  bottom: 1.2rem;
}
</style>
