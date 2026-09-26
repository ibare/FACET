/**
 * weight-sharing 무대 — 무게 한 벌이 입력 위를 옮겨 다니며 다시 쓰인다.
 *
 * 위에서 아래로: 무게 한 벌(창 틀과 함께 움직인다) · 입력 · 출력 · "따로 둔다면" 필요했을 무게.
 * 둔 무게 타일은 끝까지 셋이고, 따로 둔다면의 빈 타일은 쓰인 자리마다 셋씩 쌓인다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { WeightSharingScene } from './scene.js';

const H = 312;
const SVG = 'http://www.w3.org/2000/svg';

const LABEL_W = 96;
const RIGHT_PAD = 12;
const CELL_MAX = 56;

const STRIP_Y = 22;
const STRIP_H = 32;
const INPUT_Y = 68;
const INPUT_H = 36;
const INDEX_Y = 126;
const OUTPUT_Y = 136;
const OUTPUT_H = 36;
const GHOST_Y = 184;
const GHOST_BAND = 44;
const STAT_Y1 = 252;
const STAT_Y2 = 272;
const CAPTION_Y = 300;

const MOVE_MS = 400;

type Geo = { cellW: number; x0: number; k: number };

function geometry(scene: WeightSharingScene): Geo {
  const n = Math.max(scene.input.length, 1);
  const cellW = Math.min(CELL_MAX, Math.floor((PIECE_CANVAS_W - LABEL_W - RIGHT_PAD) / n));
  return { cellW, x0: LABEL_W, k: scene.weights.length };
}

function rnd(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function signed(v: number): string {
  return v < 0 ? `−${Math.abs(v)}` : String(v);
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

type Handles = {
  strip: SVGGElement | null;
  drop: SVGGElement | null;
  ghosts: SVGGElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, typeof value === 'number' ? rnd(value) : value);
  }
  parent.appendChild(node);
  return node;
}

function word(
  parent: Element,
  x: number,
  y: number,
  body: string,
  fill: string,
  size: string,
  extra: Record<string, string | number> = {},
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill,
    'font-family': fonts.body,
    'font-size': size,
    'dominant-baseline': 'middle',
    ...extra,
  });
  node.textContent = body;
  return node;
}

function drawStatic(
  svg: SVGSVGElement,
  scene: WeightSharingScene,
  colors: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const handles: Handles = { strip: null, drop: null, ghosts: null };
  if (scene.input.length === 0) return handles;

  const { cellW, x0, k } = geometry(scene);
  const cellX = (i: number): number => x0 + i * cellW;
  const outShift = ((k - 1) / 2) * cellW;
  const step = scene.step;

  // 줄 이름
  const labels = el(svg, 'g', {});
  word(labels, 8, STRIP_Y + STRIP_H / 2, t('label.weights', 'Weights'), colors.text, fontSizes.sm, { 'font-weight': 600 });
  word(labels, 8, INPUT_Y + INPUT_H / 2, t('label.input', 'Input'), colors.textMuted, fontSizes.sm);
  word(labels, 8, OUTPUT_Y + OUTPUT_H / 2, t('label.output', 'Output'), colors.textMuted, fontSizes.sm);
  word(labels, 8, GHOST_Y + GHOST_BAND / 2, t('label.separate', 'If separate'), colors.textMuted, fontSizes.sm);

  // 입력 칸
  const inputLayer = el(svg, 'g', {});
  scene.input.forEach((v, i) => {
    el(inputLayer, 'rect', {
      x: cellX(i) + 2,
      y: INPUT_Y,
      width: cellW - 4,
      height: INPUT_H,
      rx: 4,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': 1,
    });
    word(inputLayer, cellX(i) + cellW / 2, INPUT_Y + INPUT_H / 2, signed(v), colors.text, fontSizes.md, {
      'text-anchor': 'middle',
      'font-family': fonts.mono,
    });
  });

  // 이번 걸음이 같은 입력의 앞 자리를 짚는다
  if (step !== null && step.twin !== null) {
    el(inputLayer, 'rect', {
      x: cellX(step.twin) - 1,
      y: INPUT_Y - 4,
      width: k * cellW + 2,
      height: INPUT_H + 8,
      rx: 6,
      fill: 'none',
      stroke: colors.itemActive,
      'stroke-width': 2,
      'stroke-dasharray': '5 3',
    });
  }

  // 출력 칸
  const outLayer = el(svg, 'g', {});
  const twinCells = new Set<number>();
  for (const pair of scene.twins) {
    twinCells.add(pair.a);
    twinCells.add(pair.b);
  }
  scene.outputs.forEach((v, p) => {
    const x = cellX(p) + outShift;
    word(outLayer, x + cellW / 2, INDEX_Y, String(p), colors.textMuted, fontSizes.xs, { 'text-anchor': 'middle' });
    const marked = twinCells.has(p);
    el(outLayer, 'rect', {
      x: x + 3,
      y: OUTPUT_Y,
      width: cellW - 6,
      height: OUTPUT_H,
      rx: 4,
      fill: v === null ? 'none' : colors.bgSubtle,
      stroke: marked ? colors.itemActive : v === null ? colors.border : colors.textMuted,
      'stroke-width': marked ? 2 : 1,
      ...(v === null ? { 'stroke-dasharray': '3 3' } : {}),
    });
    if (v === null) return;
    const holder = el(outLayer, 'g', {});
    word(holder, x + cellW / 2, OUTPUT_Y + OUTPUT_H / 2, signed(v), colors.text, fontSizes.md, {
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-weight': 600,
    });
    if (step !== null && step.pos === p) handles.drop = holder;
  });

  // 따로 둔다면 — 쓰인 자리마다 무게 k 개
  const ghostLayer = el(svg, 'g', {});
  const gap = 3;
  const ghostH = Math.min(10, (GHOST_BAND - gap * (k - 1)) / k);
  scene.outputs.forEach((v, p) => {
    if (v === null) return;
    const group = el(ghostLayer, 'g', {});
    const x = cellX(p) + outShift;
    for (let j = 0; j < k; j += 1) {
      el(group, 'rect', {
        x: x + 6,
        y: GHOST_Y + j * (ghostH + gap),
        width: cellW - 12,
        height: ghostH,
        rx: 2,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 2',
      });
    }
    if (step !== null && step.pos === p) handles.ghosts = group;
  });

  // 무게 한 벌 (창 틀과 함께 옮겨 다닌다)
  const at = scene.at ?? 0;
  const strip = el(svg, 'g', {});
  if (scene.at !== null) {
    el(strip, 'rect', {
      x: cellX(at) - 3,
      y: STRIP_Y - 6,
      width: k * cellW + 6,
      height: INPUT_Y + INPUT_H + 6 - (STRIP_Y - 6),
      rx: 7,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 2.5,
    });
  }
  scene.weights.forEach((w, i) => {
    el(strip, 'rect', {
      x: cellX(at + i) + 3,
      y: STRIP_Y,
      width: cellW - 6,
      height: STRIP_H,
      rx: 4,
      fill: colors.accent,
      stroke: colors.text,
      'stroke-width': 1,
    });
    word(strip, cellX(at + i) + cellW / 2, STRIP_Y + STRIP_H / 2, signed(w), colors.stateInk, fontSizes.md, {
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-weight': 700,
    });
  });
  handles.strip = strip;

  // 수 — 쓰인 자리 · 곱 / 둔 무게 · 따로 둔다면 무게
  const stats = el(svg, 'g', {});
  const colB = PIECE_CANVAS_W / 2;
  word(stats, 8, STAT_Y1, t('stat.used', 'Positions used: {n}', { n: scene.used }), colors.text, fontSizes.sm);
  word(stats, colB, STAT_Y1, t('stat.products', 'Multiplications: {n}', { n: scene.products }), colors.text, fontSizes.sm);
  el(stats, 'rect', { x: 8, y: STAT_Y2 - 5, width: 14, height: 10, rx: 2, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
  word(stats, 28, STAT_Y2, t('stat.weights', 'Weights stored: {n}', { n: scene.weightCount }), colors.text, fontSizes.sm, {
    'font-weight': 600,
  });
  el(stats, 'rect', {
    x: colB,
    y: STAT_Y2 - 5,
    width: 14,
    height: 10,
    rx: 2,
    fill: 'none',
    stroke: colors.textMuted,
    'stroke-width': 1,
    'stroke-dasharray': '3 2',
  });
  word(stats, colB + 20, STAT_Y2, t('stat.separate', 'Weights if separate: {n}', { n: scene.separate }), colors.text, fontSizes.sm);

  // 캡션 — 지금 일어나는 일
  let caption = '';
  if (step === null) {
    if (scene.outLen > 0) caption = t('caption.start', 'One set of weights · output positions: {n}', { n: scene.outLen });
  } else if (step.twin !== null) {
    caption = t('caption.twin', 'Position {p}: same input as position {q} → same output {v}', {
      p: step.pos,
      q: step.twin,
      v: signed(step.value),
    });
  } else {
    caption = t('caption.place', 'Position {p} → output {v}', { p: step.pos, v: signed(step.value) });
  }
  if (caption !== '') word(svg, 8, CAPTION_Y, caption, colors.text, fontSizes.md, { 'font-weight': 600 });

  return handles;
}

export const weightSharingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function play(mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / MOVE_MS);
          onFrame(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: WeightSharingScene, _prev: WeightSharingScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(svg, next, colors, t);
      const step = next.step;
      if (!opts.animate || step === null) return;

      const { cellW } = geometry(next);
      // 무게 한 벌이 앞 자리에서 이 자리로 옮겨 온다 — 아직 못 온 만큼 뒤에 둔다
      const slide = step.from === null ? 0 : (step.from - step.pos) * cellW;
      // 출력 값은 창의 가운데(입력 줄)에서 출력 칸으로 내려온다
      const fall = OUTPUT_Y - INPUT_Y;
      const ghostFall = GHOST_Y - OUTPUT_Y;

      const frame = (p: number): void => {
        const a = ease(p / 0.55);
        const b = ease((p - 0.4) / 0.6);
        handles.strip?.setAttribute('transform', `translate(${rnd(slide * (1 - a))},0)`);
        handles.drop?.setAttribute('transform', `translate(0,${rnd(-fall * (1 - b))})`);
        handles.ghosts?.setAttribute('transform', `translate(0,${rnd(-ghostFall * (1 - b))})`);
      };
      frame(0);
      await play(mine, frame);
      if (destroyed || mine !== gen) return;
      drawStatic(svg, next, colors, t);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
