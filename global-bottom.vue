<script setup lang="ts">
import { computed } from 'vue'
import { useSlideContext } from '@slidev/client'

/*
 * Read nav through the injected slide context, not the global useNav():
 * in print/export mode every slide is wrapped with a local context whose
 * nav points at THAT slide — useNav() would report slide 1 for all pages.
 */
const { $slidev } = useSlideContext()

const frontmatter = computed(
  () =>
    ($slidev.nav.currentSlideRoute?.meta?.slide?.frontmatter ?? {}) as Record<string, unknown>,
)

/* Full-bleed layouts carry no footer; any slide can opt out via hideFooter. */
const hideFooter = computed(() => {
  if (frontmatter.value.hideFooter === true)
    return true
  const layout = String(frontmatter.value.layout ?? '')
  return ['cover', 'section-cover'].includes(layout)
})

const deckTitle = computed(() => $slidev.configs.title ?? '')
const page = computed(() => $slidev.nav.currentPage)
const total = computed(() => $slidev.nav.total)
const progress = computed(() => (total.value ? (page.value / total.value) * 100 : 0))
</script>

<template>
  <template v-if="!hideFooter">
    <div class="kw-global-footer" aria-hidden="true">{{ deckTitle }}</div>
    <div class="kw-global-page" aria-hidden="true">{{ page }} / {{ total }}</div>
  </template>
  <div class="kw-global-progress" :style="{ width: `${progress}%` }" aria-hidden="true" />
</template>
