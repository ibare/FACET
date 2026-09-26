/**
 * fast-forward 의 무대.
 *
 * 커밋은 뿌리에서 끝까지 한 줄로 놓이고, 부모를 가리키는 화살이 그 사이를 잇는다.
 * 받는 쪽 이름표(HEAD 가 딸려 있다)는 줄 아래에, 나머지 이름표는 줄 위에 선다.
 * - 판정 걸음: 합칠 쪽 커밋에서 받는 쪽 커밋까지 거슬러 간 길의 부모 화살이 차례로 칠해지고, 병합 기준점이 테를 두른다
 * - 건너감 걸음: 받는 쪽 이름표가 중간 커밋에 서지 않고 한 번의 도약으로 건너가고, 지나친 커밋이 차례로 칠해진다
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
} from '@ffacet/core/runtime';
import type { FastForwardScene } from './scene.js';

const H = 280;
const SVG_NS = 'http://www.w3.org/2000/svg';
const ROW_Y = 100;
const SIDE_MARGIN = 70;
const R_MAX = 22;
const TAG_H = 22;
const STEM = 14;
const HEAD_GAP = 8;
const ARC = 24;
const TRACE_MS = 900;
const JUMP_MS = 800;

type Handles = {
  /** 거슬러 간 길의 화살 — 합칠 쪽 커밋에서 가까운 것부터 */
  walkArrows: { line: SVGLineElement; head: SVGPolygonElement }[];
  baseRing: SVGCircleElement | null;
  mover: SVGGElement | null;
  crossedDots: { id: string; x: number; circle: SVGCircleElement; label: SVGTextElement }[];
};

function round(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const fastForwardStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);
    const charW = smPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function xOf(scene: FastForwardScene, id: string): number {
      const i = scene.commits.findIndex((c) => c.id === id);
      if (i < 0) throw new Error(`fast-forward stage: 없는 커밋 ${id}`);
      const n = scene.commits.length;
      if (n === 1) return PIECE_CANVAS_W / 2;
      return SIDE_MARGIN + ((PIECE_CANVAS_W - 2 * SIDE_MARGIN) * i) / (n - 1);
    }

    function radius(scene: FastForwardScene): number {
      const n = scene.commits.length;
      const gap = n > 1 ? (PIECE_CANVAS_W - 2 * SIDE_MARGIN) / (n - 1) : PIECE_CANVAS_W;
      return Math.min(R_MAX, gap * 0.18);
    }

    function tagWidth(text: string): number {
      return text.length * charW + 16;
    }

    function drawTag(g: Element, cx: number, top: number, text: string, style: 'into' | 'other' | 'head'): void {
      const w = tagWidth(text);
      const rect: Record<string, string | number> = { x: cx - w / 2, y: top, width: w, height: TAG_H, rx: 4 };
      if (style === 'into') {
        el(g, 'rect', { ...rect, fill: colors.primary });
      } else if (style === 'other') {
        el(g, 'rect', { ...rect, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 });
      } else {
        el(g, 'rect', { ...rect, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2' });
      }
      const label = el(g, 'text', {
        x: cx,
        y: top + TAG_H / 2 + smPx * 0.35,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: style === 'into' ? colors.textInverse : style === 'other' ? colors.text : colors.textMuted,
      });
      label.textContent = text;
    }

    function captionLines(scene: FastForwardScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') {
        const into = scene.branches.find((b) => b.name === scene.into);
        const from = scene.branches.find((b) => b.name === scene.from);
        if (!into || !from) throw new Error('fast-forward stage: 합칠 쪽 또는 받는 쪽 이름이 장면에 없다');
        return [
          t('caption.start', '{from} → {fromAt} · {into} → {intoAt} · HEAD → {head}', {
            from: scene.from,
            fromAt: from.at,
            into: scene.into,
            intoAt: into.at,
            head: scene.head,
          }),
          t('caption.count', 'Commits: {n}', { n: scene.commits.length }),
        ];
      }
      if (step.kind === 'judge' && scene.walk) {
        return [
          t('caption.walk', 'Back from {from}: {path}', { from: scene.from, path: scene.walk.path.join(' ') }),
          t('caption.base', 'On the path: the commit of {into} — merge base: {base}', {
            into: scene.into,
            base: scene.walk.base,
          }),
        ];
      }
      if (step.kind === 'jump') {
        return [
          t('caption.jump', '{name}: {from} → {to}, in one move', { name: step.name, from: step.from, to: step.to }),
          t('caption.crossed', 'Commits passed over: {crossed}', { crossed: scene.crossed.join(' ') }),
        ];
      }
      if (step.kind === 'tally' && scene.tally) {
        return [
          t('caption.tally', 'New commits: {made} · Names moved: {moved} · Commits: {before} → {after}', {
            made: scene.tally.made,
            moved: scene.tally.moved,
            before: scene.tally.before,
            after: scene.tally.after,
          }),
          t('caption.reach', 'Newly reachable from {into}: {reach}', { into: scene.into, reach: scene.tally.reach }),
        ];
      }
      throw new Error(`fast-forward stage: 장면의 걸음 ${step.kind} 에 필요한 자취가 없다`);
    }

    function drawStatic(scene: FastForwardScene): Handles {
      svg.textContent = '';
      const handles: Handles = { walkArrows: [], baseRing: null, mover: null, crossedDots: [] };
      const r = radius(scene);
      const walked = new Map<string, number>();
      if (scene.walk) {
        const p = scene.walk.path;
        for (let i = 0; i + 1 < p.length; i += 1) walked.set(`${p[i]}>${p[i + 1]}`, i);
      }
      const walkArrows: ({ line: SVGLineElement; head: SVGPolygonElement } | undefined)[] = [];

      // 부모를 가리키는 화살 (자식 → 부모)
      const arrows = el(svg, 'g', {});
      for (const c of scene.commits) {
        for (const p of c.parents) {
          const x1 = xOf(scene, c.id) - r - 3;
          const x2 = xOf(scene, p) + r + 3;
          const order = walked.get(`${c.id}>${p}`);
          const on = order !== undefined;
          const ink = on ? colors.itemComparing : colors.textMuted;
          const line = el(arrows, 'line', { x1, y1: ROW_Y, x2: x2 + 8, y2: ROW_Y, stroke: ink, 'stroke-width': on ? 3 : 1.5 });
          const head = el(arrows, 'polygon', {
            points: `${round(x2)},${ROW_Y} ${round(x2 + 9)},${ROW_Y - 5} ${round(x2 + 9)},${ROW_Y + 5}`,
            fill: ink,
          });
          if (on) walkArrows[order] = { line, head };
        }
      }
      for (const a of walkArrows) {
        if (!a) throw new Error('fast-forward stage: 거슬러 간 길에 부모 화살이 없는 칸이 있다');
        handles.walkArrows.push(a);
      }

      // 커밋
      const crossed = new Set(scene.crossed);
      const base = scene.walk ? scene.walk.base : null;
      for (const c of scene.commits) {
        const x = xOf(scene, c.id);
        const lit = crossed.has(c.id);
        const circle = el(svg, 'circle', {
          cx: x,
          cy: ROW_Y,
          r,
          fill: lit ? colors.accent : colors.bg,
          stroke: c.id === base ? colors.itemComparing : colors.text,
          'stroke-width': c.id === base ? 4 : 1.5,
        });
        if (c.id === base) handles.baseRing = circle;
        const label = el(svg, 'text', {
          x,
          y: ROW_Y + mdPx * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: lit ? colors.stateInk : colors.text,
        });
        label.textContent = c.id;
        if (lit) handles.crossedDots.push({ id: c.id, x, circle, label });
      }

      // 이름표 — 받는 쪽은 줄 아래(HEAD 가 그 밑에 딸린다), 나머지는 줄 위
      for (const b of scene.branches) {
        const x = xOf(scene, b.at);
        const g = el(svg, 'g', {});
        if (b.name === scene.into) {
          const top = ROW_Y + r + STEM;
          el(g, 'line', { x1: x, y1: ROW_Y + r, x2: x, y2: top, stroke: colors.primary, 'stroke-width': 1.5 });
          drawTag(g, x, top, b.name, 'into');
          if (scene.head === b.name) {
            const hTop = top + TAG_H + HEAD_GAP;
            el(g, 'line', { x1: x, y1: top + TAG_H, x2: x, y2: hTop, stroke: colors.textMuted, 'stroke-width': 1 });
            drawTag(g, x, hTop, 'HEAD', 'head');
          }
          handles.mover = g;
        } else {
          const bottom = ROW_Y - r - STEM;
          el(g, 'line', { x1: x, y1: bottom, x2: x, y2: ROW_Y - r, stroke: colors.border, 'stroke-width': 1.5 });
          drawTag(g, x, bottom - TAG_H, b.name, 'other');
          if (scene.head === b.name) {
            const hTop = bottom - TAG_H - HEAD_GAP - TAG_H;
            drawTag(g, x, hTop, 'HEAD', 'head');
          }
        }
      }

      const [line1, line2] = captionLines(scene);
      const c1 = el(svg, 'text', {
        x: PIECE_CANVAS_W / 2,
        y: H - 38,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      c1.textContent = line1;
      const c2 = el(svg, 'text', {
        x: PIECE_CANVAS_W / 2,
        y: H - 16,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      c2.textContent = line2;
      return handles;
    }

    async function render(next: FastForwardScene, prev: FastForwardScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || prev === null) return;
      const step = next.step;

      if (step.kind === 'judge' && handles.walkArrows.length > 0) {
        // 합칠 쪽 커밋에서부터 부모 화살이 하나씩 칠해지고, 끝에 닿은 커밋이 테를 두른다
        const walkArrows = handles.walkArrows;
        const ring = handles.baseRing;
        const n = walkArrows.length;
        const paint = (p: number): void => {
          walkArrows.forEach((a, i) => {
            const on = p * n >= i + 1;
            const ink = on ? colors.itemComparing : colors.textMuted;
            a.line.setAttribute('stroke', ink);
            a.line.setAttribute('stroke-width', on ? '3' : '1.5');
            a.head.setAttribute('fill', ink);
          });
          if (ring) {
            ring.setAttribute('stroke', p >= 1 ? colors.itemComparing : colors.text);
            ring.setAttribute('stroke-width', p >= 1 ? '4' : '1.5');
          }
        };
        paint(0);
        await tween(TRACE_MS, mine, paint);
        if (mine === gen && !destroyed) drawStatic(next);
        return;
      }

      if (step.kind === 'jump' && handles.mover) {
        const mover = handles.mover;
        const x0 = xOf(next, step.from);
        const x1 = xOf(next, step.to);
        const dx = x0 - x1;
        const dots = handles.crossedDots;
        const paint = (tagX: number): void => {
          for (const d of dots) {
            const reached = x1 >= x0 ? tagX >= d.x - 1 : tagX <= d.x + 1;
            d.circle.setAttribute('fill', reached ? colors.accent : colors.bg);
            d.label.setAttribute('fill', reached ? colors.stateInk : colors.text);
          }
        };
        mover.setAttribute('transform', `translate(${round(dx)} 0)`);
        paint(x0);
        await tween(JUMP_MS, mine, (p) => {
          const e = ease(p);
          const tx = dx * (1 - e);
          const ty = ARC * Math.sin(Math.PI * e);
          mover.setAttribute('transform', `translate(${round(tx)} ${round(ty)})`);
          paint(x1 + tx);
        });
        if (mine === gen && !destroyed) drawStatic(next);
      }
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
