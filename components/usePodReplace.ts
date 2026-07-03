import { computed, onUnmounted, ref } from 'vue'
import type { PodPhase } from './PodCard.vue'

export interface PodState {
  id: string
  name: string
  image: string
  phase: PodPhase
}

export const OLD_TAG = 'nginx:1.27'
export const NEW_TAG = 'nginx:1.28'

/**
 * Shared timeline for the pod-replacement spike so every technology variant
 * animates the exact same sequence:
 * 0 spec at 1.27, old pod Running
 * 1 spec updated to 1.28
 * 2 new pod ContainerCreating alongside the old one
 * 3 new pod Running, old pod Terminating
 * 4 old pod gone
 */
export function usePodReplace(stepMs = 1100) {
  const step = ref(0)
  const playing = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const specImage = computed(() => (step.value >= 1 ? NEW_TAG : OLD_TAG))

  const pods = computed<PodState[]>(() => {
    const old: PodState = {
      id: 'old',
      name: 'web-6f9c-x2lqp',
      image: OLD_TAG,
      phase: step.value >= 3 ? 'Terminating' : 'Running',
    }
    const fresh: PodState = {
      id: 'new',
      name: 'web-7d4b-m8trz',
      image: NEW_TAG,
      phase: step.value >= 3 ? 'Running' : 'ContainerCreating',
    }
    if (step.value <= 1) return [old]
    if (step.value <= 3) return [old, fresh]
    return [fresh]
  })

  function play() {
    clearTimeout(timer)
    step.value = 0
    playing.value = true
    const tick = () => {
      if (step.value >= 4) {
        playing.value = false
        return
      }
      timer = setTimeout(() => {
        step.value++
        tick()
      }, stepMs)
    }
    tick()
  }

  onUnmounted(() => clearTimeout(timer))

  return { step, playing, specImage, pods, play }
}
