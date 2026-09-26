/**
 * leaves-linked-stage — 범위 질의를 읽는 틀이 한 번 내려간 뒤 잎 줄을 따라 옆으로 건너간다.
 *
 * 위에서 아래로: 질의 (SQL — 이 분야의 소재라 가상 표기로 옮기지 않는다) · 트리 (뿌리 · 안쪽 · 잎 줄) ·
 * 잡은 열쇠 줄 · 캡션 · 셈. 주인공은 잎 줄 위의 가로 걸음이다 — 읽는 틀이 잎에서 잎으로 미끄러지고
 * 이음 선이 그 뒤를 따라 칠해진다. 잡은 열쇠는 잎에서 떨어져 나와 아래 줄에 차례로 쌓인다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LeavesLinkedScene, ScenePage } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 390;
const W = PIECE_CANVAS_W;
const MARGIN = 12;

const QUERY_Y = 22;
/** 트리 층마다 페이지 윗변 — 뿌리 · 안쪽 · 잎 */
const LEVEL_TOPS = [54, 120, 192];
const INNER_H = 24;
const LEAF_H = 40;
/** 잎 사이 틈 — 이음 화살이 여기 선다 */
const LEAF_GAP_MAX = 22;
const INNER_PAD = 6;
const FRAME_PAD = 4;

const TRAY_LABEL_Y = 268;
const TRAY_TOP = 278;
const CHIP_H = 36;
const CHIP_W_MAX = 44;
const CAPTION_Y = 346;
const COUNT_Y = 372;

const MOVE_MS = 600;

type Box = { x: number; y: number; w: number; h: number };
type Layout = {
  boxes: Map<string, Box>;
  /** 안쪽 페이지의 가리킴 자리 (아래 변) */
  pointers: Map<string, { x: number; y: number }[]>;
  cellW: number;
  chipSlot: number;
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = s;
  return node;
}

/** 페이지 자리 — 뿌리에서 층을 나눠 잎을 폭에 고르게 펴고, 안쪽 페이지는 제 아이들 위 가운데에 둔다. */
function layoutOf(scene: LeavesLinkedScene): Layout | null {
  const byId = new Map(scene.pages.map((p) => [p.id, p] as const));
  const levels: ScenePage[][] = [];
  let row: ScenePage[] = [];
  const root = byId.get(scene.root);
  if (root === undefined) return null;
  row = [root];
  while (row.length > 0) {
    levels.push(row);
    const next: ScenePage[] = [];
    for (const p of row) {
      if (p.kind === 'inner') {
        for (const c of p.children) {
          const child = byId.get(c);
          if (child === undefined) throw new Error(`leaves-linked-stage: 페이지 ${c} 가 없다`);
          next.push(child);
        }
      }
    }
    row = next;
  }
  const leaves = levels[levels.length - 1] ?? [];
  const n = leaves.length;
  if (n === 0) return null;
  const maxEntries = Math.max(...leaves.map((p) => (p.kind === 'leaf' ? p.entries.length : 1)));
  const totalEntries = leaves.reduce((s, p) => s + (p.kind === 'leaf' ? p.entries.length : 0), 0);
  const span = W - 2 * MARGIN;
  const gap = Math.min(LEAF_GAP_MAX, span / (n * 4));
  const leafW = (span - gap * (n - 1)) / n;
  const cellW = leafW / maxEntries;
  const boxes = new Map<string, Box>();
  const pointers = new Map<string, { x: number; y: number }[]>();
  const leafTop = LEVEL_TOPS[Math.min(levels.length - 1, LEVEL_TOPS.length - 1)] as number;
  leaves.forEach((p, i) => {
    boxes.set(p.id, { x: MARGIN + i * (leafW + gap), y: leafTop, w: leafW, h: LEAF_H });
  });
  // 안쪽 층은 아래에서 위로 — 아이들의 가운데 위
  for (let li = levels.length - 2; li >= 0; li -= 1) {
    const top = LEVEL_TOPS[Math.min(li, LEVEL_TOPS.length - 1)] as number;
    for (const p of levels[li] ?? []) {
      if (p.kind !== 'inner') continue;
      const kids = p.children.map((c) => boxes.get(c));
      const first = kids[0];
      const lastKid = kids[kids.length - 1];
      if (first === undefined || lastKid === undefined) continue;
      const mid = (first.x + lastKid.x + lastKid.w) / 2;
      const w = p.keys.length * cellW + 2 * INNER_PAD;
      const box = { x: mid - w / 2, y: top, w, h: INNER_H };
      boxes.set(p.id, box);
      pointers.set(
        p.id,
        p.children.map((_, i) => ({ x: box.x + INNER_PAD + i * cellW, y: box.y + INNER_H })),
      );
    }
  }
  const chipSlot = Math.min(CHIP_W_MAX + 4, span / Math.max(1, totalEntries));
  return { boxes, pointers, cellW, chipSlot };
}

type Handles = {
  frame: SVGRectElement | null;
  trail: { line: SVGLineElement; x1: number; y1: number; x2: number; y2: number } | null;
  chips: { g: SVGGElement; fromX: number; fromY: number; toX: number; toY: number }[];
  stopMark: SVGElement | null;
};

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const leavesLinkedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: LeavesLinkedScene): Handles {
      svg.textContent = '';
      const handles: Handles = { frame: null, trail: null, chips: [], stopMark: null };
      const lay = scene.pages.length === 0 ? null : layoutOf(scene);
      if (lay === null) return handles;

      const readSet = new Set(scene.reads.map((r) => r.page));
      const boxOf = (id: string): Box => {
        const b = lay.boxes.get(id);
        if (b === undefined) throw new Error(`leaves-linked-stage: 페이지 ${id} 의 자리가 없다`);
        return b;
      };

      // 질의 · 인덱스
      label(svg, MARGIN, QUERY_Y, scene.query, {
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      label(svg, W - MARGIN, QUERY_Y, `${scene.index} (${scene.column})`, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
        'text-anchor': 'end',
      });

      const base = el(svg, 'g', {});
      const trailLayer = el(svg, 'g', {});
      const pageLayer = el(svg, 'g', {});
      const chipLayer = el(svg, 'g', {});
      const frameLayer = el(svg, 'g', {});

      // 트리 가지 · 잎 이음 (바탕)
      const edgeEnd = (parent: string, i: number, child: string) => {
        const pt = (lay.pointers.get(parent) ?? [])[i];
        if (pt === undefined) throw new Error(`leaves-linked-stage: ${parent} 의 가리킴 ${i} 가 없다`);
        const cb = boxOf(child);
        return { x1: pt.x, y1: pt.y, x2: cb.x + cb.w / 2, y2: cb.y };
      };
      const linkEnd = (a: string, b: string) => {
        const ab = boxOf(a);
        const bb = boxOf(b);
        const y = ab.y + LEAF_H / 2;
        return { x1: ab.x + ab.w, y1: y, x2: bb.x, y2: y };
      };
      for (const p of scene.pages) {
        if (p.kind === 'inner') {
          p.children.forEach((ch, i) => {
            const e = edgeEnd(p.id, i, ch);
            el(base, 'line', { ...e, stroke: c.border, 'stroke-width': 1 });
            el(base, 'circle', { cx: e.x1, cy: e.y1, r: 2, fill: c.textMuted });
          });
        } else if (p.next !== null) {
          const e = linkEnd(p.id, p.next);
          el(base, 'line', { x1: e.x1 + 2, y1: e.y1, x2: e.x2 - 5, y2: e.y2, stroke: c.textMuted, 'stroke-width': 1.2 });
          el(base, 'path', {
            d: `M ${r2(e.x2)} ${r2(e.y2)} l -6 -4 l 0 8 z`,
            fill: c.textMuted,
          });
        }
      }

      // 자취 — 읽은 차례대로 앞 페이지와 잇는 선 (내려가기는 가지, 옆으로는 이음)
      scene.reads.forEach((r, i) => {
        const prevRead = scene.reads[i - 1];
        if (prevRead === undefined) return;
        let e: { x1: number; y1: number; x2: number; y2: number };
        if (r.via === 'side') {
          const l = linkEnd(prevRead.page, r.page);
          e = { x1: l.x1, y1: l.y1, x2: l.x2 - 6, y2: l.y2 };
        } else {
          const pp = scene.pages.find((q) => q.id === prevRead.page);
          if (pp === undefined || pp.kind !== 'inner') {
            throw new Error(`leaves-linked-stage: ${r.page} 로 내려온 부모가 안쪽 페이지가 아니다`);
          }
          const ci = pp.children.indexOf(r.page);
          if (ci < 0) throw new Error(`leaves-linked-stage: ${pp.id} 아래에 ${r.page} 가 없다`);
          e = edgeEnd(pp.id, ci, r.page);
        }
        const line = el(trailLayer, 'line', {
          ...e,
          stroke: c.primary,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        if (i === scene.reads.length - 1) handles.trail = { line, ...e };
      });

      // 페이지
      const pickedKeys = new Set(scene.picked.map((q) => `${q.page}:${q.key}`));
      const skippedKeys = new Set(scene.skipped.map((q) => `${q.page}:${q.key}`));
      const cellPos = new Map<string, { x: number; y: number }>();
      for (const p of scene.pages) {
        const b = boxOf(p.id);
        const read = readSet.has(p.id);
        el(pageLayer, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 3,
          fill: read ? c.bgSubtle : c.bg,
          stroke: read ? c.text : c.border,
          'stroke-width': read ? 1.4 : 1,
        });
        label(pageLayer, b.x, b.y - FRAME_PAD - 4, p.id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: read ? c.text : c.textMuted,
        });
        if (p.kind === 'inner') {
          p.keys.forEach((k, i) => {
            label(pageLayer, b.x + INNER_PAD + (i + 0.5) * lay.cellW, b.y + INNER_H / 2 + smPx * 0.35, String(k), {
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
              fill: read ? c.text : c.textMuted,
            });
          });
        } else {
          p.entries.forEach((e, i) => {
            const cx = b.x + (i + 0.5) * lay.cellW;
            const id = `${p.id}:${e.key}`;
            cellPos.set(id, { x: cx, y: b.y + LEAF_H / 2 });
            const picked = pickedKeys.has(id);
            const skipped = skippedKeys.has(id);
            const stopped = scene.stop !== null && scene.stop.page === p.id && scene.stop.key === e.key;
            if (picked) {
              el(pageLayer, 'rect', {
                x: b.x + i * lay.cellW + 2,
                y: b.y + 2,
                width: lay.cellW - 4,
                height: LEAF_H - 4,
                rx: 2,
                fill: c.primary,
                'fill-opacity': 0.16,
              });
            }
            if (stopped) {
              handles.stopMark = el(pageLayer, 'rect', {
                x: b.x + i * lay.cellW + 2,
                y: b.y + 2,
                width: lay.cellW - 4,
                height: LEAF_H - 4,
                rx: 2,
                fill: 'none',
                stroke: c.danger,
                'stroke-width': 1.8,
              });
            }
            const keyY = b.y + 17;
            const keyColor = stopped ? c.danger : skipped || !read ? c.textMuted : c.text;
            label(pageLayer, cx, keyY, String(e.key), {
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
              fill: keyColor,
            });
            if (skipped) {
              el(pageLayer, 'line', {
                x1: cx - smPx * 0.75,
                y1: keyY - smPx * 0.35,
                x2: cx + smPx * 0.75,
                y2: keyY - smPx * 0.35,
                stroke: c.textMuted,
                'stroke-width': 1,
              });
            }
            label(pageLayer, cx, b.y + LEAF_H - 7, e.row, {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              fill: c.textMuted,
            });
          });
        }
      }

      // 잡은 열쇠 줄 — 잡은 차례대로
      label(svg, MARGIN, TRAY_LABEL_Y, t('label.picked', 'Picked: {n}', { n: scene.picked.length }), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      const chipW = lay.chipSlot - 4;
      const step = scene.step;
      const thisStepPicks = step.kind === 'leaf' ? scene.picked.filter((q) => q.page === step.page).length : 0;
      scene.picked.forEach((q, i) => {
        const x = MARGIN + i * lay.chipSlot;
        const g = el(chipLayer, 'g', {});
        el(g, 'rect', { x: 0, y: 0, width: chipW, height: CHIP_H, rx: 3, fill: c.primary });
        label(g, chipW / 2, 15, String(q.key), {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: c.textInverse,
        });
        label(g, chipW / 2, CHIP_H - 6, q.row, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: c.textInverse,
        });
        g.setAttribute('transform', `translate(${r2(x)} ${r2(TRAY_TOP)})`);
        if (i >= scene.picked.length - thisStepPicks) {
          const src = cellPos.get(`${q.page}:${q.key}`);
          if (src === undefined) throw new Error(`leaves-linked-stage: 잡은 열쇠 ${q.key} 의 칸이 없다`);
          handles.chips.push({ g, fromX: src.x - chipW / 2, fromY: src.y - CHIP_H / 2, toX: x, toY: TRAY_TOP });
        }
      });

      // 읽는 틀 — 지금 읽는 페이지
      if (step.kind !== 'start') {
        const b = boxOf(step.page);
        handles.frame = el(frameLayer, 'rect', {
          x: b.x - FRAME_PAD,
          y: b.y - FRAME_PAD,
          width: b.w + 2 * FRAME_PAD,
          height: b.h + 2 * FRAME_PAD,
          rx: 5,
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 2.5,
        });
      }

      // 캡션
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Start at the root and look for the leaf where {lo} belongs.', { lo: scene.lo });
      } else if (step.kind === 'inner') {
        caption = t('caption.inner', 'Read {page}. Key {lo} leads down to {child}.', {
          page: step.page,
          lo: scene.lo,
          child: step.child,
        });
      } else if (step.stop !== null) {
        caption = t('caption.stop', 'Leaf {page}: {key} > {hi}, so stop here.', {
          page: step.page,
          key: step.stop,
          hi: scene.hi,
        });
      } else if (step.via === 'down') {
        caption = t('caption.leafDown', 'Reached leaf {page}. Keys below {lo} are passed over.', {
          page: step.page,
          lo: scene.lo,
        });
      } else if (step.cross) {
        caption = t('caption.sideCross', 'A different parent, yet no climb back up. Straight across: {page}', {
          page: step.page,
        });
      } else {
        caption = t('caption.side', 'Over to the next leaf by its link: {page}', { page: step.page });
      }
      label(svg, MARGIN, CAPTION_Y, caption, {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });

      // 셈 — 읽은 페이지 (내려가기 · 옆으로)
      const down = scene.reads.filter((r) => r.via === 'down').length;
      const side = scene.reads.length - down;
      const counts = [
        t('label.pagesRead', 'Pages read: {n}', { n: scene.reads.length }),
        t('label.down', 'Down: {n}', { n: down }),
        t('label.side', 'Sideways: {n}', { n: side }),
      ];
      label(svg, MARGIN, COUNT_Y, counts.join('   '), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });

      return handles;
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start = -1;
        let id = 0;
        const done = () => {
          frames.delete(id);
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number) => {
          frames.delete(id);
          if (destroyed || mine !== gen) return done();
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / ms);
          draw(p);
          if (p >= 1) return done();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    async function render(next: LeavesLinkedScene, _prev: LeavesLinkedScene | null, opts: { animate: boolean }) {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step.kind === 'start') return;

      const lay = layoutOf(next);
      if (lay === null) return;
      const to = lay.boxes.get(step.page);
      if (to === undefined) return;
      const fromBox = step.from === null ? null : (lay.boxes.get(step.from) ?? null);
      // 뿌리를 처음 짚을 때는 틀이 크게 벌어졌다가 조여든다
      const start: Box =
        fromBox ?? { x: to.x - 18, y: to.y - 12, w: to.w + 36, h: to.h + 24 };

      const trail = h.trail;

      const draw = (p: number) => {
        // 앞 절반: 틀이 옮겨 가고 자취 선이 그 뒤를 따라 칠해진다
        const q = easeInOut(Math.min(1, p / 0.5));
        if (h.frame) {
          const x = start.x + (to.x - start.x) * q;
          const y = start.y + (to.y - start.y) * q;
          const w = start.w + (to.w - start.w) * q;
          const hh = start.h + (to.h - start.h) * q;
          h.frame.setAttribute('x', String(r2(x - FRAME_PAD)));
          h.frame.setAttribute('y', String(r2(y - FRAME_PAD)));
          h.frame.setAttribute('width', String(r2(w + 2 * FRAME_PAD)));
          h.frame.setAttribute('height', String(r2(hh + 2 * FRAME_PAD)));
        }
        if (trail) {
          trail.line.setAttribute('x2', String(r2(trail.x1 + (trail.x2 - trail.x1) * q)));
          trail.line.setAttribute('y2', String(r2(trail.y1 + (trail.y2 - trail.y1) * q)));
        }
        // 뒤 절반: 잡은 열쇠가 잎에서 떨어져 아래 줄 제자리로
        const f = easeInOut(Math.max(0, Math.min(1, (p - 0.45) / 0.55)));
        h.chips.forEach((ch) => {
          const x = ch.fromX + (ch.toX - ch.fromX) * f;
          const y = ch.fromY + (ch.toY - ch.fromY) * f;
          ch.g.setAttribute('transform', `translate(${r2(x)} ${r2(y)})`);
          if (f <= 0) ch.g.setAttribute('visibility', 'hidden');
          else ch.g.removeAttribute('visibility');
        });
        if (h.stopMark) {
          if (p < 0.5) h.stopMark.setAttribute('visibility', 'hidden');
          else h.stopMark.removeAttribute('visibility');
        }
      };
      draw(0);
      await tween(MOVE_MS, mine, draw);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
