/**
 * non-atomic-increment 무대 — 한 줄이 세 줄로 펼쳐지고, 값이 기억 자리에서 레지스터로 내려가
 * 거기서 바뀐 뒤 기억 자리로 올라간다.
 *
 * 왼쪽은 코드. 겉의 한 줄 아래로 펼친 줄이 미끄러져 내려와 서고, 그 사이에 틈이 드러난다.
 * 오른쪽은 두 자리. 위가 모두가 보는 기억 자리, 아래가 스레드 상자 안의 레지스터다.
 * 값 조각이 위아래로 실제로 오가고, 두 자리의 값이 다를 때 둘 사이에 ≠ 가 선다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { MicroKind, NonAtomicIncrementScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const UNFOLD_MS = 800;
const MOVE_MS = 700;
const ADD_MS = 600;

type Attrs = Record<string, string | number>;

/** 좌표 끝자리와 -0 을 걷어 낸다. */
function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function node(tag: string, attrs: Attrs, parent: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(e);
  return e;
}

function label(parent: Element, x: number, y: number, body: string, attrs: Attrs): SVGElement {
  const e = node('text', { x, y, 'dominant-baseline': 'middle', ...attrs }, parent);
  e.textContent = body;
  return e;
}

/** 캔버스 폭에서 역산한 자리. 상수는 상한 · 비율만 쥔다. */
function geometry(rows: number) {
  const W = PIECE_CANVAS_W;
  const codeX = Math.round(W * 0.065);
  const codeW = Math.min(330, Math.round(W * 0.5));
  const outerY = 44;
  const rowH = 34;
  const rowTop = 110;
  const rowBottom = 222;
  const pitch = rows > 1 ? (rowBottom - rowTop) / (rows - 1) : 0;
  const rowY = (i: number) => rowTop + pitch * i;
  const slotX = Math.round(W * 0.8);
  const cellW = Math.min(110, Math.round(W * 0.17));
  const memY = 64;
  const regY = 222;
  return { W, codeX, codeW, outerY, rowH, rowY, pitch, slotX, cellW, memY, regY };
}

export const nonAtomicIncrementStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = now();
        let over = false;
        const finish = () => {
          if (over) return;
          over = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
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

    function tagText(k: MicroKind): string {
      if (k === 'load') return t('tag.load', 'read');
      if (k === 'add') return t('tag.add', 'add');
      return t('tag.store', 'write');
    }

    function caption(s: NonAtomicIncrementScene): string {
      const vars = { m: s.memory, r: s.register ?? '' };
      const step = s.step;
      if (step === null) return t('caption.line', 'One line of code, about to run.');
      if (step.kind === 'unfold') {
        return t('caption.unfold', 'The CPU runs it as separate steps. Steps: {n} · Gaps: {g}', {
          n: s.kinds.length,
          g: s.gaps,
        });
      }
      if (step.kind === 'load') {
        return t('caption.load', 'Read: the memory value is copied into the register. Memory: {m} · Register: {r}', vars);
      }
      if (step.kind === 'add') {
        return t('caption.add', 'Add: only the register changes. Memory: {m} · Register: {r}', vars);
      }
      return t('caption.store', 'Write: the register value is copied back to memory. Memory: {m} · Register: {r}', vars);
    }

    /** 운동이 만질 손잡이 — 정적 그리기가 매번 새로 짓는다. */
    type Handles = {
      rows: SVGElement[];
      gapMarks: SVGElement[];
      marker: SVGElement | null;
      memValue: SVGElement;
      regValue: SVGElement | null;
      differMark: SVGElement | null;
      motion: SVGElement;
    };

    function drawStatic(s: NonAtomicIncrementScene): Handles {
      svg.textContent = '';
      const g = geometry(s.steps.length);
      const root = node('g', {}, svg);

      // ── 겉의 한 줄
      const outer = node('g', {}, root);
      node(
        'rect',
        {
          x: g.codeX,
          y: g.outerY - g.rowH / 2,
          width: g.codeW,
          height: g.rowH,
          rx: 5,
          fill: s.unfolded ? colors.bg : colors.bgSubtle,
          stroke: s.unfolded ? colors.border : colors.text,
          'stroke-width': s.unfolded ? 1 : 1.5,
          ...(s.unfolded ? { 'stroke-dasharray': '4 3' } : {}),
        },
        outer,
      );
      label(outer, g.codeX + 14, g.outerY, s.line, {
        fill: s.unfolded ? colors.textMuted : colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
      });

      // ── 펼친 줄과 틈
      const rows: SVGElement[] = [];
      const gapMarks: SVGElement[] = [];
      if (s.unfolded) {
        for (let i = 0; i + 1 < s.steps.length; i += 1) {
          const gy = g.rowY(i) + g.pitch / 2;
          const mark = node('g', {}, root);
          node(
            'line',
            {
              x1: g.codeX + 6,
              x2: g.codeX + g.codeW - 6,
              y1: gy,
              y2: gy,
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '2 4',
            },
            mark,
          );
          label(mark, g.codeX + g.codeW + 8, gy, t('label.gap', 'gap'), {
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          });
          gapMarks.push(mark);
        }
        s.steps.forEach((text, i) => {
          const row = node('g', {}, root);
          const on = i === s.current;
          const ranPast = i < s.current;
          node(
            'rect',
            {
              x: g.codeX,
              y: g.rowY(i) - g.rowH / 2,
              width: g.codeW,
              height: g.rowH,
              rx: 5,
              fill: on ? colors.bgSubtle : colors.bg,
              stroke: on ? colors.itemActive : colors.border,
              'stroke-width': on ? 2 : 1,
            },
            row,
          );
          label(row, g.codeX + 14, g.rowY(i), text, {
            fill: ranPast ? colors.textMuted : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          });
          const kind = s.kinds[i];
          if (kind !== undefined) {
            label(row, g.codeX + g.codeW - 12, g.rowY(i), tagText(kind), {
              fill: on ? colors.itemActive : colors.textMuted,
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'text-anchor': 'end',
            });
          }
          rows.push(row);
        });
      }

      // ── 지금 줄 표지
      let markerY: number | null = null;
      if (!s.unfolded) markerY = g.outerY;
      else if (s.current >= 0) markerY = g.rowY(s.current);
      let marker: SVGElement | null = null;
      if (markerY !== null) {
        const mx = g.codeX - 8;
        marker = node('g', { transform: `translate(0 ${round(markerY)})` }, root);
        node('path', { d: `M ${round(mx - 10)} -7 L ${round(mx)} 0 L ${round(mx - 10)} 7 Z`, fill: colors.itemActive }, marker);
      }

      // ── 기억 자리
      const half = g.cellW / 2;
      const differ = s.differ;
      label(root, g.slotX, g.memY - 42, t('label.memory', 'Memory'), {
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      node(
        'rect',
        {
          x: g.slotX - half,
          y: g.memY - 30,
          width: g.cellW,
          height: 60,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: differ ? colors.itemComparing : colors.border,
          'stroke-width': differ ? 2 : 1,
        },
        root,
      );
      label(root, g.slotX, g.memY - 17, s.memoryName, {
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      const memValue = label(root, g.slotX, g.memY + 8, String(s.memory), {
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 600,
        'text-anchor': 'middle',
      });

      // ── 스레드 상자와 레지스터
      const boxHalf = half + 34;
      node(
        'rect',
        {
          x: g.slotX - boxHalf,
          y: g.regY - 62,
          width: boxHalf * 2,
          height: 102,
          rx: 8,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        },
        root,
      );
      label(root, g.slotX - boxHalf + 2, g.regY - 72, t('label.thread', 'Thread {id}', { id: s.thread }), {
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      node(
        'rect',
        {
          x: g.slotX - half,
          y: g.regY - 30,
          width: g.cellW,
          height: 60,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: differ ? colors.itemComparing : colors.border,
          'stroke-width': differ ? 2 : 1,
        },
        root,
      );
      label(root, g.slotX, g.regY - 17, s.registerName, {
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });
      label(root, g.slotX, g.regY - 46, t('label.register', 'register'), {
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      let regValue: SVGElement | null = null;
      if (s.register !== null) {
        regValue = label(root, g.slotX, g.regY + 8, String(s.register), {
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          'text-anchor': 'middle',
        });
      }

      // ── 두 곳이 다를 때
      let differMark: SVGElement | null = null;
      if (differ) {
        differMark = label(root, g.slotX, (g.memY + 30 + g.regY - 62) / 2, '≠', {
          fill: colors.itemComparing,
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
      }

      // ── 캡션
      label(root, g.W / 2, H - 14, caption(s), {
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
      });

      const motion = node('g', {}, root);
      return { rows, gapMarks, marker, memValue, regValue, differMark, motion };
    }

    /** 옮겨 가는 값 조각 */
    function chip(parent: SVGElement, value: number): SVGElement {
      const c = node('g', {}, parent);
      node('rect', { x: -28, y: -17, width: 56, height: 34, rx: 6, fill: colors.primary }, c);
      label(c, 0, 1, String(value), {
        fill: colors.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': 600,
        'text-anchor': 'middle',
      });
      return c;
    }

    function markerFrom(s: NonAtomicIncrementScene, index: number): number {
      const g = geometry(s.steps.length);
      return index > 0 ? g.rowY(index - 1) : g.outerY;
    }

    async function render(
      next: NonAtomicIncrementScene,
      _prev: NonAtomicIncrementScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null) return;
      const g = geometry(next.steps.length);

      if (step.kind === 'unfold') {
        const shifts = h.rows.map((_, i) => g.outerY - g.rowY(i));
        await tween(UNFOLD_MS, mine, (p) => {
          h.rows.forEach((row, i) => {
            const dy = (shifts[i] ?? 0) * (1 - p);
            row.setAttribute('transform', `translate(0 ${round(dy)})`);
            row.setAttribute('opacity', String(round(Math.min(1, p * 2.5))));
          });
          for (const m of h.gapMarks) m.setAttribute('opacity', String(round(Math.max(0, (p - 0.6) / 0.4))));
        });
      } else {
        const fromY = markerFrom(next, step.index);
        const toY = g.rowY(step.index);
        const moveMarker = (p: number) => {
          h.marker?.setAttribute('transform', `translate(0 ${round(fromY + (toY - fromY) * p)})`);
        };
        if (step.kind === 'load' || step.kind === 'store') {
          const down = step.kind === 'load';
          const y0 = down ? g.memY + 8 : g.regY + 8;
          const y1 = down ? g.regY + 8 : g.memY + 8;
          const value = down ? (next.register ?? next.memory) : next.memory;
          const target = down ? h.regValue : h.memValue;
          const was = step.kind === 'store' ? step.was : null;
          const piece = chip(h.motion, value);
          await tween(MOVE_MS, mine, (p) => {
            moveMarker(p);
            piece.setAttribute('transform', `translate(${g.slotX} ${round(y0 + (y1 - y0) * p)})`);
            if (target) {
              if (was !== null) target.textContent = String(p < 1 ? was : next.memory);
              else target.setAttribute('opacity', p < 1 ? '0' : '1');
            }
          });
        } else {
          const was = step.was;
          const reg = h.regValue;
          const fresh = next.register;
          const old = reg ? label(h.motion, g.slotX, g.regY + 8, String(was), {
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xl,
            'font-weight': 600,
            'text-anchor': 'middle',
          }) : null;
          await tween(ADD_MS, mine, (p) => {
            moveMarker(p);
            if (old) {
              old.setAttribute('y', String(round(g.regY + 8 - 18 * p)));
              old.setAttribute('opacity', String(round(1 - p)));
            }
            if (reg && fresh !== null) {
              reg.setAttribute('y', String(round(g.regY + 8 + 18 * (1 - p))));
              reg.setAttribute('opacity', String(round(p)));
            }
            h.differMark?.setAttribute('opacity', String(round(p)));
          });
        }
      }

      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
