<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven "limits are enforced differently per resource" animation (S13).
 * Bind `:step="$clicks"` so it advances alongside the enforcement beat.
 *
 * Two lanes, same story shape but divergent endings — this is the memorable
 * asymmetry of the section:
 *   CPU over the limit  → THROTTLED: the kernel caps the container's CPU share.
 *                          It runs slow but keeps running. Not killed.
 *   Memory over the limit → OOMKilled: the kernel kills the container (SIGKILL,
 *                          exit 137). The kubelet then restarts it per
 *                          restartPolicy — RESTARTS climbs.
 *
 * Self-contained (no PodCard import, K8sIcon read-only) and every fixed `step`
 * renders a meaningful static state, so PDF/static export is faithful (ADR 0001).
 *
 * Steps map 1:1 to the four companion bullets on the slide (clicks 1–4):
 * step 0: both containers within their limits — Running, usage under the ceiling
 * step 1: load applied — both push PAST their limit line
 * step 2: CPU verdict — compressible, so clamped/throttled (Running, slow)
 * step 3: memory verdict — incompressible, so OOMKilled (exit 137)
 * step 4: kubelet restarts the memory container (RESTARTS 1); CPU still Running
 *
 * `showCaption` (default true) toggles the in-component narration — set it false
 * when a companion `v-clicks` legend already narrates the steps (avoids doubling
 * the text and the vertical clipping that causes).
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

// CPU lane — wants more than the ceiling; clamped to 100% of the limit. Never killed.
const cpuFill = computed(() => (props.step <= 0 ? 58 : 100))
const cpuThrottled = computed(() => props.step >= 2)
const cpuPhase = computed(() => {
  switch (props.step) {
    case 0:
      return { label: 'Running', tone: 'ok' as const }
    case 1:
      return { label: 'Running · at limit', tone: 'warn' as const }
    default:
      return { label: 'Running · throttled', tone: 'warn' as const }
  }
})

// Memory lane — climbs past the ceiling, is killed at step 3, restarts at step 4.
const memFill = computed(() => {
  switch (props.step) {
    case 0:
      return 55
    case 4:
      return 40 // fresh container after restart, back at baseline
    default:
      return 100 // at/over the ceiling from step 1 until the restart
  }
})
const memPhase = computed(() => {
  switch (props.step) {
    case 0:
      return { label: 'Running', tone: 'ok' as const }
    case 1:
    case 2:
      return { label: 'Running · at limit', tone: 'warn' as const }
    case 3:
      return { label: 'OOMKilled · exit 137', tone: 'danger' as const }
    default:
      return { label: 'Running · RESTARTS 1', tone: 'ok' as const }
  }
})
const memKilled = computed(() => props.step === 3)
const memRestarts = computed(() => (props.step >= 4 ? 1 : 0))
</script>

<template>
  <div class="kw-rp">
    <div class="kw-rp-lanes">
      <!-- CPU: compressible → throttled, never killed -->
      <div class="kw-rp-lane" :class="`is-${cpuPhase.tone}`">
        <div class="kw-rp-head">
          <K8sIcon kind="pod" variant="unlabeled" size="1.9rem" />
          <div>
            <div class="kw-rp-title">CPU-bound container</div>
            <div class="kw-kicker">compressible resource</div>
          </div>
        </div>
        <div class="kw-rp-meter">
          <div class="kw-rp-limit"><span>limit</span></div>
          <div class="kw-rp-fill is-cpu" :class="{ 'is-clamped': cpuThrottled }" :style="{ height: cpuFill + '%' }" />
        </div>
        <div class="kw-rp-phase" :class="`is-${cpuPhase.tone}`">{{ cpuPhase.label }}</div>
      </div>

      <!-- Memory: incompressible → OOMKilled, then restarted -->
      <div class="kw-rp-lane" :class="`is-${memPhase.tone}`">
        <div class="kw-rp-head">
          <K8sIcon kind="pod" variant="unlabeled" size="1.9rem" />
          <div>
            <div class="kw-rp-title">Memory-bound container</div>
            <div class="kw-kicker">incompressible resource</div>
          </div>
        </div>
        <div class="kw-rp-meter">
          <div class="kw-rp-limit"><span>limit</span></div>
          <div
            class="kw-rp-fill is-mem"
            :class="{ 'is-over': memPhase.tone === 'warn', 'is-killed': memKilled }"
            :style="{ height: memFill + '%' }"
          />
          <div v-if="memKilled" class="kw-rp-kill">✕ SIGKILL</div>
        </div>
        <div class="kw-rp-phase" :class="`is-${memPhase.tone}`">
          {{ memPhase.label }}
          <span v-if="memRestarts" class="kw-rp-restart">↻</span>
        </div>
      </div>
    </div>

    <div v-if="props.showCaption" class="kw-rp-caption">
      <template v-if="props.step <= 0">
        Both containers sit <strong>under</strong> their limits — nothing to enforce.
      </template>
      <template v-else-if="props.step === 1">
        Both push <strong>past</strong> their limit. What the kubelet/kernel does next depends
        on <em>which</em> resource.
      </template>
      <template v-else-if="props.step === 2">
        CPU is <strong>compressible</strong> → the container is <strong>throttled</strong> (slow,
        still Running). Memory is <strong>incompressible</strong> → the container is
        <strong>OOMKilled</strong> (exit 137).
      </template>
      <template v-else>
        The kubelet <strong>restarts</strong> the killed container per <code>restartPolicy</code>
        (<code>RESTARTS 1</code>); the throttled one never needed restarting. <strong>Same limit
        breach, opposite outcome.</strong>
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-rp {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-rp-lanes {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3rem;
}

.kw-rp-lane {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 0.9rem;
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  background: var(--kw-panel);
  transition: border-color 0.45s ease;
}

.kw-rp-lane.is-warn {
  border-color: var(--kw-warn);
}

.kw-rp-lane.is-danger {
  border-color: var(--kw-danger);
}

.kw-rp-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.kw-rp-title {
  font-size: 0.82rem;
  font-weight: 600;
}

/* vertical usage meter with a limit line the fill can hit but not exceed */
.kw-rp-meter {
  position: relative;
  width: 4.2rem;
  height: 9rem;
  border: 1px solid var(--kw-border);
  border-radius: 0.4rem;
  background: var(--kw-bg-soft, rgba(255, 255, 255, 0.03));
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.kw-rp-limit {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  border-top: 2px dashed var(--kw-text-faint);
  z-index: 2;
}

.kw-rp-limit span {
  position: absolute;
  top: 0.15rem;
  right: 0.2rem;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kw-text-faint);
}

.kw-rp-fill {
  width: 100%;
  transition: height 0.55s ease, background 0.45s ease;
}

.kw-rp-fill.is-cpu {
  background: linear-gradient(to top, var(--kw-accent, #3b82f6), rgba(59, 130, 246, 0.5));
}

.kw-rp-fill.is-cpu.is-clamped {
  background: linear-gradient(to top, var(--kw-warn), rgba(245, 158, 11, 0.55));
}

.kw-rp-fill.is-mem {
  background: linear-gradient(to top, var(--kw-ok), rgba(34, 197, 94, 0.5));
}

.kw-rp-fill.is-mem.is-over {
  background: linear-gradient(to top, var(--kw-warn), rgba(245, 158, 11, 0.55));
}

.kw-rp-fill.is-mem.is-killed {
  background: linear-gradient(to top, var(--kw-danger), rgba(239, 68, 68, 0.55));
}

.kw-rp-kill {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  z-index: 3;
}

.kw-rp-phase {
  font-size: 0.74rem;
  font-weight: 600;
}

.kw-rp-phase.is-ok {
  color: var(--kw-ok);
}

.kw-rp-phase.is-warn {
  color: var(--kw-warn);
}

.kw-rp-phase.is-danger {
  color: var(--kw-danger);
}

.kw-rp-restart {
  display: inline-block;
  margin-left: 0.15rem;
  color: var(--kw-ok);
}

.kw-rp-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
  text-align: center;
  max-width: 46rem;
  margin: 0 auto;
}
</style>
