/**
 * internal-state-carries 의 무대.
 *
 * 세 줄이 칸을 맞춰 선다. 위 줄은 M 을 가진 쪽, 가운데 줄은 D 만 받은 쪽, 아래 줄은 처음부터
 * 통째로 접은 줄이다. 위와 가운데 사이의 벽을 건너는 것은 D 하나뿐이다 — 끝 칸에서 아래로
 * 내려가 가운데 줄의 출발점이 된다. 가운데 줄은 그 칸에서 오른쪽으로 이어 접는다. 끝 걸음에
 * 위 두 토막의 상태가 통째 줄 위로 내려앉아 칸마다 겹친다.
 */
import {
  type CanvasView,
  type Palette,
  type ViewInstance,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { Cell } from './algorithm.js';
import type { InternalStateCarriesScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 줄의 윗선 */
const LANE_TOP = { holder: 14, extender: 122, whole: 230 } as const;
/** 위 줄과 가운데 줄 사이의 벽 */
const WALL_Y = 112;
const WHOLE_RULE_Y = 220;
const CAPTION_Y = H - 16;

/** 줄 안의 자리 (윗선에서) */
const LABEL_DY = 10;
const CELL_DY = 18;
const HEX_DY = 52;
const CHIP_DY = 76;

/** 크기 상한 — 칸 간격이 좁으면 줄인다 */
const CHIP_W_MAX = 54;
const CHIP_H = 26;
const CELL_W_MAX = 20;
const CELL_H = 20;
const SIDE = 8;

/** 운동 시간 (ms) */
const FOLD_MS = 250;
const CARRY_MS = 500;
const EXTEND_MS = 400;
const WHOLE_FOLD_MS = 130;
const SETTLE_MS = 450;

type Chip = { g: SVGGElement; x: number; y: number };
type Handles = {
  holderChips: Chip[];
  holderArrows: SVGElement[];
  extChips: Chip[];
  extArrows: SVGElement[];
  extNewCells: SVGGElement | null;
  crossing: SVGElement | null;
  wholeChips: Chip[];
  wholeArrows: SVGElement[];
  wholeMarks: SVGGElement | null;
};

function hex4(v: number): string {
  return v.toString(16).padStart(4, '0');
}
function hex2(v: number): string {
  return v.toString(16).padStart(2, '0');
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const internalStateCarriesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const cellPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 칸 수에서 간격을 셈한다 — 폭을 채운다 */
    function grid(columns: number) {
      const chipW = Math.min(CHIP_W_MAX, (W - 2 * SIDE) / columns - 8);
      const x0 = SIDE + chipW / 2;
      const step = columns > 1 ? (W - 2 * SIDE - chipW) / (columns - 1) : 0;
      const cellW = Math.min(CELL_W_MAX, (step - 6) / 2);
      return {
        chipW,
        step,
        cellW,
        colX: (i: number) => r1(x0 + i * step),
        gapX: (i: number) => r1(x0 + (i + 0.5) * step),
      };
    }
    type Grid = ReturnType<typeof grid>;

    function text(parent: Element, x: number, y: number, s: string, o: {
      size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string;
    }) {
      const node = el(parent, 'text', {
        x: r1(x),
        y: r1(y),
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? colors.text,
        'text-anchor': o.anchor ?? 'middle',
      });
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.textContent = s;
      return node;
    }

    function cellGlyph(c: Cell): string {
      if (c.kind === 'unknown') return t('label.unknown', '?');
      if (c.v === null) throw new Error('internal-state-carries-stage: 값 없는 글자 칸');
      return c.kind === 'char' ? String.fromCharCode(c.v) : hex2(c.v);
    }

    /** 덩어리 칸 줄 — 칸 둘이 한 틈 위에 선다 */
    function drawCells(
      parent: Element, g: Grid, top: number, cells: readonly Cell[], firstGap: number,
      chunks: readonly number[] | null, keep: (c: Cell) => boolean = () => true,
    ) {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i] as Cell;
        if (!keep(c)) continue;
        const gap = firstGap + Math.floor(i / 2);
        const cx = g.gapX(gap) + (i % 2 === 0 ? -1 : 1) * (g.cellW / 2 + 1);
        const unknown = c.kind === 'unknown';
        el(parent, 'rect', {
          x: r1(cx - g.cellW / 2),
          y: top + CELL_DY,
          width: r1(g.cellW),
          height: CELL_H,
          rx: 3,
          fill: unknown ? 'none' : c.kind === 'char' ? colors.bgSubtle : colors.bg,
          stroke: unknown ? colors.textMuted : colors.border,
          'stroke-dasharray': unknown ? '3 2' : 'none',
        });
        text(parent, cx, top + CELL_DY + CELL_H / 2 + cellPx * 0.36, cellGlyph(c), {
          mono: true,
          fill: c.kind === 'char' ? colors.text : colors.textMuted,
          size: c.kind === 'char' ? fontSizes.sm : fontSizes.xs,
        });
      }
      if (chunks === null) return;
      for (let k = 0; k < chunks.length; k += 1) {
        const x = g.gapX(firstGap + k);
        text(parent, x, top + HEX_DY, hex4(chunks[k] as number), { mono: true, size: fontSizes.xs, fill: colors.textMuted });
        el(parent, 'line', {
          x1: x, y1: top + HEX_DY + 4, x2: x, y2: top + CHIP_DY - 4,
          stroke: colors.textMuted, 'stroke-width': 1,
        });
      }
    }

    function drawChip(parent: Element, g: Grid, col: number, top: number, v: number, o: {
      hot?: boolean; tag?: string; ring?: boolean;
    }): Chip {
      const x = g.colX(col);
      const y = top + CHIP_DY;
      const grp = el(parent, 'g', { transform: `translate(${x},${y})` });
      el(grp, 'rect', {
        x: r1(-g.chipW / 2), y: -CHIP_H / 2, width: r1(g.chipW), height: CHIP_H, rx: 5,
        fill: o.hot ? colors.accent : colors.bgSubtle,
        stroke: o.ring ? colors.accent : o.hot ? colors.accent : colors.border,
        'stroke-width': o.ring ? 2.5 : 1,
      });
      text(grp, 0, parseFloat(fontSizes.md) * 0.36, hex4(v), {
        mono: true, size: fontSizes.md, fill: o.hot ? colors.stateInk : colors.text, weight: o.hot ? '600' : '400',
      });
      if (o.tag !== undefined) {
        text(grp, 0, -CHIP_H / 2 - 5, o.tag, { size: fontSizes.xs, fill: colors.textMuted, weight: '600' });
      }
      return { g: grp, x, y };
    }

    /** col−1 에서 col 로 가는 화살 */
    function drawArrow(parent: Element, g: Grid, col: number, top: number): SVGElement {
      const y = top + CHIP_DY;
      const x1 = r1(g.colX(col - 1) + g.chipW / 2 + 3);
      const x2 = r1(g.colX(col) - g.chipW / 2 - 3);
      return el(parent, 'path', {
        d: `M${x1},${y} L${x2},${y} M${r1(x2 - 5)},${y - 4} L${x2},${y} L${r1(x2 - 5)},${y + 4}`,
        fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.2,
      });
    }

    function laneLabel(top: number, s: string) {
      text(svg, SIDE, top + LABEL_DY, s, { anchor: 'start', size: fontSizes.xs, fill: colors.textMuted, weight: '600' });
    }

    function caption(s: InternalStateCarriesScene): string {
      const st = s.step;
      switch (st.kind) {
        case 'start':
          return t('caption.start', 'M = {m}, bytes: {n}. Folding starts at IV {iv}.', {
            m: s.m, n: s.m.length, iv: hex4(s.iv),
          });
        case 'foldHolder': {
          const hs = s.holderStates.map(hex4);
          return t('caption.foldHolder', 'Holder folds M: {path}. Hash value D = {d}.', {
            path: hs.join(' → '), d: hs[hs.length - 1] as string,
          });
        }
        case 'carry': {
          const c = s.carried;
          if (c === null) throw new Error('internal-state-carries-stage: carry 걸음에 건너간 것이 없다');
          return t('caption.carry', 'Only D = {d} crosses, with the length of M. Bytes: {n}. The letters stay.', {
            d: hex4(c.d), n: c.mLen,
          });
        }
        case 'extend': {
          const c = s.carried;
          if (c === null) throw new Error('internal-state-carries-stage: extend 걸음에 건너간 것이 없다');
          const from = s.extStates[st.index];
          const to = s.extStates[st.index + 1];
          if (from === undefined || to === undefined) throw new Error(`internal-state-carries-stage: extStates[${st.index}] 가 없다`);
          const vars = { from: hex4(from), chunk: hex4(c.chunks[st.index] as number), to: hex4(to) };
          return st.last
            ? t('caption.extendLast', 'f({from}, {chunk}) = {to}. Extended end D′ = {to}.', vars)
            : st.index === 0
              ? t('caption.extend', 'Extender folds on from D: f({from}, {chunk}) = {to}.', vars)
              : t('caption.extendNext', 'Extender folds on from the previous state: f({from}, {chunk}) = {to}.', vars);
        }
        case 'whole': {
          const w = s.whole;
          if (w === null) throw new Error('internal-state-carries-stage: whole 걸음에 통째 접기가 없다');
          const e = s.extStates[s.extStates.length - 1];
          if (e === undefined) throw new Error('internal-state-carries-stage: 이어 접은 끝이 없다');
          return t('caption.whole', 'Folded from scratch. Bytes before padding: {n}. End {h} {rel} D′ {e}.', {
            n: w.msgLen, h: hex4(w.states[w.states.length - 1] as number), rel: w.equal ? '=' : '≠', e: hex4(e),
          });
        }
      }
    }

    function drawStatic(s: InternalStateCarriesScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        holderChips: [], holderArrows: [], extChips: [], extArrows: [],
        extNewCells: null, crossing: null, wholeChips: [], wholeArrows: [], wholeMarks: null,
      };

      laneLabel(LANE_TOP.holder, t('label.holder', 'Holder — has M'));
      laneLabel(LANE_TOP.extender, t('label.extender', 'Extender — gets only D'));
      el(svg, 'line', {
        x1: SIDE, y1: WALL_Y, x2: W - SIDE, y2: WALL_Y,
        stroke: colors.border, 'stroke-width': 2, 'stroke-dasharray': '6 4',
      });

      if (s.columns === null || s.holderCells === null || s.holderChunks === null) {
        // init 전 — 글자와 IV 만
        text(svg, SIDE, LANE_TOP.holder + CELL_DY + 14, s.m, { anchor: 'start', mono: true, size: fontSizes.md });
        text(svg, SIDE, LANE_TOP.extender + CELL_DY + 14, s.x, { anchor: 'start', mono: true, size: fontSizes.md });
        text(svg, W / 2, CAPTION_Y, caption(s), { size: fontSizes.md });
        return h;
      }

      const g = grid(s.columns);
      const split = s.holderChunks.length;

      // 위 줄 — M ‖ pad(M) 과 상태
      drawCells(svg, g, LANE_TOP.holder, s.holderCells, 0, s.holderChunks);
      s.holderStates.forEach((v, i) => {
        if (i > 0) h.holderArrows[i] = drawArrow(svg, g, i, LANE_TOP.holder);
        const tag = i === 0 ? t('label.iv', 'IV') : i === split ? t('label.d', 'D') : undefined;
        h.holderChips[i] = drawChip(svg, g, i, LANE_TOP.holder, v, { hot: i === split, tag });
      });

      // 가운데 줄 — 건너오기 전엔 X 글자만, 건너온 뒤엔 길이로 셈한 앞자리와 X ‖ pad′
      const c = s.carried;
      if (c === null) {
        const xCells: Cell[] = Array.from(s.x, (ch) => ({ v: ch.charCodeAt(0), kind: 'char' as const }));
        drawCells(svg, g, LANE_TOP.extender, xCells, split, null);
      } else {
        // X 의 글자는 그 자리에 그대로, 길이에서 셈한 칸(앞자리 · pad′)은 D 와 함께 온다
        drawCells(svg, g, LANE_TOP.extender, c.cells, split, null, (cell) => cell.kind === 'char');
        const fresh = el(svg, 'g', {});
        drawCells(fresh, g, LANE_TOP.extender, c.prefixCells, 0, null);
        drawCells(fresh, g, LANE_TOP.extender, c.cells, split, c.chunks, (cell) => cell.kind !== 'char');
        h.extNewCells = fresh;

        const hx = g.colX(split);
        h.crossing = el(svg, 'line', {
          x1: hx, y1: LANE_TOP.holder + CHIP_DY + CHIP_H / 2 + 2,
          x2: hx, y2: LANE_TOP.extender + CHIP_DY - CHIP_H / 2 - 14,
          stroke: colors.accent, 'stroke-width': 2, 'stroke-dasharray': '3 3',
        });
        const last = s.extStates.length - 1;
        s.extStates.forEach((v, i) => {
          const col = split + i;
          if (i > 0) h.extArrows[i] = drawArrow(svg, g, col, LANE_TOP.extender);
          const tag = i === 0 ? t('label.d', 'D') : i === last && last === c.chunks.length ? t('label.dPrime', 'D′') : undefined;
          h.extChips[i] = drawChip(svg, g, col, LANE_TOP.extender, v, { hot: i === 0, tag });
        });
      }

      // 아래 줄 — 처음부터 통째로
      const w = s.whole;
      if (w !== null) {
        el(svg, 'line', { x1: SIDE, y1: WHOLE_RULE_Y, x2: W - SIDE, y2: WHOLE_RULE_Y, stroke: colors.border, 'stroke-width': 1 });
        laneLabel(LANE_TOP.whole, t('label.whole', 'Whole line, folded from scratch'));
        drawCells(svg, g, LANE_TOP.whole, w.cells, 0, w.chunks);
        const marks = el(svg, 'g', {});
        w.states.forEach((v, i) => {
          if (i > 0) h.wholeArrows[i] = drawArrow(svg, g, i, LANE_TOP.whole);
          const ok = w.match[i] === true;
          // 겹친 칸 — 위 토막의 같은 칸에서 내려오는 줄
          const fromTop = i < split ? LANE_TOP.holder : LANE_TOP.extender;
          el(marks, 'line', {
            x1: g.colX(i), y1: fromTop + CHIP_DY + CHIP_H / 2 + 2,
            x2: g.colX(i), y2: LANE_TOP.whole + CHIP_DY - CHIP_H / 2 - 2,
            stroke: ok ? colors.accent : colors.danger, 'stroke-width': 1, 'stroke-dasharray': '1 3',
          });
          h.wholeChips[i] = drawChip(svg, g, i, LANE_TOP.whole, v, { ring: ok });
          if (!ok) {
            el(marks, 'rect', {
              x: r1(g.colX(i) - g.chipW / 2 - 3), y: LANE_TOP.whole + CHIP_DY - CHIP_H / 2 - 3,
              width: r1(g.chipW + 6), height: CHIP_H + 6, rx: 6, fill: 'none', stroke: colors.danger, 'stroke-width': 2,
            });
          }
        });
        svg.insertBefore(marks, svg.firstChild);
        h.wholeMarks = marks;
      }

      text(svg, W / 2, CAPTION_Y, caption(s), { size: fontSizes.md });
      return h;
    }

    // ── 운동 ─────────────────────────────────────────

    function wait(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) {
          resolve(false);
          return;
        }
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = () => finish(false);
        waiters.add(wake);
        const tick = () => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish(true);
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

    function place(chip: Chip, dx: number, dy: number) {
      chip.g.setAttribute('transform', `translate(${r1(chip.x + dx)},${r1(chip.y + dy)})`);
    }
    function hide(node: Element) {
      node.setAttribute('opacity', '0');
    }
    function show(node: Element) {
      node.removeAttribute('opacity');
    }
    function need<T>(v: T | undefined | null, what: string): T {
      if (v === undefined || v === null) throw new Error(`internal-state-carries-stage: 운동할 ${what} 가 없다`);
      return v;
    }

    /** 새 상태가 앞 칸에서 제 칸으로 건너온다 */
    async function slideIn(chip: Chip, arrow: SVGElement, step: number, ms: number, mine: number): Promise<boolean> {
      show(chip.g);
      const ok = await wait(ms, mine, (p) => place(chip, -(1 - p) * step, 0));
      if (ok) show(arrow);
      return ok;
    }

    async function animate(s: InternalStateCarriesScene, h: Handles, mine: number): Promise<boolean> {
      const st = s.step;
      if (s.columns === null) return true;
      const g = grid(s.columns);
      switch (st.kind) {
        case 'start':
          return true;
        case 'foldHolder': {
          for (let i = 1; i < s.holderStates.length; i += 1) {
            hide(need(h.holderChips[i], `holder 상태 ${i}`).g);
            hide(need(h.holderArrows[i], `holder 화살 ${i}`));
          }
          for (let i = 1; i < s.holderStates.length; i += 1) {
            if (!(await slideIn(need(h.holderChips[i], `holder 상태 ${i}`), need(h.holderArrows[i], `holder 화살 ${i}`), g.step, FOLD_MS, mine))) return false;
          }
          return true;
        }
        case 'carry': {
          const d = need(h.extChips[0], 'D');
          const fresh = need(h.extNewCells, '앞자리 칸');
          const line = need(h.crossing, '건너는 줄');
          hide(fresh);
          hide(line);
          const dy = LANE_TOP.holder - LANE_TOP.extender;
          const ok = await wait(CARRY_MS, mine, (p) => place(d, 0, (1 - p) * dy));
          if (ok) {
            show(fresh);
            show(line);
          }
          return ok;
        }
        case 'extend': {
          const i = st.index + 1;
          const chip = need(h.extChips[i], `extender 상태 ${i}`);
          const arrow = need(h.extArrows[i], `extender 화살 ${i}`);
          hide(chip.g);
          hide(arrow);
          return slideIn(chip, arrow, g.step, EXTEND_MS, mine);
        }
        case 'whole': {
          const w = need(s.whole, '통째 접기');
          const marks = need(h.wholeMarks, '겹침 표시');
          hide(marks);
          for (let i = 1; i < w.states.length; i += 1) {
            hide(need(h.wholeChips[i], `통째 상태 ${i}`).g);
            hide(need(h.wholeArrows[i], `통째 화살 ${i}`));
          }
          for (let i = 1; i < w.states.length; i += 1) {
            if (!(await slideIn(need(h.wholeChips[i], `통째 상태 ${i}`), need(h.wholeArrows[i], `통째 화살 ${i}`), g.step, WHOLE_FOLD_MS, mine))) return false;
          }
          // 위 두 토막의 상태가 통째 줄 위로 내려앉는다
          const split = need(s.holderChunks, 'holder 덩어리').length;
          const ghosts: { node: SVGRectElement; from: number; to: number }[] = [];
          const to = LANE_TOP.whole + CHIP_DY - CHIP_H / 2;
          const drop = (col: number, top: number) => {
            const from = top + CHIP_DY - CHIP_H / 2;
            const node = el(svg, 'rect', {
              x: r1(g.colX(col) - g.chipW / 2), y: from, width: r1(g.chipW), height: CHIP_H, rx: 5,
              fill: 'none', stroke: colors.accent, 'stroke-width': 2,
            });
            ghosts.push({ node, from, to });
          };
          for (let i = 0; i <= split; i += 1) drop(i, LANE_TOP.holder);
          for (let i = 0; i < s.extStates.length; i += 1) drop(split + i, LANE_TOP.extender);
          const ok = await wait(SETTLE_MS, mine, (p) => {
            for (const gh of ghosts) gh.node.setAttribute('y', String(r1(gh.from + (gh.to - gh.from) * p)));
          });
          if (ok) show(marks);
          return ok;
        }
      }
    }

    return {
      async render(next: InternalStateCarriesScene, prev: InternalStateCarriesScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const ok = await animate(next, h, mine);
        if (ok && mine === gen && !destroyed) drawStatic(next);
      },
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
