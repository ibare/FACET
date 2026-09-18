/**
 * 순서가 크기를 바꾼다 — stage.
 *
 * 위 줄은 선언 차례, 아래 줄은 큰 것부터의 차례. 가로가 바이트 축이다.
 *   - place : 필드가 위에서 앞 끝 자리로 내려앉고, 제 정렬 자리까지 밀려 가며 빈틈을 남긴다
 *   - move  : 필드가 위 줄의 자리를 떠나(자국이 남는다) 아래 줄의 새 자리로 옮겨 간다
 *   - close : 테두리가 끝을 가장 큰 정렬로 올린 자리까지 선다. 아래 줄은 위 줄 크기의
 *             옛 테두리에서 새 크기로 줄어든다
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  FieldOrderSizeRow,
  FieldOrderSizeScene,
  FieldOrderSizeSceneField,
  FieldOrderSizeSlot,
} from './scene.js';

const H = 304;
const MARGIN = 24;
/** 바이트 한 칸의 상한 — 캔버스를 채우되 필드가 적을 때 칸이 부풀지 않게 */
const UNIT_MAX = 34;
const BAR_H = 44;
const CAPTION_Y = 30;
/** 줄마다: 선언 줄 · 막대 윗변 · 눈금 수 · 크기 표 */
const ROWS = {
  before: { label: 64, bar: 76, nums: 140, tag: 160 },
  after: { label: 196, bar: 208, nums: 272, tag: 292 },
} as const;
type RowKey = keyof typeof ROWS;
const DROP = 30;

const SVG_NS = 'http://www.w3.org/2000/svg';

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** k 의 [a, b] 구간을 0..1 로 편다 */
function part(k: number, a: number, b: number): number {
  if (k <= a) return 0;
  if (k >= b) return 1;
  return (k - a) / (b - a);
}

type Handles = {
  blocks: Map<string, SVGGElement>;
  gaps: Map<string, SVGGElement>;
  frames: Map<RowKey, { rect: SVGRectElement; tag: SVGTextElement | null }>;
  afterRow: SVGGElement | null;
};

function maxAlign(fields: FieldOrderSizeSceneField[]): number {
  return fields.reduce((m, f) => Math.max(m, f.size), 1);
}

function fieldBytes(fields: FieldOrderSizeSceneField[]): number {
  return fields.reduce((sum, f) => sum + f.size, 0);
}

function declaration(fields: FieldOrderSizeSceneField[], order: number[]): string {
  const parts = order.map((i) => {
    const f = fields[i];
    return f ? `${f.type} ${f.name};` : '';
  });
  return `struct { ${parts.join(' ')} }`;
}

function mount(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance & SceneRenderer<FieldOrderSizeScene> {
  // initialData 는 읽지 않는다 — 필드와 크기는 장면(init 이벤트)이 정본이다
  const svg = params.canvas;
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const c: Palette = getColors(params.theme);

  let gen = 0;
  let destroyed = false;
  const frames = new Set<number>();
  const waiters = new Set<() => void>();

  function unitOf(scene: FieldOrderSizeScene): number {
    const span = Math.max(1, scene.span);
    return Math.min(UNIT_MAX, (PIECE_CANVAS_W - 2 * MARGIN) / span);
  }

  function caption(scene: FieldOrderSizeScene): string {
    const step = scene.step;
    if (!step) return '';
    const align = maxAlign(scene.fields);
    if (step.kind === 'init') return t('caption.init', 'Lay the fields out in declared order.');
    if (step.kind === 'reorder') return t('caption.reorder', 'Same fields, largest first.');
    if (step.kind === 'place' || step.kind === 'move') {
      const f = scene.fields[step.field];
      if (!f) return '';
      const vars = {
        name: f.name,
        offset: step.offset,
        align: f.size,
        k: step.offset / f.size,
        pad: step.offset - step.from,
        from: step.from,
      };
      if (step.kind === 'place') {
        if (step.offset > step.from) {
          return t('caption.placeGap', '{name}: skip {pad} after {from}, start at {offset} = {align} × {k}.', vars);
        }
        return t('caption.place', '{name} starts at {offset} = {align} × {k}.', vars);
      }
      if (step.offset > step.from) {
        return t('caption.moveGap', '{name} moves to {offset} = {align} × {k}, after a gap of {pad}.', vars);
      }
      return t('caption.move', '{name} moves to {offset} = {align} × {k}. No gap before it.', vars);
    }
    const vars = { end: step.end, align, k: step.size / align, size: step.size };
    if (step.row === 'before') {
      return t('caption.close', 'Ends at {end}, rounded up to {align} × {k} = {size}.', vars);
    }
    const was = scene.before.closed?.size ?? scene.span;
    return t('caption.shrink', 'Ends at {end}, rounded up to {align} × {k} = {size}. Was {was}.', { ...vars, was });
  }

  /** 한 줄에서 옮겨 간 필드 (위 줄의 자국이 된다) */
  function movedFields(scene: FieldOrderSizeScene): Set<number> {
    return new Set(scene.after ? scene.after.slots.map((s) => s.field) : []);
  }

  function drawRow(
    scene: FieldOrderSizeScene,
    key: RowKey,
    row: FieldOrderSizeRow,
    parent: SVGGElement,
    handles: Handles,
  ): void {
    const unit = unitOf(scene);
    const x = (byte: number): number => r1(MARGIN + byte * unit);
    const y = ROWS[key];
    const align = maxAlign(scene.fields);
    const colors = categorical(scene.fields.length, 'vivid');
    const moved = key === 'before' ? movedFields(scene) : new Set<number>();

    // 선언 줄
    el('text', {
      x: MARGIN,
      y: y.label,
      fill: c.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
    }, parent).textContent = declaration(scene.fields, row.order);

    // 바이트 눈금
    const ruler = el('g', {}, parent);
    let every = 1;
    while (every * unit < 36 && every < 64) every *= 2;
    for (let b = 0; b <= scene.span; b += 1) {
      const strong = b % align === 0;
      el('line', {
        x1: x(b),
        x2: x(b),
        y1: y.bar + BAR_H,
        y2: y.bar + BAR_H + (strong ? 8 : 4),
        stroke: strong ? c.textMuted : c.border,
        'stroke-width': 1,
      }, ruler);
      if (b % every === 0) {
        const n = el('text', {
          x: x(b),
          y: y.nums,
          fill: strong ? c.text : c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        }, ruler);
        n.textContent = String(b);
      }
    }

    // 빈틈 — 필드 앞마다, 닫혔으면 꼬리도
    const drawGap = (gapKey: string, from: number, to: number): void => {
      if (to <= from) return;
      const g = el('g', {}, parent);
      for (let b = from; b < to; b += 1) {
        el('rect', {
          x: r1(x(b) + 2),
          y: y.bar + 6,
          width: r1(unit - 4),
          height: BAR_H - 12,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-dasharray': '3 2',
          rx: 2,
        }, g);
      }
      handles.gaps.set(gapKey, g);
    };
    for (const slot of row.slots) drawGap(`${key}:${slot.field}`, slot.from, slot.offset);
    if (row.closed) {
      const last = row.slots[row.slots.length - 1];
      const end = last ? last.offset + (scene.fields[last.field]?.size ?? 0) : 0;
      drawGap(`${key}:tail`, end, row.closed.size);
    }

    // 필드
    for (const slot of row.slots) {
      const f = scene.fields[slot.field];
      if (!f) continue;
      const g = el('g', {}, parent);
      const ghost = moved.has(slot.field);
      const x0 = x(slot.offset);
      const x1 = x(slot.offset + f.size);
      el('rect', {
        x: x0,
        y: y.bar,
        width: r1(x1 - x0),
        height: BAR_H,
        fill: ghost ? 'none' : (colors[slot.field] ?? c.itemDefault),
        stroke: ghost ? c.textMuted : c.bg,
        'stroke-width': ghost ? 1 : 1.5,
        'stroke-dasharray': ghost ? '4 3' : 'none',
        rx: 3,
      }, g);
      if (!ghost) {
        for (let b = 1; b < f.size; b += 1) {
          el('line', {
            x1: x(slot.offset + b),
            x2: x(slot.offset + b),
            y1: y.bar + BAR_H - 8,
            y2: y.bar + BAR_H,
            stroke: c.stateInk,
            'stroke-opacity': 0.25,
          }, g);
        }
      }
      const name = el('text', {
        x: r1((x0 + x1) / 2),
        y: y.bar + BAR_H / 2 + 5,
        fill: ghost ? c.textMuted : c.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': ghost ? 400 : 700,
        'text-anchor': 'middle',
      }, g);
      name.textContent = f.name;
      handles.blocks.set(`${key}:${slot.field}`, g);
    }

    // 테두리 — 닫혔으면 제 크기로. 아래 줄은 닫히기 전까지 위 줄 크기의 옛 테두리
    const oldSize = key === 'after' ? (scene.before.closed?.size ?? null) : null;
    const size = row.closed ? row.closed.size : oldSize;
    if (size !== null) {
      const rect = el('rect', {
        x: r1(MARGIN - 3),
        y: y.bar - 4,
        width: r1(x(size) - MARGIN + 6),
        height: BAR_H + 8,
        fill: 'none',
        stroke: row.closed ? c.text : c.textMuted,
        'stroke-width': row.closed ? 1.5 : 1,
        'stroke-dasharray': row.closed ? 'none' : '5 4',
        rx: 5,
      }, parent);
      let tag: SVGTextElement | null = null;
      if (row.closed) {
        tag = el('text', {
          x: r1(x(row.closed.size) + 3),
          y: y.tag,
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          'text-anchor': 'end',
        }, parent);
        tag.textContent = t('label.size', '{size} bytes · padding {pad}', {
          size: row.closed.size,
          pad: row.closed.size - fieldBytes(scene.fields),
        });
      }
      handles.frames.set(key, { rect, tag });
    }
  }

  function drawStatic(scene: FieldOrderSizeScene): Handles {
    svg.textContent = '';
    const handles: Handles = { blocks: new Map(), gaps: new Map(), frames: new Map(), afterRow: null };
    el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg }, svg);
    const cap = el('text', {
      x: MARGIN,
      y: CAPTION_Y,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    }, svg);
    cap.textContent = caption(scene);
    if (scene.fields.length === 0) return handles;

    drawRow(scene, 'before', scene.before, el('g', {}, svg), handles);
    if (scene.after) {
      const g = el('g', {}, svg);
      handles.afterRow = g;
      drawRow(scene, 'after', scene.after, g, handles);
    }
    return handles;
  }

  function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      let start: number | null = null;
      const finish = (): void => {
        if (done) return;
        done = true;
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const tick = (now: number): void => {
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        if (start === null) start = now;
        const k = Math.min(1, (now - start) / ms);
        frame(k);
        if (k >= 1) {
          finish();
          return;
        }
        schedule();
      };
      const schedule = (): void => {
        const id = requestAnimationFrame((now) => {
          frames.delete(id);
          tick(now);
        });
        frames.add(id);
      };
      schedule();
    });
  }

  function shift(node: Element, dx: number, dy: number): void {
    const tx = r1(dx);
    const ty = r1(dy);
    if (tx === 0 && ty === 0) node.removeAttribute('transform');
    else node.setAttribute('transform', `translate(${tx} ${ty})`);
  }

  async function render(
    next: FieldOrderSizeScene,
    prev: FieldOrderSizeScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    const mine = (gen += 1);
    const h = drawStatic(next);
    const step = next.step;
    if (!opts.animate || destroyed || !prev || !step) return;
    const unit = unitOf(next);

    if (step.kind === 'place') {
      const block = h.blocks.get(`before:${step.field}`);
      const gap = h.gaps.get(`before:${step.field}`);
      if (!block) return;
      const slide = (step.offset - step.from) * unit;
      const ms = slide > 0 ? 640 : 380;
      const land = slide > 0 ? 0.4 : 1;
      await tween(ms, mine, (k) => {
        const a = ease(part(k, 0, land));
        const b = ease(part(k, land, 1));
        shift(block, -slide * (1 - b), -DROP * (1 - a));
        block.setAttribute('opacity', String(r1(a)));
        if (gap) gap.setAttribute('opacity', String(r1(b)));
      });
    } else if (step.kind === 'move') {
      const block = h.blocks.get(`after:${step.field}`);
      const gap = h.gaps.get(`after:${step.field}`);
      const was = next.before.slots.find((s: FieldOrderSizeSlot) => s.field === step.field);
      if (!block || !was) return;
      const dx = (was.offset - step.offset) * unit;
      const dy = ROWS.before.bar - ROWS.after.bar;
      await tween(760, mine, (k) => {
        const e = ease(k);
        // 살짝 둥근 길 — 위로 떴다가 내려앉는다
        const lift = Math.sin(Math.PI * k) * 14;
        shift(block, dx * (1 - e), dy * (1 - e) - lift);
        if (gap) gap.setAttribute('opacity', String(r1(part(k, 0.5, 1))));
      });
    } else if (step.kind === 'close') {
      const frame = h.frames.get(step.row);
      const tail = h.gaps.get(`${step.row}:tail`);
      if (!frame) return;
      const fromSize = step.row === 'after' ? (next.before.closed?.size ?? step.size) : step.end;
      const delta = (fromSize - step.size) * unit;
      // 끝 자리의 테두리 폭 — 정적 그리기와 같은 셈
      const base = r1(r1(MARGIN + step.size * unit) - MARGIN + 6);
      await tween(delta === 0 ? 400 : 820, mine, (k) => {
        const e = ease(k);
        const d = delta * (1 - e);
        frame.rect.setAttribute('width', String(r1(base + d)));
        if (frame.tag) shift(frame.tag, d, 0);
        if (tail) tail.setAttribute('opacity', String(r1(part(k, 0.5, 1))));
      });
    } else if (step.kind === 'reorder') {
      const g = h.afterRow;
      if (!g) return;
      await tween(420, mine, (k) => {
        const e = ease(k);
        g.setAttribute('opacity', String(r1(e)));
        shift(g, 0, -12 * (1 - e));
      });
    } else {
      return;
    }
    if (mine !== gen || destroyed) return;
    drawStatic(next);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    svg.textContent = '';
  }

  return { render, destroy };
}

export const fieldOrderSizeStageView: CanvasView = {
  canvas: { height: H },
  mount,
};
