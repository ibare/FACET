import type { BodyInstance, ContainerInstance, EventBus } from '@facet/core';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 760;
const VIEW_H = 220;
const CONTAINER_CX = 90;
const CONTAINER_CY = 110;
const CONTAINER_R = 38;
const BODY_X = 220;
const BODY_Y = 20;
const BODY_W = 510;
const BODY_H = 180;
const WIRE_Y = CONTAINER_CY;
const WIRE_START_X = CONTAINER_CX + CONTAINER_R;
const WIRE_END_X = BODY_X;

const BASE_PULSE_MS = 600;
const BASE_COMPLETE_MS = 700;

const phaseColor: Record<string, string> = {
  outer_loop: '#378ADD',
  comparing: '#BA7517',
  swapping: '#D85A30',
  pass_complete: '#639922',
};

export type CircuitStageHandle = {
  root: HTMLElement;
  bodySlot: HTMLElement;
  setPhase(phase: string | null): void;
  setComplete(complete: boolean): void;
  setTickCount(count: number): void;
  pulseForward(): void;
  pulseReverse(): void;
  setSpeed(multiplier: number): void;
  destroy(): void;
};

export type CircuitStageParams = {
  containerName: string;
  bodyName: string;
  containerInstance: ContainerInstance;
  bodyInstance: BodyInstance;
  eventBus: EventBus;
};

export function createCircuitStage(params: CircuitStageParams): CircuitStageHandle {
  const { containerName, bodyName } = params;

  const root = document.createElement('div');
  root.className = 'facet-circuit__stage';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'facet-circuit__svg');
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const bodyOutline = rect({
    x: BODY_X,
    y: BODY_Y,
    width: BODY_W,
    height: BODY_H,
    rx: 10,
    fill: '#ffffff',
    stroke: '#185FA5',
    'stroke-width': 1,
  });

  const bodyLabel = text({
    x: BODY_X + 12,
    y: BODY_Y + 16,
    'font-size': 10,
    'font-weight': 500,
    fill: '#185FA5',
    content: `facet:${bodyName}`,
  });

  const phaseLabelBg = rect({
    x: BODY_X + 8,
    y: BODY_Y + 22,
    width: BODY_W - 16,
    height: 3,
    rx: 1.5,
    fill: '#d5d8e3',
    opacity: 0,
  });

  const phaseLabelText = text({
    x: BODY_X + BODY_W / 2,
    y: BODY_Y + 20,
    'font-size': 9,
    'font-weight': 500,
    'text-anchor': 'middle',
    fill: '#534AB7',
    content: '',
  });

  const foreign = document.createElementNS(SVG_NS, 'foreignObject');
  foreign.setAttribute('x', String(BODY_X));
  foreign.setAttribute('y', String(BODY_Y + 28));
  foreign.setAttribute('width', String(BODY_W));
  foreign.setAttribute('height', String(BODY_H - 28));

  const bodySlot = document.createElement('div');
  bodySlot.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  bodySlot.className = 'facet-circuit__body-slot';
  foreign.appendChild(bodySlot);

  const wire = line({
    x1: WIRE_START_X,
    y1: WIRE_Y,
    x2: WIRE_END_X,
    y2: WIRE_Y,
    stroke: '#d5d8e3',
    'stroke-width': 1.5,
  });
  const wireStart = circle({ cx: WIRE_START_X, cy: WIRE_Y, r: 3, fill: '#d5d8e3' });
  const wireEnd = circle({ cx: WIRE_END_X, cy: WIRE_Y, r: 3, fill: '#d5d8e3' });

  const containerBg = circle({
    cx: CONTAINER_CX,
    cy: CONTAINER_CY,
    r: CONTAINER_R,
    fill: '#FAEEDA',
    stroke: '#854F0B',
    'stroke-width': 1.5,
  });
  const containerInnerRing = circle({
    cx: CONTAINER_CX,
    cy: CONTAINER_CY,
    r: CONTAINER_R - 6,
    fill: 'none',
    stroke: '#854F0B',
    'stroke-width': 0.5,
    opacity: 0.5,
  });
  const containerPulseRing = circle({
    cx: CONTAINER_CX,
    cy: CONTAINER_CY,
    r: CONTAINER_R,
    fill: 'none',
    stroke: '#FAC775',
    'stroke-width': 2,
    opacity: 0,
  });
  const containerNameText = text({
    x: CONTAINER_CX,
    y: CONTAINER_CY - 4,
    'font-size': 10,
    'font-weight': 500,
    'text-anchor': 'middle',
    fill: '#854F0B',
    content: containerName,
  });
  const containerTickText = text({
    x: CONTAINER_CX,
    y: CONTAINER_CY + 10,
    'font-size': 14,
    'font-weight': 500,
    'text-anchor': 'middle',
    fill: '#412402',
    content: '0',
  });
  const containerTicksLabel = text({
    x: CONTAINER_CX,
    y: CONTAINER_CY + 22,
    'font-size': 8,
    'text-anchor': 'middle',
    fill: '#854F0B',
    content: 'TICKS',
  });
  const containerIdText = text({
    x: CONTAINER_CX,
    y: CONTAINER_CY + CONTAINER_R + 18,
    'font-size': 9,
    'text-anchor': 'middle',
    fill: '#6b6f80',
    content: `facet:${containerName}`,
  });

  const pulseFade = circle({ cx: WIRE_START_X, cy: WIRE_Y, r: 9, fill: '#FAC775', opacity: 0 });
  const pulseCore = circle({ cx: WIRE_START_X, cy: WIRE_Y, r: 6, fill: '#FAC775', opacity: 0 });
  const pulseInner = circle({ cx: WIRE_START_X, cy: WIRE_Y, r: 3, fill: '#ffffff', opacity: 0 });

  svg.append(
    wire,
    wireStart,
    wireEnd,
    bodyOutline,
    bodyLabel,
    phaseLabelBg,
    phaseLabelText,
    foreign,
    containerBg,
    containerInnerRing,
    containerPulseRing,
    containerNameText,
    containerTickText,
    containerTicksLabel,
    containerIdText,
    pulseFade,
    pulseCore,
    pulseInner,
  );

  root.appendChild(svg);

  let speedMul = 1;
  let forwardStart: number | null = null;
  let reverseStart: number | null = null;
  let currentPhase: string | null = null;
  let isComplete = false;
  let rafId = 0;

  function pulseDuration(): number {
    return BASE_PULSE_MS / (speedMul <= 0 ? 1 : speedMul);
  }
  function completeDuration(): number {
    return BASE_COMPLETE_MS / (speedMul <= 0 ? 1 : speedMul);
  }

  function animate(now: number) {
    // forward pulse
    if (forwardStart !== null) {
      const elapsed = now - forwardStart;
      const d = pulseDuration();
      const t = Math.min(elapsed / d, 1);
      const px = WIRE_START_X + (WIRE_END_X - WIRE_START_X) * t;
      const fade = 1 - Math.pow(t, 3);
      pulseFade.setAttribute('cx', String(px));
      pulseFade.setAttribute('opacity', String(0.3 * fade));
      pulseCore.setAttribute('cx', String(px));
      pulseCore.setAttribute('opacity', String(fade));
      pulseInner.setAttribute('cx', String(px));
      pulseInner.setAttribute('opacity', String(fade));
      // container ring
      const ringFade = Math.max(0, 1 - elapsed / (d * 0.3));
      if (elapsed < d * 0.3) {
        containerPulseRing.setAttribute('r', String(CONTAINER_R + elapsed * 0.1));
        containerPulseRing.setAttribute('opacity', String(0.6 * ringFade));
      } else {
        containerPulseRing.setAttribute('opacity', '0');
      }
      // wire color
      wire.setAttribute('stroke', '#FAC775');
      if (t >= 1) {
        forwardStart = null;
        pulseFade.setAttribute('opacity', '0');
        pulseCore.setAttribute('opacity', '0');
        pulseInner.setAttribute('opacity', '0');
        wire.setAttribute('stroke', '#d5d8e3');
        containerPulseRing.setAttribute('opacity', '0');
      }
    }
    // reverse pulse (complete)
    if (reverseStart !== null) {
      const elapsed = now - reverseStart;
      const d = completeDuration();
      const t = Math.min(elapsed / d, 1);
      const px = WIRE_END_X + (WIRE_START_X - WIRE_END_X) * t;
      const fade = 1 - Math.pow(t, 3);
      pulseFade.setAttribute('cx', String(px));
      pulseFade.setAttribute('fill', '#9FE1CB');
      pulseFade.setAttribute('opacity', String(0.3 * fade));
      pulseCore.setAttribute('cx', String(px));
      pulseCore.setAttribute('fill', '#1D9E75');
      pulseCore.setAttribute('opacity', String(fade));
      pulseInner.setAttribute('cx', String(px));
      pulseInner.setAttribute('opacity', '0');
      wire.setAttribute('stroke', '#9FE1CB');
      if (t >= 1) {
        reverseStart = null;
        pulseFade.setAttribute('opacity', '0');
        pulseCore.setAttribute('opacity', '0');
        pulseFade.setAttribute('fill', '#FAC775');
        pulseCore.setAttribute('fill', '#FAC775');
      }
    }
    rafId = requestAnimationFrame(animate);
  }
  rafId = requestAnimationFrame(animate);

  function setPhase(phase: string | null) {
    currentPhase = phase;
    if (phase && phaseColor[phase]) {
      phaseLabelText.textContent = `phase: ${phase}`;
      phaseLabelText.setAttribute('fill', phaseColor[phase]);
      phaseLabelBg.setAttribute('fill', phaseColor[phase]);
      phaseLabelBg.setAttribute('opacity', '0.8');
    } else {
      phaseLabelText.textContent = '';
      phaseLabelBg.setAttribute('opacity', '0');
    }
  }

  function setComplete(complete: boolean) {
    isComplete = complete;
    bodyOutline.setAttribute('stroke', complete ? '#0F6E56' : '#185FA5');
    bodyOutline.setAttribute('stroke-width', complete ? '1.5' : '1');
    containerBg.setAttribute('fill', complete ? '#E4F4EB' : '#FAEEDA');
    containerBg.setAttribute('stroke', complete ? '#0F6E56' : '#854F0B');
    containerNameText.setAttribute('fill', complete ? '#0F6E56' : '#854F0B');
    if (complete) setPhase(null);
  }

  function setTickCount(count: number) {
    containerTickText.textContent = String(count);
  }

  function pulseForward() {
    forwardStart = performance.now();
  }
  function pulseReverse() {
    reverseStart = performance.now();
  }

  function setSpeed(m: number) {
    speedMul = m;
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    root.remove();
  }

  // silence unused
  void currentPhase;
  void isComplete;

  return {
    root,
    bodySlot,
    setPhase,
    setComplete,
    setTickCount,
    pulseForward,
    pulseReverse,
    setSpeed,
    destroy,
  };
}

// ─── SVG element helpers ───────────────────────────────────────────────

type Attrs = Record<string, string | number | undefined>;

function applyAttrs(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    el.setAttribute(k, String(v));
  }
}

function rect(attrs: Attrs): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  applyAttrs(el, attrs);
  return el;
}

function circle(attrs: Attrs): SVGCircleElement {
  const el = document.createElementNS(SVG_NS, 'circle');
  applyAttrs(el, attrs);
  return el;
}

function line(attrs: Attrs): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  applyAttrs(el, attrs);
  return el;
}

function text(attrs: Attrs & { content: string }): SVGTextElement {
  const { content, ...rest } = attrs;
  const el = document.createElementNS(SVG_NS, 'text');
  applyAttrs(el, rest);
  el.textContent = content;
  return el;
}
