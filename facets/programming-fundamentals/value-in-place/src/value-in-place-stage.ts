/**
 * value-in-place 무대 — 값이 베껴져 건너간다.
 *
 * 왼쪽에 프로그램, 오른쪽에 이름마다 자리 하나, 그 아래 출력. 값은 자리 안의 조각으로
 * 서 있고, 한 걸음이 값을 옮길 때는 **출처의 조각은 제자리에 둔 채** 똑같은 조각이
 * 출처에서 떨어져 나와 목적지로 건너간다. 셈으로 바뀌는 값은 옛 조각이 가라앉고 새
 * 조각이 위에서 내려앉는다 — 그 동안 다른 자리는 꿈쩍하지 않는다.
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
import type { SceneValue, ValueInPlaceScene } from './scene.js';

const H = 310;
const W = PIECE_CANVAS_W;
const PAD = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 400;
const CODE_TOP = 64;
const CODE_BOTTOM = 226;
const LINE_H_MAX = 30;
const SLOT_GAP = 24;
const SLOT_W_MAX = 140;
const SLOT_NAME_Y = 70;
const SLOT_TOP = 80;
const SLOT_H = 64;
const CHIP_H = 34;
const CHIP_W_MAX = 60;
const OUT_HEAD_Y = 182;
const OUT_Y = 210;
const OUT_CHIP_W = 44;
const OUT_CHIP_H = 30;
const OUT_GAP = 12;
const CAPTION_Y = 254;
const CAPTION_LH = 22;
const LIFT = 36;

type Point = { x: number; y: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 자리와 코드의 자리 셈 — 장면의 바탕(줄 · 자리 수)에서만 나온다. */
type Layout = {
  codePx: number;
  charW: number;
  gutterX: number;
  textX: number;
  lineH: number;
  codeRight: number;
  memX: number;
  slotW: number;
  chipW: number;
};

function layoutOf(scene: ValueInPlaceScene): Layout {
  const codePx = parseFloat(fontSizes.md);
  const charW = codePx * 0.6;
  const gutterX = PAD;
  const textX = PAD + charW * 2 + 10;
  const n = Math.max(1, scene.lines.length);
  const lineH = Math.min(LINE_H_MAX, (CODE_BOTTOM - CODE_TOP) / n);
  let maxChars = 0;
  for (const l of scene.lines) maxChars = Math.max(maxChars, l.indent * 4 + l.text.length);
  const codeRight = textX + maxChars * charW + 12;
  const memX = codeRight + 36;
  const memW = W - PAD - memX;
  const slots = Math.max(1, scene.slotCount);
  const slotW = Math.min(SLOT_W_MAX, (memW - SLOT_GAP * (slots - 1)) / slots);
  const chipW = Math.min(CHIP_W_MAX, slotW - 20);
  return { codePx, charW, gutterX, textX, lineH, codeRight, memX, slotW, chipW };
}

function lineY(L: Layout, i: number): number {
  return CODE_TOP + i * L.lineH + L.lineH / 2;
}

function slotCenter(L: Layout, i: number): Point {
  return { x: L.memX + i * (L.slotW + SLOT_GAP) + L.slotW / 2, y: SLOT_TOP + SLOT_H / 2 };
}

function outCenter(L: Layout, k: number): Point {
  return { x: L.memX + k * (OUT_CHIP_W + OUT_GAP) + OUT_CHIP_W / 2, y: OUT_Y };
}

/** 코드 줄에서 그 값의 글자가 선 자리 — 글자 그대로의 수가 여기서 떨어져 나온다. */
function literalPoint(L: Layout, scene: ValueInPlaceScene, line: number, value: SceneValue): Point {
  const l = scene.lines[line];
  const y = lineY(L, line);
  if (!l) return { x: L.codeRight, y };
  const s = String(value);
  const at = l.text.lastIndexOf(s);
  const col = l.indent * 4 + (at >= 0 ? at + s.length / 2 : l.text.length);
  return { x: L.textX + col * L.charW, y };
}

function chip(
  parent: Element,
  c: Point,
  w: number,
  h: number,
  value: SceneValue,
  colors: Palette,
  stroke: string,
  strokeW: number,
  px: number,
): SVGGElement {
  const g = el('g', {}, parent);
  el('rect', { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rx: 8, fill: colors.bgSubtle, stroke, 'stroke-width': strokeW }, g);
  const t = el(
    'text',
    { x: c.x, y: c.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: colors.text, 'font-family': fonts.mono, 'font-size': px, 'font-weight': 600 },
    g,
  );
  t.textContent = String(value);
  return g;
}

/** 정적 그리기가 돌려주는 손잡이 — 운동이 옮길 조각. */
type Drawn = { moving: SVGGElement | null; layer: SVGGElement };

function drawStatic(
  canvas: SVGSVGElement,
  scene: ValueInPlaceScene,
  colors: Palette,
  t: Translate,
): Drawn {
  canvas.textContent = '';
  const root = el('g', {}, canvas);
  if (scene.lines.length === 0) return { moving: null, layer: root };
  const L = layoutOf(scene);
  const step = scene.step;
  const small = parseFloat(fontSizes.xs);

  // 코드
  const hi = el('g', {}, root);
  scene.lines.forEach((line, i) => {
    const y = lineY(L, i);
    if (step && step.line === i) {
      el('rect', { x: L.gutterX - 8, y: y - L.lineH / 2 + 2, width: L.codeRight - L.gutterX + 8, height: L.lineH - 4, rx: 4, fill: colors.bgSubtle }, hi);
      el('rect', { x: L.gutterX - 8, y: y - L.lineH / 2 + 2, width: 3, height: L.lineH - 4, fill: colors.primary }, hi);
    }
    const num = el('text', { x: L.gutterX, y, 'dominant-baseline': 'central', fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': small }, root);
    num.textContent = String(i + 1);
    const tx = el('text', { x: L.textX + line.indent * 4 * L.charW, y, 'dominant-baseline': 'central', fill: colors.text, 'font-family': fonts.mono, 'font-size': L.codePx, 'xml:space': 'preserve' }, root);
    tx.textContent = line.text;
  });

  // 머리글
  const headSlots = el('text', { x: L.memX, y: CODE_TOP - 22, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': small }, root);
  headSlots.textContent = t('label.slots', 'slots');
  const headOut = el('text', { x: L.memX, y: OUT_HEAD_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': small }, root);
  headOut.textContent = t('label.output', 'output');

  // 자리
  let moving: SVGGElement | null = null;
  scene.slots.forEach((slot, i) => {
    const c = slotCenter(L, i);
    const x = c.x - L.slotW / 2;
    const name = el('text', { x: c.x, y: SLOT_NAME_Y, 'text-anchor': 'middle', fill: colors.text, 'font-family': fonts.mono, 'font-size': L.codePx }, root);
    name.textContent = slot.name;
    el('rect', { x, y: SLOT_TOP, width: L.slotW, height: SLOT_H, rx: 6, fill: colors.bg, stroke: colors.border, 'stroke-width': 1.5 }, root);
    const arrived = step?.kind === 'assign' && step.name === slot.name;
    const read = step?.from === 'slot' && step.src === slot.name && !arrived;
    const stroke = arrived ? colors.itemActive : read ? colors.primary : colors.textMuted;
    const g = chip(root, c, L.chipW, CHIP_H, slot.value, colors, stroke, arrived || read ? 2 : 1, L.codePx + 2);
    if (arrived) moving = g;
  });

  // 출력
  scene.out.forEach((value, k) => {
    const isNew = step?.kind === 'show' && k === scene.out.length - 1;
    const g = chip(root, outCenter(L, k), OUT_CHIP_W, OUT_CHIP_H, value, colors, isNew ? colors.itemActive : colors.textMuted, isNew ? 2 : 1, L.codePx);
    if (isNew) moving = g;
  });

  // 캡션 — 지금 일어난 일만
  const lines: { text: string; muted: boolean }[] = [];
  if (!step) {
    lines.push({ text: t('caption.start', 'No line has run yet.'), muted: false });
  } else {
    const name = step.name ?? '';
    const value = String(step.value);
    if (step.kind === 'assign' && step.declare) {
      if (step.from === 'slot' && step.src !== undefined) {
        lines.push({ text: t('caption.declareCopy', 'A new slot opens for {name}. The {value} in {src} is copied into it.', { name, value, src: step.src }), muted: false });
      } else if (step.from === 'calc') {
        lines.push({ text: t('caption.declareCalc', 'A new slot opens for {name}. The computed {value} goes inside it.', { name, value }), muted: false });
      } else {
        lines.push({ text: t('caption.declareLiteral', 'A new slot opens for {name}. The number {value} goes inside it.', { name, value }), muted: false });
      }
    } else if (step.kind === 'assign') {
      lines.push({ text: t('caption.assign', 'Only slot {name} changes: {was} is replaced by {value}.', { name, value, was: String(step.was ?? '') }), muted: false });
    } else if (step.from === 'slot' && step.src !== undefined) {
      lines.push({ text: t('caption.showCopy', 'The {value} in {src} is copied out to the output.', { value, src: step.src }), muted: false });
    } else {
      lines.push({ text: t('caption.show', '{value} goes to the output.', { value }), muted: false });
    }
    // 이번 걸음이 손대지 않은 자리 — 베껴 간 출처이거나, 한 자리가 바뀌는 동안 곁의 자리
    for (const slot of scene.slots) {
      if (step.kind === 'assign' && slot.name === step.name) continue;
      const mention = step.kind === 'assign' ? !step.declare || step.src === slot.name : step.src === slot.name;
      if (!mention) continue;
      lines.push({ text: t('caption.keep', 'Slot {other} still holds {kept}.', { other: slot.name, kept: String(slot.value) }), muted: true });
    }
    if (step.last) lines.push({ text: t('caption.end', 'The program ends.'), muted: true });
  }
  lines.forEach((ln, i) => {
    const node = el('text', { x: PAD, y: CAPTION_Y + i * CAPTION_LH, fill: ln.muted ? colors.textMuted : colors.text, 'font-family': fonts.body, 'font-size': parseFloat(fontSizes.md) }, root);
    node.textContent = ln.text;
  });

  return { moving, layer: root };
}

export const valueInPlaceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    canvas.textContent = '';

    /** 한 시계 — duration 동안 frame(e) 를 부르고, 다 흐르면 참. 거둬지면 거짓. */
    function tween(duration: number, frame: (e: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed) return finish(false);
          const p = Math.min(1, (Date.now() - start) / duration);
          frame(ease(p));
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: ValueInPlaceScene, prev: ValueInPlaceScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(canvas, next, colors, t);
      const step = next.step;
      if (!opts.animate || !step || !drawn.moving || prev === null || prev.step === next.step) return;
      if (next.lines.length === 0) return;

      const L = layoutOf(next);
      const moving = drawn.moving;
      let end: Point;
      if (step.kind === 'assign') {
        const i = next.slots.findIndex((s) => s.name === step.name);
        end = slotCenter(L, i);
      } else {
        end = outCenter(L, next.out.length - 1);
      }

      let start: Point;
      let arc = LIFT;
      let ghost: SVGGElement | null = null;
      if (step.from === 'slot' && step.src !== undefined) {
        const i = next.slots.findIndex((s) => s.name === step.src);
        start = i >= 0 ? slotCenter(L, i) : end;
      } else if (step.from === 'calc') {
        // 셈으로 바뀐 값 — 옛 값은 가라앉고 새 값이 위에서 내려앉는다
        start = { x: end.x, y: end.y - LIFT };
        arc = 0;
        if (step.was !== undefined && !step.declare) {
          ghost = chip(drawn.layer, end, L.chipW, CHIP_H, step.was, colors, colors.textMuted, 1, L.codePx + 2);
          drawn.layer.insertBefore(ghost, moving);
        }
      } else {
        start = literalPoint(L, next, step.line, step.value);
      }

      const dx = start.x - end.x;
      const dy = start.y - end.y;
      const place = (e: number): void => {
        const lift = arc * Math.sin(Math.PI * e);
        moving.setAttribute('transform', `translate(${r2(dx * (1 - e))},${r2(dy * (1 - e) - lift)})`);
        if (ghost) {
          ghost.setAttribute('transform', `translate(0,${r2(LIFT * e)})`);
          ghost.setAttribute('opacity', String(r2(1 - e)));
        }
      };
      place(0);
      moving.parentNode?.appendChild(moving);
      await tween(MOVE_MS, place);
      if (mine !== gen || destroyed) return;
      drawStatic(canvas, next, colors, t);
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
        canvas.textContent = '';
      },
    };
  },
};
