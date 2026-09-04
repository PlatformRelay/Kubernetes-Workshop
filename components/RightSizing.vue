<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven right-sizing story over a Grafana-style usage graph (S13).
 * Bind `:step="$clicks"` so it advances with the right-sizing beat.
 *
 * New self-contained component rationale: no existing animation shows a
 * time-series with reference lines — right-sizing is a *graph* story
 * (usage vs request vs limit), not a state machine, so it earns its own
 * component instead of stretching ResourcePressure's meter lanes.
 *
 * One data series (memory usage of `web` over a day), two reference lines.
 * Every fixed `step` renders a meaningful static state, so PDF/static export
 * is faithful (ADR 0001).
 *
 * step 0: the observed usage curve alone — steady state plus one daily burst
 * step 1: the guessed request (512Mi) — the shaded gap between reservation and
 *         reality is capacity the scheduler holds for nobody
 * step 2: the right-sized request (128Mi) — the line drops to just above
 *         steady state; the waste band collapses
 * step 3: the limit (256Mi) appears as burst headroom — the daily peak fits
 *         under it (no OOMKill, no hoarding)
 *
 * `showCaption` (default true) toggles in-component narration — set it false
 * when a companion `v-clicks` legend narrates the steps instead.
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

// y-scale: 0–600Mi mapped onto the plot band (y = 225 − (Mi / 600) · 195)
const Y_512 = 59
const Y_256 = 142
const Y_128 = 183

// request line: guessed 512Mi at step 1, right-sized 128Mi from step 2
const requestY = computed(() => (props.step >= 2 ? Y_128 : Y_512))
const showRequest = computed(() => props.step >= 1)
const showWaste = computed(() => props.step === 1)
const showLimit = computed(() => props.step >= 3)
const requestLabel = computed(() =>
  props.step >= 2 ? 'request: 128Mi ≈ estado estável' : 'request: 512Mi (chutado)',
)
</script>

<template>
  <div class="kw-rs">
    <svg class="kw-rs-chart" viewBox="0 0 640 250" role="img"
      aria-label="Uso de memória ao longo de um dia contra as linhas de request e limit">
      <!-- ruler: faint gridlines with Mi labels -->
      <g class="kw-rs-grid">
        <line x1="50" x2="590" :y1="Y_512" :y2="Y_512" />
        <line x1="50" x2="590" :y1="Y_256" :y2="Y_256" />
        <line x1="50" x2="590" :y1="Y_128" :y2="Y_128" />
        <text x="44" :y="Y_512 + 3">512Mi</text>
        <text x="44" :y="Y_256 + 3">256Mi</text>
        <text x="44" :y="Y_128 + 3">128Mi</text>
        <line class="kw-rs-axis" x1="50" x2="590" y1="225" y2="225" />
        <text x="50" y="242" text-anchor="start">00:00</text>
        <text x="590" y="242" text-anchor="end">24:00</text>
      </g>

      <!-- the waste band: reservation minus reality (step 1 only) -->
      <g class="kw-rs-waste" :class="{ 'is-visible': showWaste }">
        <rect x="50" :y="Y_512" width="540" :height="188 - Y_512" />
        <text x="320" y="126" text-anchor="middle">reservado, nunca usado</text>
      </g>

      <!-- observed usage: one series, steady state + a daily burst -->
      <g class="kw-rs-usage">
        <polygon
          class="kw-rs-usage-area"
          points="50,196 90,193 130,197 170,192 210,195 250,191 290,196 330,194 370,170 400,154 430,156 460,175 490,192 530,195 590,194 590,225 50,225"
        />
        <polyline
          class="kw-rs-usage-line"
          points="50,196 90,193 130,197 170,192 210,195 250,191 290,196 330,194 370,170 400,154 430,156 460,175 490,192 530,195 590,194"
        />
        <text class="kw-rs-usage-label" x="586" y="208" text-anchor="end">uso · web</text>
      </g>

      <!-- the limit: burst headroom above the right-sized request (step 3) -->
      <g class="kw-rs-limit" :class="{ 'is-visible': showLimit }">
        <line x1="50" x2="590" :y1="Y_256" :y2="Y_256" />
        <text x="586" :y="Y_256 - 6" text-anchor="end">limit: 256Mi — folga para burst</text>
        <circle cx="400" cy="154" r="4" />
        <text x="385" y="158" text-anchor="end" class="kw-rs-peak">o pico cabe sob o limit</text>
      </g>

      <!-- the request line: guessed high, then right-sized down -->
      <g
        class="kw-rs-request"
        :class="{ 'is-visible': showRequest, 'is-sized': props.step >= 2 }"
        :style="{ transform: `translateY(${requestY}px)` }"
      >
        <line x1="50" x2="590" y1="0" y2="0" />
        <text x="586" y="-6" text-anchor="end">{{ requestLabel }}</text>
      </g>
    </svg>

    <div v-if="props.showCaption" class="kw-rs-caption">
      <template v-if="props.step <= 0">
        O que a aplicação <strong>realmente usa</strong> — estado estável, um burst diário.
      </template>
      <template v-else-if="props.step === 1">
        O request chutado reserva <strong>512Mi</strong>; a aplicação usa ~90Mi. A faixa
        sombreada é capacidade que o scheduler <strong>guarda para ninguém</strong>.
      </template>
      <template v-else-if="props.step === 2">
        Right-sizing feito: o request fica <strong>logo acima do estado estável</strong> — a
        reserva bate com a realidade e o node recupera sua capacidade.
      </template>
      <template v-else>
        O limit acrescenta <strong>folga para burst</strong>: o pico diário cabe embaixo dele —
        sem OOMKill, nada represado.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-rs {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: center;
}

.kw-rs-chart {
  width: 100%;
  max-width: 44rem;
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  background: var(--kw-panel);
  padding: 0.4rem;
}

.kw-rs-grid line {
  stroke: var(--kw-border);
  stroke-dasharray: 2 4;
}

.kw-rs-grid line.kw-rs-axis {
  stroke-dasharray: none;
}

.kw-rs-grid text {
  font-size: 10px;
  fill: var(--kw-text-faint);
  text-anchor: end;
}

.kw-rs-grid text[text-anchor='start'] {
  text-anchor: start;
}

.kw-rs-usage-line {
  fill: none;
  stroke: var(--kw-accent, #3b82f6);
  stroke-width: 2;
  stroke-linejoin: round;
}

.kw-rs-usage-area {
  fill: var(--kw-accent, #3b82f6);
  opacity: 0.12;
}

.kw-rs-usage-label {
  font-size: 10px;
  fill: var(--kw-text-dim);
}

.kw-rs-waste {
  opacity: 0;
  transition: opacity 0.45s ease;
}

.kw-rs-waste.is-visible {
  opacity: 1;
}

.kw-rs-waste rect {
  fill: var(--kw-warn);
  opacity: 0.12;
}

.kw-rs-waste text {
  font-size: 11px;
  font-weight: 600;
  fill: var(--kw-warn);
}

.kw-rs-request {
  opacity: 0;
  transition: transform 0.55s ease, opacity 0.45s ease;
}

.kw-rs-request.is-visible {
  opacity: 1;
}

.kw-rs-request line {
  stroke: var(--kw-warn);
  stroke-width: 2;
  stroke-dasharray: 7 4;
}

.kw-rs-request.is-sized line {
  stroke: var(--kw-ok);
}

.kw-rs-request text {
  font-size: 10.5px;
  font-weight: 600;
  fill: var(--kw-warn);
}

.kw-rs-request.is-sized text {
  fill: var(--kw-ok);
}

.kw-rs-limit {
  opacity: 0;
  transition: opacity 0.45s ease;
}

.kw-rs-limit.is-visible {
  opacity: 1;
}

.kw-rs-limit line {
  stroke: var(--kw-danger);
  stroke-width: 2;
  stroke-dasharray: 4 4;
}

.kw-rs-limit text {
  font-size: 10.5px;
  font-weight: 600;
  fill: var(--kw-danger);
}

.kw-rs-limit circle {
  fill: none;
  stroke: var(--kw-text-dim);
  stroke-width: 1.5;
}

.kw-rs-limit text.kw-rs-peak {
  font-size: 9.5px;
  font-weight: 500;
  fill: var(--kw-text-dim);
}

.kw-rs-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.2rem;
  text-align: center;
  max-width: 46rem;
}
</style>
