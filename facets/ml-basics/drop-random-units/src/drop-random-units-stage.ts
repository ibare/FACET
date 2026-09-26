/**
 * drop-random-units 무대.
 *
 * 칸 여섯이 세로로 서고, 칸마다 무게 선이 오른쪽 몫 막대로 간다. 걸음마다 쉬는 칸의 선이
 * 가운데서 끊겨 두 토막이 물러나고 그 막대는 0 으로 오그라든다. 켜진 칸은 선을 따라 몫을
 * 실어 보내고 막대는 제 몫(점선)의 ×배율 까지 자란다. 아래 출력 막대는 앞 출력에서 새 출력으로
 * 미끄러지고, 지난 출력은 눈금으로 남는다. 왼쪽 격자는 지난 마스크의 자취다.
 */
import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { DropRandomUnitsScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 560;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function fmt(x: number): string {
  const s = x.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r1(x: number): number {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const dropRandomUnitsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const XS = parseFloat(fontSizes.xs);
    const SM = parseFloat(fontSizes.sm);
    const MD = parseFloat(fontSizes.md);

    // 가로 — 캔버스 폭에서 역산한다
    const pad = Math.round(W * 0.03);
    const cell = Math.min(16, Math.floor(W * 0.024));
    const cellGap = Math.round(cell * 0.3);
    const gridX = pad;
    const unitX = Math.round(W * 0.25);
    const unitR = Math.min(15, Math.round(W * 0.022));
    const hX = unitX + unitR + 8;
    const edgeX0 = Math.round(W * 0.35);
    const edgeX1 = Math.round(W * 0.54);
    const axisL = Math.round(W * 0.58);
    const axisR = W - pad - 34;

    // 세로
    const headY = 22;
    const rowTop = 44;
    const outY = 296;
    const caption1Y = H - 38;
    const caption2Y = H - 16;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Attrs, parent: Element = svg, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function rowGap(n: number): number {
      return Math.min(38, (outY - 40 - rowTop) / n);
    }

    function rowY(i: number, n: number): number {
      return rowTop + rowGap(n) * (i + 0.5);
    }

    /** t ∈ [0,1] — 1 이면 그 장면의 정적 화면 그대로 */
    function drawFrame(scene: DropRandomUnitsScene, k: number): void {
      svg.textContent = '';
      const n = scene.ids.length;
      const base = scene.base;
      const now = scene.now;
      const step = scene.step;
      const moving = step.kind === 'drop' && k < 1;

      const xOf = (val: number): number => {
        if (base === null) throw new Error('drop-random-units 무대: 축 범위 없이 몫을 그리려 했다');
        return r1(axisL + ((val - base.lo) / (base.hi - base.lo)) * (axisR - axisL));
      };

      // 머리말
      el('text', { x: gridX, y: headY, 'font-family': fonts.body, 'font-size': XS, fill: colors.textMuted },
        svg, t('label.mask', 'Masks'));
      el('text', { x: unitX - unitR, y: headY, 'font-family': fonts.body, 'font-size': XS, fill: colors.textMuted },
        svg, t('label.unit', 'Units (h)'));
      el('text', { x: (edgeX0 + edgeX1) / 2, y: headY, 'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': XS, fill: colors.textMuted }, svg, t('label.v', 'Weight v'));
      el('text', { x: axisL, y: headY, 'font-family': fonts.body, 'font-size': XS, fill: colors.textMuted },
        svg, t('label.share', 'Share m·h·v / (1 − p)'));

      // 자취 격자 — 걸음 번호 머리와 칸마다의 켜짐/쉼
      const cols = scene.trail.length;
      const gridTop = rowTop - 8;
      scene.trail.forEach((_m, j) => {
        const cx = gridX + j * (cell + cellGap) + cell / 2;
        const current = step.kind === 'drop' && j === cols - 1;
        el('text', { x: cx, y: gridTop, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': XS,
          fill: current ? colors.text : colors.textMuted, 'font-weight': current ? 700 : 400 }, svg, String(j + 1));
      });
      for (let i = 0; i < n; i++) {
        const cy = rowY(i, n);
        scene.trail.forEach((m, j) => {
          const x = gridX + j * (cell + cellGap);
          const on = m[i] === 1;
          const current = j === cols - 1 && step.kind === 'drop';
          const grow = current && moving ? ease(Math.min(1, k * 2)) : 1;
          const s = r1(cell * grow);
          el('rect', {
            x: r1(x + (cell - s) / 2), y: r1(cy - s / 2), width: s, height: s, rx: 2,
            fill: on ? colors.itemActive : colors.bg,
            stroke: on ? colors.itemActive : colors.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': on ? 'none' : '2 2',
          });
        });
      }

      // 칸 · 선 · 몫
      if (base !== null) {
        const zero = xOf(0);
        el('line', { x1: zero, y1: rowTop - 4, x2: zero, y2: outY + 16, stroke: colors.border, 'stroke-width': 1 });
      }
      for (let i = 0; i < n; i++) {
        const cy = r1(rowY(i, n));
        const on = now === null ? true : now.mask[i] === 1;
        const wasOn = step.kind === 'drop' ? step.wasMask[i] === 1 : on;

        // 선 — 쉬는 칸은 가운데가 벌어진다
        const gapNow = on ? 0 : 1;
        const gapWas = wasOn ? 0 : 1;
        const g = moving ? lerp(gapWas, gapNow, ease(k)) : gapNow;
        const len = edgeX1 - edgeX0;
        const mid = (edgeX0 + edgeX1) / 2;
        const half = (g * len * 0.56) / 2;
        const edgeColor = g > 0.5 ? colors.ghostOutline : colors.textMuted;
        if (half < 0.5) {
          el('line', { x1: edgeX0, y1: cy, x2: edgeX1, y2: cy, stroke: edgeColor, 'stroke-width': 1.5 });
        } else {
          el('line', { x1: edgeX0, y1: cy, x2: r1(mid - half), y2: cy, stroke: edgeColor, 'stroke-width': 1.5 });
          el('line', { x1: r1(mid + half), y1: cy, x2: edgeX1, y2: cy, stroke: edgeColor, 'stroke-width': 1.5 });
        }
        el('text', { x: mid, y: r1(cy - 5), 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': XS,
          fill: on ? colors.text : colors.textMuted }, svg, fmt(scene.v[i]!));

        // 칸
        el('circle', {
          cx: unitX, cy, r: unitR,
          fill: on ? colors.itemActive : colors.bg,
          stroke: on ? colors.itemActive : colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': on ? 'none' : '3 2',
        });
        el('text', { x: unitX, y: r1(cy + SM * 0.35), 'text-anchor': 'middle', 'font-family': fonts.mono,
          'font-size': SM, 'font-weight': 600, fill: on ? colors.stateInk : colors.textMuted }, svg, scene.ids[i]!);
        el('text', { x: hX, y: r1(cy + XS * 0.35), 'font-family': fonts.mono, 'font-size': XS,
          fill: colors.textMuted }, svg, fmt(scene.h[i]!));

        if (base === null || now === null) continue;

        // 몫 막대 — 점선은 나누기 없는 제 몫 hᵢ·vᵢ
        const zero = xOf(0);
        const bh = Math.min(14, rowGap(n) * 0.42);
        const ghostEnd = xOf(base.full[i]!);
        if (step.kind === 'drop') {
          el('rect', {
            x: Math.min(zero, ghostEnd), y: r1(cy - bh / 2), width: r1(Math.abs(ghostEnd - zero)), height: r1(bh),
            fill: 'none', stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2',
          });
        }
        const target = now.contribs[i]!;
        const from = step.kind === 'drop' ? step.wasContribs[i]! : target;
        // 켜진 칸의 몫은 선을 따라 실려 온 뒤 자란다 — 쉬는 칸은 곧바로 오그라든다
        const kk = moving ? (on ? ease(Math.max(0, (k - 0.35) / 0.65)) : ease(Math.min(1, k * 1.6))) : 1;
        const val = lerp(from, target, kk);
        const end = xOf(val);
        const w = r1(Math.abs(end - zero));
        if (w > 0) {
          el('rect', {
            x: Math.min(zero, end), y: r1(cy - bh / 2), width: w, height: r1(bh),
            fill: colors.itemActive, opacity: 0.85,
          });
        }
        el('text', {
          x: r1(Math.max(zero, end, step.kind === 'drop' ? ghostEnd : zero) + 4), y: r1(cy + XS * 0.35), 'font-family': fonts.mono, 'font-size': XS,
          fill: on ? colors.text : colors.textMuted,
        }, svg, fmt(moving ? val : target));

        // 실려 가는 몫 — 켜진 칸에서 선을 따라 막대로
        if (moving && on && k < 0.5) {
          const q = ease(k / 0.5);
          el('circle', { cx: r1(lerp(unitX + unitR, zero, q)), cy, r: 4, fill: colors.itemActive,
            stroke: colors.stateInk, 'stroke-width': 1 });
        }
      }

      // 한 번 이상 쉰 칸의 수
      if (step.kind === 'drop') {
        el('text', { x: gridX, y: r1(rowTop + rowGap(n) * n + 16), 'font-family': fonts.body, 'font-size': XS,
          fill: colors.textMuted }, svg,
          t('label.rested', 'Rested at least once: {n}/{total}', { n: scene.rested, total: n }));
      }

      // 출력
      el('text', { x: r1(axisL - 8), y: r1(outY + SM * 0.35), 'text-anchor': 'end', 'font-family': fonts.body,
        'font-size': SM, 'font-weight': 600, fill: colors.text }, svg, t('label.y', 'Output y'));
      if (base !== null && now !== null) {
        const zero = xOf(0);
        const yVal = moving && step.kind === 'drop' ? lerp(step.wasY, now.y, ease(Math.max(0, (k - 0.35) / 0.65))) : now.y;
        const end = xOf(yVal);
        const bh = 18;
        el('rect', { x: Math.min(zero, end), y: outY - bh / 2, width: r1(Math.abs(end - zero)), height: bh,
          fill: colors.primary });
        // 지난 출력 — 눈금과 걸음 번호
        scene.ys.slice(0, -1).forEach((yy, j) => {
          const x = xOf(yy);
          el('line', { x1: x, y1: outY + bh / 2 + 2, x2: x, y2: outY + bh / 2 + 10, stroke: colors.textMuted,
            'stroke-width': 1.5 });
          el('text', { x, y: outY + bh / 2 + 22, 'text-anchor': 'middle', 'font-family': fonts.mono,
            'font-size': XS, fill: colors.textMuted }, svg, String(j));
        });
        el('text', { x: r1(Math.max(zero, end) + 5), y: r1(outY + MD * 0.35), 'font-family': fonts.mono,
          'font-size': MD, 'font-weight': 700, fill: colors.text }, svg, fmt(yVal));
      }

      // 캡션 — 지금 일어나는 일만
      if (now !== null) {
        const cap = { x: pad, 'font-family': fonts.body, 'font-size': SM, fill: colors.text };
        if (step.kind === 'start') {
          el('text', { ...cap, y: caption1Y }, svg, t('caption.start', 'No mask: every unit is on.'));
          el('text', { ...cap, y: caption2Y, fill: colors.textMuted }, svg,
            t('caption.startY', 'Output y = {y}', { y: fmt(now.y) }));
        } else if (base !== null) {
          const ids = now.off.map((i) => scene.ids[i]!).join(' · ');
          el('text', { ...cap, y: caption1Y }, svg,
            t('caption.drop', 'Step {n}: resting: {ids} (count: {count})', { n: step.n, ids, count: now.off.length }));
          el('text', { ...cap, y: caption2Y, fill: colors.textMuted }, svg,
            t('caption.carry', 'Active units carry ×{scale} their share. Output y = {y}',
              { scale: String(base.scale), y: fmt(now.y) }));
        }
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function render(
      next: DropRandomUnitsScene,
      _prev: DropRandomUnitsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || next.step.kind !== 'drop' || next.now === null) {
        drawFrame(next, 1);
        return;
      }
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const k = Math.min(1, (Date.now() - start) / MOVE_MS);
        if (k >= 1) break;
        drawFrame(next, k);
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      drawFrame(next, 1);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
