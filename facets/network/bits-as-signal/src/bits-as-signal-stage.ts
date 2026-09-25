/**
 * bits-as-signal 무대 — 시간이 왼쪽에서 오른쪽으로 흐르는 선 두 줄.
 *
 * 위 줄은 맨체스터 부호, 아래 줄은 같은 비트를 전압 그대로 싣는 줄이다. 걸음마다 비트
 * 하나가 두 줄에 함께 실리고, 펜 끝이 그 비트의 칸을 따라 선을 그어 나간다. 맨체스터
 * 줄은 칸 한가운데서 늘 위나 아래로 꺾인다 — 그 꺾임의 방향이 비트다.
 *
 * 정적 그리기가 정본이고, 운동은 방금 실린 칸을 펜이 아직 못 간 만큼 덜 그린 것이다.
 */
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { BitsAsSignalScene, SignalLevel, WireCell } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 펜이 칸 하나를 긋는 시간 */
const MOTION_MS = 380;
const FRAME_MS = 16;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
const LG = parseFloat(fontSizes.lg);

/** 세로 자리 — 위에서부터 차례로 */
const Y = {
  source: 22,
  index: 44,
  digit: 64,
  manHigh: 90,
  manLow: 128,
  levHigh: 164,
  levLow: 202,
  held: 216,
  heldLabel: 234,
  caption1: 262,
  caption2: 283,
};

const MARGIN = 14;
/** 줄 이름 칸의 몫 (폭에서 역산) */
const LABEL_SHARE = 0.18;
const TALLY_SHARE = 0.15;
/** 칸 폭의 상한 */
const MAX_CELL = 64;

type SegKind = 'flat' | 'mid' | 'edge' | 'flip';
type Seg = { cell: number; kind: SegKind; x1: number; y1: number; x2: number; y2: number; up: boolean };

type Geometry = { x0: number; cw: number; n: number };

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function geometry(n: number): Geometry {
  const left = MARGIN + PIECE_CANVAS_W * LABEL_SHARE;
  const right = PIECE_CANVAS_W - MARGIN - PIECE_CANVAS_W * TALLY_SHARE;
  const count = Math.max(n, 1);
  const cw = Math.min(MAX_CELL, (right - left) / count);
  // 상한에 걸려 남는 폭은 양쪽에 고루 나눈다
  const x0 = left + (right - left - cw * count) / 2;
  return { x0, cw, n };
}

function levelY(level: SignalLevel, high: number, low: number): number {
  return level === 'H' ? high : low;
}

function manchesterSegs(cells: WireCell[], g: Geometry): Seg[] {
  const segs: Seg[] = [];
  let prevY: number | null = null;
  cells.forEach((c, i) => {
    const xa = g.x0 + i * g.cw;
    const xm = xa + g.cw / 2;
    const xb = xa + g.cw;
    const ya = levelY(c.halves[0], Y.manHigh, Y.manLow);
    const yc = levelY(c.halves[1], Y.manHigh, Y.manLow);
    if (c.edge && prevY !== null) {
      segs.push({ cell: i, kind: 'edge', x1: xa, y1: prevY, x2: xa, y2: ya, up: ya < prevY });
    }
    segs.push({ cell: i, kind: 'flat', x1: xa, y1: ya, x2: xm, y2: ya, up: false });
    segs.push({ cell: i, kind: 'mid', x1: xm, y1: ya, x2: xm, y2: yc, up: yc < ya });
    segs.push({ cell: i, kind: 'flat', x1: xm, y1: yc, x2: xb, y2: yc, up: false });
    prevY = yc;
  });
  return segs;
}

function levelSegs(cells: WireCell[], g: Geometry): Seg[] {
  const segs: Seg[] = [];
  let prevY: number | null = null;
  cells.forEach((c, i) => {
    const xa = g.x0 + i * g.cw;
    const xb = xa + g.cw;
    const y = c.bit === 1 ? Y.levHigh : Y.levLow;
    if (c.levelFlip && prevY !== null) {
      segs.push({ cell: i, kind: 'flip', x1: xa, y1: prevY, x2: xa, y2: y, up: y < prevY });
    }
    segs.push({ cell: i, kind: 'flat', x1: xa, y1: y, x2: xb, y2: y, up: false });
    prevY = y;
  });
  return segs;
}

function segLen(s: Seg): number {
  return Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
}

export const bitsAsSignalStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opt: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opt.mono ? fonts.mono : fonts.body,
          'font-size': opt.size,
          fill: opt.fill,
          'text-anchor': opt.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opt.weight) node.setAttribute('font-weight', opt.weight);
      node.textContent = body;
    }

    function segColor(kind: SegKind, row: 'man' | 'lev'): string {
      if (kind === 'mid') return colors.primary;
      if (kind === 'edge' || kind === 'flip') return colors.itemComparing;
      return row === 'man' ? colors.text : colors.textMuted;
    }

    /**
     * 선 한 줄을 긋는다. `cell` 칸은 `p` 만큼만 (펜이 간 만큼), 앞 칸들은 끝까지.
     * 돌려주는 것은 펜 끝 자리 — 운동 중일 때만 쓴다.
     */
    function drawTrace(
      parent: Element,
      segs: Seg[],
      row: 'man' | 'lev',
      cell: number,
      p: number,
    ): { x: number; y: number } | null {
      const total = segs.filter((s) => s.cell === cell).reduce((a, s) => a + segLen(s), 0);
      let budget = total * p;
      let tip: { x: number; y: number } | null = null;
      for (const s of segs) {
        let frac = 1;
        if (s.cell === cell) {
          const len = segLen(s);
          if (budget <= 0) break;
          frac = len === 0 ? 1 : Math.min(1, budget / len);
          budget -= len;
        }
        const x2 = s.x1 + (s.x2 - s.x1) * frac;
        const y2 = s.y1 + (s.y2 - s.y1) * frac;
        const vertical = s.kind !== 'flat';
        el(
          'line',
          {
            x1: s.x1,
            y1: s.y1,
            x2,
            y2,
            stroke: segColor(s.kind, row),
            'stroke-width': vertical ? 3 : 2.5,
            'stroke-linecap': 'square',
          },
          parent,
        );
        if (s.kind === 'mid' && frac === 1) {
          // 꺾인 방향 — 위로 가면 1, 아래로 가면 0
          const cy = (s.y1 + s.y2) / 2;
          const d = s.up ? -1 : 1;
          const w = 5;
          el(
            'path',
            {
              d: `M ${r2(s.x1 - w)} ${r2(cy - d * 3)} L ${r2(s.x1)} ${r2(cy + d * 5)} L ${r2(s.x1 + w)} ${r2(cy - d * 3)} Z`,
              fill: colors.primary,
            },
            parent,
          );
        }
        if (s.cell === cell) tip = { x: x2, y: y2 };
      }
      return tip;
    }

    function draw(scene: BitsAsSignalScene, p: number): void {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }, svg);

      const n = scene.bits.length;
      const g = geometry(n);
      const current = scene.step?.kind === 'bit' ? scene.step.index : -1;
      const midX = g.x0 + (g.cw * Math.max(n, 1)) / 2;

      // 자료 → 바이트
      if (scene.char !== null) {
        const src = scene.byte === null ? scene.char : `${scene.char}  →  0x${scene.byte.toString(16).toUpperCase().padStart(2, '0')}`;
        write(svg, midX, Y.source, src, { size: MD, fill: colors.text, anchor: 'middle', mono: true });
      }
      if (n === 0) return;

      const xEnd = g.x0 + g.cw * n;

      // 이번 비트의 칸
      if (current >= 0) {
        el(
          'rect',
          { x: g.x0 + current * g.cw, y: Y.index - 10, width: g.cw, height: Y.levLow + 8 - (Y.index - 10), fill: colors.bgSubtle },
          svg,
        );
      }

      // 비트 열
      scene.bits.forEach((b, i) => {
        const cx = g.x0 + (i + 0.5) * g.cw;
        write(svg, cx, Y.index, String(i + 1), { size: XS, fill: colors.textMuted, anchor: 'middle' });
        const loaded = i < scene.cells.length;
        write(svg, cx, Y.digit, String(b), {
          size: LG,
          fill: i === current ? colors.itemActive : loaded ? colors.text : colors.textMuted,
          anchor: 'middle',
          mono: true,
          weight: i === current ? '700' : '400',
        });
      });

      // 칸 눈금 — 비트 경계는 실선, 가운데는 점선
      const grid = el('g', { stroke: colors.border, 'stroke-width': 1 }, svg);
      for (const [hi, lo] of [
        [Y.manHigh, Y.manLow],
        [Y.levHigh, Y.levLow],
      ] as const) {
        for (let i = 0; i <= n; i += 1) {
          const x = g.x0 + i * g.cw;
          el('line', { x1: x, y1: hi - 8, x2: x, y2: lo + 8 }, grid);
        }
        for (let i = 0; i < n; i += 1) {
          const x = g.x0 + (i + 0.5) * g.cw;
          el('line', { x1: x, y1: hi - 4, x2: x, y2: lo + 4, 'stroke-dasharray': '2 3' }, grid);
        }
        el('line', { x1: g.x0, y1: hi, x2: xEnd, y2: hi, 'stroke-dasharray': '1 4' }, grid);
        el('line', { x1: g.x0, y1: lo, x2: xEnd, y2: lo, 'stroke-dasharray': '1 4' }, grid);
      }

      // 줄 이름 · 높음 낮음
      const hl = g.x0 - 6;
      write(svg, MARGIN, (Y.manHigh + Y.manLow) / 2, t('label.manchester', 'Manchester'), { size: SM, fill: colors.text });
      write(svg, MARGIN, (Y.levHigh + Y.levLow) / 2, t('label.level', 'Bit as level'), { size: SM, fill: colors.textMuted });
      for (const [hi, lo] of [
        [Y.manHigh, Y.manLow],
        [Y.levHigh, Y.levLow],
      ] as const) {
        write(svg, hl, hi, t('label.high', 'high'), { size: XS, fill: colors.textMuted, anchor: 'end' });
        write(svg, hl, lo, t('label.low', 'low'), { size: XS, fill: colors.textMuted, anchor: 'end' });
      }

      // 선 두 줄
      const traces = el('g', {}, svg);
      const tipMan = drawTrace(traces, manchesterSegs(scene.cells, g), 'man', current, p);
      const tipLev = drawTrace(traces, levelSegs(scene.cells, g), 'lev', current, p);
      if (p < 1) {
        for (const tip of [tipMan, tipLev]) {
          if (tip) el('circle', { cx: tip.x, cy: tip.y, r: 4, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, traces);
        }
      }

      // 뒤집힘 수
      const tx = PIECE_CANVAS_W - MARGIN;
      write(svg, tx, Y.manHigh + 10, t('label.middle', 'Middle: {n}', { n: scene.tally.mid }), {
        size: SM,
        fill: colors.primary,
        anchor: 'end',
      });
      write(svg, tx, Y.manLow - 10, t('label.boundary', 'Boundary: {n}', { n: scene.tally.edges }), {
        size: SM,
        fill: colors.itemComparing,
        anchor: 'end',
      });
      write(svg, tx, (Y.levHigh + Y.levLow) / 2, t('label.flips', 'Flips: {n}', { n: scene.tally.levelFlips }), {
        size: SM,
        fill: colors.itemComparing,
        anchor: 'end',
      });

      // 그대로 싣는 줄이 뒤집히지 않고 머문 가장 긴 구간
      const held = scene.held;
      if (held !== null) {
        const growing = current === held.from + held.len - 1 && p < 1;
        const span = growing ? held.len - 1 + p : held.len;
        const xa = g.x0 + held.from * g.cw;
        const xb = xa + span * g.cw;
        const hold = el('g', { stroke: colors.textMuted, 'stroke-width': 1.5, fill: 'none' }, svg);
        el('path', { d: `M ${r2(xa)} ${Y.held - 6} L ${r2(xa)} ${Y.held} L ${r2(xb)} ${Y.held} L ${r2(xb)} ${Y.held - 6}` }, hold);
        write(svg, (xa + xa + held.len * g.cw) / 2, Y.heldLabel, t('label.held', 'Bits held: {n}', { n: held.len }), {
          size: SM,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }

      // 캡션 — 지금 일어나는 일만
      let line1 = '';
      let line2 = '';
      if (current >= 0) {
        const cell = scene.cells[current];
        if (cell) {
          line1 =
            cell.bit === 1
              ? t('caption.one', 'Bit {i} is 1: low, then high. The middle flips up.', { i: current + 1 })
              : t('caption.zero', 'Bit {i} is 0: high, then low. The middle flips down.', { i: current + 1 });
          if (current > 0) {
            line2 = cell.edge
              ? t('caption.edge', 'Same as the bit before, so the line first flips at the boundary.')
              : t('caption.noEdge', 'Different from the bit before: the line is already where it must start.');
          }
        }
      } else if (scene.byte !== null) {
        line1 = t('caption.start', 'Byte {byte}. The line is still empty.', {
          byte: `0x${scene.byte.toString(16).toUpperCase().padStart(2, '0')}`,
        });
      }
      if (line1) write(svg, PIECE_CANVAS_W / 2, Y.caption1, line1, { size: MD, fill: colors.text, anchor: 'middle' });
      if (line2) write(svg, PIECE_CANVAS_W / 2, Y.caption2, line2, { size: SM, fill: colors.textMuted, anchor: 'middle' });
    }

    function drawStatic(scene: BitsAsSignalScene): void {
      draw(scene, 1);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function trace(next: BitsAsSignalScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        draw(next, p);
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: BitsAsSignalScene, prev: BitsAsSignalScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const fresh = next.step?.kind === 'bit' && (prev === null || prev.cells.length !== next.cells.length);
        if (!opts.animate || !fresh) {
          drawStatic(next);
          return;
        }
        await trace(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
