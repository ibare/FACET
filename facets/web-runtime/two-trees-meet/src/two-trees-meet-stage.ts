/**
 * 두 트리가 만난다 — 그림.
 *
 * 위에 CSSOM 규칙 조각들, 아래 왼쪽에 DOM, 오른쪽에 렌더 트리. 한 걸음에 두 운동이 한 시계로 흐른다.
 *   1) 맞은 규칙의 선언이 CSSOM 조각에서 DOM 의 그 요소 옆으로 건너와 붙는다
 *   2) 선언을 단 요소가 렌더 트리의 제 자리(부모 아래)로 옮겨 붙는다
 *      — display: none 이 붙은 요소는 옮겨 가지 않고, 그 가지가 통째로 아래로 떨어져 나간다
 * 정적 그리기가 정본이다. 운동은 끝 자리에 아직 못 온 만큼으로 그린다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { TwoTreesMeetScene } from './scene';

const H = 486;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 선언이 건너오는 시간 */
const CROSS_MS = 300;
/** 요소가 렌더 트리로 옮겨 가거나 가지가 떨어지는 시간 */
const MOVE_MS = 360;
/** 떨어지는 가지가 내려가는 거리 */
const FALL_PX = 30;

type Pt = { x: number; y: number };

type Handles = {
  /** DOM 줄에 붙은 선언 글자와 그 끝 자리, 그리고 건너오기 전 자리(CSSOM 조각 안) */
  domDecls: Map<number, { node: SVGTextElement; end: Pt; from: Pt }[]>;
  /** DOM 줄 이름의 자리 */
  domName: Map<number, Pt>;
  /** 렌더 트리 줄 묶음과 이름의 자리 */
  renderRow: Map<number, { g: SVGGElement; at: Pt }>;
  renderLink: Map<number, SVGPathElement>;
  strikes: Map<number, { line: SVGLineElement; x1: number; x2: number }>;
  anim: SVGGElement;
};

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const twoTreesMeetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);
    const MD = parseFloat(fontSizes.md);
    /** 고정폭 글자 한 칸의 폭 (셈용) */
    const CH = SM * 0.6;
    const M = 16;
    const INDENT = 18;

    // 위: CSSOM 조각 두 단 · 세 줄
    const CHIP_GAP = 12;
    const CHIP_W = (W - 2 * M - CHIP_GAP) / 2;
    const CHIP_H = 24;
    const CHIP_TOP = 30;
    const CHIP_PITCH = 30;
    // 아래: 두 트리
    const COL_LABEL_Y = 148;
    const ROW_TOP = 170;
    const COUNT_Y = H - 60;
    const ROW_BOTTOM = COUNT_Y - 26;
    const DOM_X = M + 6;
    const RENDER_X = W / 2 + 14;
    const COL_W = W / 2 - M - 10;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      o: { size: number; fill: string; mono?: boolean; weight?: number; anchor?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size,
        fill: o.fill,
        'text-anchor': o.anchor ?? 'start',
        'dominant-baseline': 'central',
      });
      if (o.weight) node.setAttribute('font-weight', String(o.weight));
      node.textContent = text;
      return node;
    }

    function rowPitch(s: TwoTreesMeetScene): number {
      const n = Math.max(2, s.dom.length);
      return Math.min(24, (ROW_BOTTOM - ROW_TOP) / (n - 1));
    }

    function chipBox(i: number): { x: number; y: number } {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return { x: M + col * (CHIP_W + CHIP_GAP), y: CHIP_TOP + row * CHIP_PITCH };
    }

    function drawStatic(s: TwoTreesMeetScene): Handles {
      svg.textContent = '';
      const step = s.step;
      const pitch = rowPitch(s);
      const rowY = (i: number): number => ROW_TOP + i * pitch;
      const domAt = (i: number): Pt => ({ x: DOM_X + s.dom[i]!.depth * INDENT, y: rowY(i) });

      const back = el(svg, 'g', {});
      const front = el(svg, 'g', {});
      const anim = el(svg, 'g', {});

      // ── CSSOM
      label(front, M, 14, t('label.cssom', 'CSSOM'), {
        size: SM,
        fill: c.textMuted,
        weight: 600,
      });
      const chipDecl = new Map<number, Pt>();
      const hot = new Set(step ? step.rules : []);
      s.rules.forEach((r, i) => {
        const b = chipBox(i);
        const isHot = hot.has(i);
        el(back, 'rect', {
          x: b.x,
          y: b.y,
          width: CHIP_W,
          height: CHIP_H,
          rx: 4,
          fill: c.bgSubtle,
          stroke: isHot ? c.itemComparing : c.border,
          'stroke-width': isHot ? 2 : 1,
        });
        const cy = b.y + CHIP_H / 2;
        const x0 = b.x + 10;
        label(front, x0, cy, r.selector, { size: SM, fill: c.text, mono: true, weight: 600 });
        const open = x0 + r.selector.length * CH;
        label(front, open + CH, cy, '{', { size: SM, fill: c.textMuted, mono: true });
        const declX = open + 3 * CH;
        label(front, declX, cy, r.decl, { size: SM, fill: c.primary, mono: true });
        label(front, declX + (r.decl.length + 1) * CH, cy, '}', { size: SM, fill: c.textMuted, mono: true });
        chipDecl.set(i, { x: declX, y: cy });
        if (r.origin === 'ua') {
          label(front, b.x + CHIP_W - 8, cy, t('label.ua', 'browser default'), {
            size: XS,
            fill: c.textMuted,
            anchor: 'end',
          });
        }
      });

      // ── 두 트리의 머리
      label(front, M, COL_LABEL_Y, t('label.dom', 'DOM'), { size: SM, fill: c.textMuted, weight: 600 });
      label(front, RENDER_X - 6, COL_LABEL_Y, t('label.render', 'Render tree'), {
        size: SM,
        fill: c.textMuted,
        weight: 600,
      });
      el(back, 'line', {
        x1: W / 2,
        y1: COL_LABEL_Y - 8,
        x2: W / 2,
        y2: ROW_BOTTOM + 10,
        stroke: c.border,
        'stroke-dasharray': '2 4',
      });

      // ── DOM
      const domDecls: Handles['domDecls'] = new Map();
      const domName: Handles['domName'] = new Map();
      const strikes: Handles['strikes'] = new Map();
      if (step) {
        el(back, 'rect', {
          x: M,
          y: rowY(step.el) - pitch / 2 + 1,
          width: COL_W,
          height: pitch - 2,
          rx: 3,
          fill: c.bgSubtle,
          stroke: c.itemActive,
          'stroke-width': 1.5,
        });
      }
      s.dom.forEach((row, i) => {
        const at = domAt(i);
        domName.set(i, at);
        if (row.parent !== null) {
          const up = domAt(row.parent);
          el(back, 'path', {
            d: `M${num(up.x + 4)} ${num(up.y + 7)} V${num(at.y)} H${num(at.x - 4)}`,
            fill: 'none',
            stroke: c.border,
          });
        }
        const fate = s.fate[i];
        const gone = fate === 'out' || fate === 'skipped';
        label(front, at.x, at.y, row.name, {
          size: SM,
          fill: gone ? c.textMuted : c.text,
          mono: true,
          weight: step && step.el === i ? 700 : 400,
        });
        if (gone) {
          const x1 = at.x - 3;
          const x2 = at.x + row.name.length * CH + 3;
          const line = el(front, 'line', {
            x1,
            y1: at.y,
            x2,
            y2: at.y,
            stroke: c.danger,
            'stroke-width': 1.5,
          });
          strikes.set(i, { line, x1, x2 });
        }
        let x = at.x + row.name.length * CH + 10;
        const list: { node: SVGTextElement; end: Pt; from: Pt }[] = [];
        for (const k of s.attached[i]!) {
          const decl = s.rules[k]!.decl;
          const node = label(front, x, at.y, decl, {
            size: SM,
            fill: fate === 'out' ? c.danger : c.primary,
            mono: true,
          });
          const from = chipDecl.get(k);
          if (!from) throw new Error(`규칙 ${k} 의 조각이 없다`);
          list.push({ node, end: { x, y: at.y }, from });
          x += (decl.length + 2) * CH;
        }
        domDecls.set(i, list);
      });

      // ── 렌더 트리
      const renderRow: Handles['renderRow'] = new Map();
      const renderLink: Handles['renderLink'] = new Map();
      const renderIndex = new Map<number, number>();
      s.render.forEach((r, k) => renderIndex.set(r.el, k));
      const renderAt = (k: number): Pt => ({ x: RENDER_X + s.render[k]!.depth * INDENT, y: rowY(k) });
      s.render.forEach((r, k) => {
        const at = renderAt(k);
        if (r.parent !== null) {
          const pk = renderIndex.get(r.parent);
          if (pk === undefined) throw new Error(`렌더 트리에 부모 ${r.parent} 가 없다`);
          const up = renderAt(pk);
          renderLink.set(
            r.el,
            el(back, 'path', {
              d: `M${num(up.x + 4)} ${num(up.y + 7)} V${num(at.y)} H${num(at.x - 4)}`,
              fill: 'none',
              stroke: c.border,
            }),
          );
        }
        const g = el(front, 'g', {});
        const name = s.dom[r.el]!.name;
        label(g, at.x, at.y, name, { size: SM, fill: c.text, mono: true, weight: 600 });
        let x = at.x + name.length * CH + 10;
        for (const idx of s.attached[r.el]!) {
          const decl = s.rules[idx]!.decl;
          label(g, x, at.y, decl, { size: SM, fill: c.primary, mono: true });
          x += (decl.length + 2) * CH;
        }
        renderRow.set(r.el, { g, at });
      });

      // ── 셈과 캡션
      const visited = s.fate.filter((f) => f === 'in' || f === 'out').length;
      const out = s.fate.filter((f) => f === 'out' || f === 'skipped').length;
      label(
        front,
        M,
        COUNT_Y,
        t('count.line', 'DOM: {dom} · visited: {visited} · render tree: {render} · left out: {out}', {
          dom: s.dom.length,
          visited,
          render: s.render.length,
          out,
        }),
        { size: SM, fill: c.textMuted },
      );
      let line1: string;
      let line2 = '';
      if (!step) {
        line1 = t('caption.start', 'The render tree is still empty');
      } else {
        const elName = s.dom[step.el]!.name;
        line1 =
          step.rules.length > 0
            ? t('caption.visit', 'Visit {el} · matching rules: {sels}', {
                el: elName,
                sels: step.rules.map((k) => s.rules[k]!.selector).join(', '),
              })
            : t('caption.visitNone', 'Visit {el} · no rule matches', { el: elName });
        if (step.kind === 'drop') {
          line2 = t(
            'caption.drop',
            'Left out of the render tree with its whole branch · descendants not visited: {n}',
            { n: step.skipped.length },
          );
        } else if (step.parent === null) {
          line2 = t('caption.root', 'It becomes the root of the render tree');
        } else {
          line2 = t('caption.under', 'It joins the render tree · parent: {parent}', {
            parent: s.dom[step.parent]!.name,
          });
        }
      }
      label(front, M, H - 38, line1, { size: MD, fill: c.text, weight: 600 });
      if (line2) {
        label(front, M, H - 16, line2, {
          size: SM,
          fill: step && step.kind === 'drop' ? c.danger : c.text,
        });
      }

      return { domDecls, domName, renderRow, renderLink, strikes, anim };
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 한 시계. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let start = -1;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (!live(mine)) return finish();
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function shift(node: Element, dx: number, dy: number): void {
      node.setAttribute('transform', `translate(${num(dx)} ${num(dy)})`);
    }

    return {
      async render(
        next: TwoTreesMeetScene,
        prev: TwoTreesMeetScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const step = next.step;
        if (!opts.animate || !step || (prev !== null && prev.step === step)) return;

        const decls = h.domDecls.get(step.el) ?? [];
        const row = step.kind === 'visit' ? h.renderRow.get(step.el) : undefined;
        const link = step.kind === 'visit' ? h.renderLink.get(step.el) : undefined;
        const from = h.domName.get(step.el);
        if (!from) throw new Error(`요소 ${step.el} 의 자리가 없다`);

        // 아직 오지 않은 것을 감춘다 — 첫 프레임에 끝 자리가 번쩍이지 않게
        if (row) row.g.setAttribute('visibility', 'hidden');
        if (link) link.setAttribute('visibility', 'hidden');
        const falling = step.kind === 'drop' ? [step.el, ...step.skipped] : [];
        for (const i of falling) {
          const s = h.strikes.get(i);
          if (s) s.line.setAttribute('x2', num(s.x1));
        }

        // 1) 선언이 건너와 붙는다
        if (decls.length > 0) {
          const place = (p: number): void => {
            for (const d of decls) shift(d.node, (d.from.x - d.end.x) * (1 - p), (d.from.y - d.end.y) * (1 - p));
          };
          place(0);
          await tween(CROSS_MS, mine, place);
          if (!live(mine)) return;
          place(1);
        }

        // 2) 렌더 트리로 옮겨 붙거나, 가지째 떨어져 나간다
        if (row) {
          row.g.removeAttribute('visibility');
          const dx = from.x - row.at.x;
          const dy = from.y - row.at.y;
          const place = (p: number): void => shift(row.g, dx * (1 - p), dy * (1 - p));
          place(0);
          await tween(MOVE_MS, mine, place);
          if (!live(mine)) return;
        } else if (step.kind === 'drop') {
          const ghost = el(h.anim, 'g', {});
          for (const i of falling) {
            const at = h.domName.get(i);
            if (!at) throw new Error(`요소 ${i} 의 자리가 없다`);
            label(ghost, at.x, at.y, next.dom[i]!.name, {
              size: SM,
              fill: c.danger,
              mono: true,
              weight: 600,
            });
          }
          const place = (p: number): void => {
            ghost.setAttribute('transform', `translate(0 ${num(FALL_PX * p)})`);
            ghost.setAttribute('opacity', num(1 - p));
            for (const i of falling) {
              const s = h.strikes.get(i);
              if (s) s.line.setAttribute('x2', num(s.x1 + (s.x2 - s.x1) * p));
            }
          };
          place(0);
          await tween(MOVE_MS, mine, place);
          if (!live(mine)) return;
        }

        drawStatic(next);
      },
      destroy(): void {
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
