/**
 * several-views 의 무대 — 한 줄의 토큰 위아래로 머리 둘이 제 짝을 잇는다.
 *
 * 토큰 줄은 가운데 한 번만 놓인다. 첫 머리는 줄 위쪽으로, 둘째 머리는 줄 아래쪽으로
 * 활을 건다 — 같은 줄 위에서 두 머리가 고른 짝의 거리와 방향이 갈리는 것이 그림이다.
 * 활은 묻는 토큰에서 짝으로 **뻗어 나간다.** 머리의 결과 두 칸은 토큰에서 제 띠로
 * 올라가거나 내려가고, 끝 걸음에서 두 머리의 결과가 맨 아래 한 줄로 모여 나란히 붙는다.
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SeveralViewsScene } from './scene.js';

const H = 410;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 400;

// 세로 자리 — 위에서 아래로: 캡션 · 머리 1 결과 · 머리 1 활 · 토큰 · 입력 · 머리 2 활 · 머리 2 결과 · 이은 것
const CAP_Y = 22;
const CHIP_H = 22;
const CHIP_TOP = [38, 318] as const;
const TOK_Y = 186;
const TOK_R = 14;
const X_TOP = 208;
const X_H = 20;
const ARC_Y0 = [TOK_Y - TOK_R - 2, X_TOP + X_H + 6] as const;
const OUT_TOP = 372;
const GUTTER = 72;
/** 활의 두 끝을 토큰 가운데에서 비키는 거리 — 오가는 두 활의 화살촉이 겹치지 않게. */
const SIDE = 5;

type Anim = { kind: 'head'; index: number; p: number } | { kind: 'concat'; p: number };

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

/** 표시 자릿수 — 소수 둘째 자리. 셈에는 되돌려 쓰지 않는다. */
function fmt(n: number): string {
  const s = n.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const severalViewsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const theme = params.theme ?? 'light';
    const c: Palette = getColors(theme);
    const xs = parseFloat(fontSizes.xs);
    const sm = parseFloat(fontSizes.sm);
    const md = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function put(x: number, y: number, s: string, attrs: Record<string, string | number>, parent: Element = svg): void {
      const node = el('text', { x, y, 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = s;
    }

    function headName(id: string): string {
      if (id === 'h1') return t('label.h1', 'Head 1');
      if (id === 'h2') return t('label.h2', 'Head 2');
      throw new Error(`several-views 무대: 이름이 없는 머리 ${id}`);
    }

    function headColors(n: number): readonly string[] {
      return categorical(n, theme === 'dark' ? 'vivid' : 'deep');
    }

    function drawScene(s: SeveralViewsScene, anim: Anim | null): void {
      svg.textContent = '';
      if (s.heads.length !== 2) throw new Error('several-views 무대: 머리 둘만 그린다');
      const n = s.tokens.length;
      const colW = (W - GUTTER - 8) / n;
      const cx = (i: number): number => GUTTER + colW * (i + 0.5);
      const hc = headColors(s.heads.length);
      const dModel = (s.x[0] as number[]).length;

      // 캡션 — 지금 걸음이 말하는 것
      let caption: string;
      if (s.step.kind === 'start') {
        caption = t('caption.start', 'One row of tokens, two heads. Nothing computed yet.');
      } else if (s.step.kind === 'head') {
        const run = s.runs[s.step.index];
        if (run === undefined) throw new Error('several-views 무대: 걸음의 머리가 자취에 없다');
        if (run.split === null) {
          caption = t('caption.head', '{head}: strongest pair in each row. Rows: {rows}', {
            head: headName(run.head),
            rows: run.rows.length,
          });
        } else {
          const first = s.runs[0];
          if (first === undefined) throw new Error('several-views 무대: 첫 머리가 없다');
          caption = t('caption.split', '{head}: rows whose strongest pair differs from {first}: {diff} / {rows}', {
            head: headName(run.head),
            first: headName(first.head),
            diff: run.split.filter(Boolean).length,
            rows: run.rows.length,
          });
        }
      } else {
        const joined = s.joined;
        if (joined === null) throw new Error('several-views 무대: 이은 것이 없다');
        caption = t('caption.concat', 'Head results joined per token. Cells per token: {cells}', {
          cells: (joined.rows[0] as number[]).length,
        });
      }
      put(8, CAP_Y, caption, { 'font-size': md, fill: c.text });

      // 머리 이름 — 제 띠 옆 여백에
      s.heads.forEach((id, h) => {
        const y = h === 0 ? (CHIP_TOP[0] + ARC_Y0[0]) / 2 : (ARC_Y0[1] + CHIP_TOP[1] + CHIP_H) / 2;
        put(8, y, headName(id), { 'font-size': sm, 'font-weight': 600, fill: hc[h] as string });
      });
      put(8, X_TOP + X_H / 2 + 4, t('label.input', 'Input'), { 'font-size': xs, fill: c.textMuted });

      // 결과 자리 — 머리마다 토큰마다 빈 칸 틀
      const chipCell = (width: number): number => Math.min(44, (colW - 16) / width);
      s.heads.forEach((id, h) => {
        const width = s.widths[h];
        if (width === undefined) throw new Error(`several-views 무대: 머리 ${id} 의 결과 폭이 장면에 없다`);
        const cw = chipCell(width);
        for (let i = 0; i < n; i += 1) {
          el('rect', {
            x: cx(i) - (cw * width) / 2,
            y: CHIP_TOP[h] as number,
            width: cw * width,
            height: CHIP_H,
            rx: 3,
            fill: 'none',
            stroke: hc[h] as string,
            'stroke-opacity': 0.45,
            'stroke-dasharray': '3 3',
          });
        }
      });

      // 토큰 줄과 입력
      const xCell = Math.min(30, (colW - 12) / dModel);
      s.tokens.forEach((tok, i) => {
        el('circle', { cx: cx(i), cy: TOK_Y, r: TOK_R, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.5 });
        put(cx(i), TOK_Y + 5, tok, { 'font-size': md, 'font-weight': 700, 'text-anchor': 'middle', fill: c.text });
        const row = s.x[i] as number[];
        row.forEach((v, j) => {
          const x0 = cx(i) - (xCell * dModel) / 2 + xCell * j;
          el('rect', { x: x0, y: X_TOP, width: xCell, height: X_H, fill: c.bg, stroke: c.border });
          put(x0 + xCell / 2, X_TOP + X_H / 2 + 4, String(v), {
            'font-size': xs,
            'font-variant-numeric': 'tabular-nums',
            'text-anchor': 'middle',
            fill: c.textMuted,
          });
        });
      });

      // 머리마다 — 짝을 잇는 활과 결과 두 칸
      s.runs.forEach((run, h) => {
        const moving = anim !== null && anim.kind === 'head' && anim.index === h && anim.p < 1;
        const p = moving ? ease(anim.p) : 1;
        const up = h === 0;
        const y0 = ARC_Y0[h] as number;
        const room = up ? y0 - (CHIP_TOP[0] + CHIP_H) - 14 : CHIP_TOP[1] - y0 - 14;
        const color = hc[h] as string;
        const labels: { x: number; y: number; w: number }[] = [];

        run.rows.forEach((row, i) => {
          const j = s.tokens.indexOf(row.partner);
          if (j < 0) throw new Error('several-views 무대: 짝 토큰이 줄에 없다');
          const span = Math.abs(j - i);
          const rightward = j > i;
          const full = room * Math.min(1, 0.45 + 0.3 * span);
          const height = rightward ? full : full * 0.55;
          const dir = up ? -1 : 1;
          const side = rightward ? SIDE : -SIDE;
          const x0 = cx(i) + side;
          const x2 = cx(j) + side;
          const cxm = (x0 + x2) / 2;
          const cy1 = y0 + dir * 2 * height;
          // 부분 활 — 묻는 토큰에서 짝 쪽으로 p 만큼 (드 카스텔조)
          const q1x = lerp(x0, cxm, p);
          const q1y = lerp(y0, cy1, p);
          const ex = lerp(q1x, lerp(cxm, x2, p), p);
          const ey = lerp(q1y, lerp(cy1, y0, p), p);
          if (p > 0) {
            el('path', {
              d: `M ${r2(x0)} ${r2(y0)} Q ${r2(q1x)} ${r2(q1y)} ${r2(ex)} ${r2(ey)}`,
              fill: 'none',
              stroke: color,
              'stroke-width': 2,
            });
            // 화살촉 — 끝의 접선 방향
            const tx = ex - q1x;
            const ty = ey - q1y;
            const len = Math.hypot(tx, ty);
            if (len > 0.5) {
              const ux = tx / len;
              const uy = ty / len;
              const a = 7;
              const b = 3.5;
              el('polygon', {
                points: [
                  [ex, ey],
                  [ex - ux * a - uy * b, ey - uy * a + ux * b],
                  [ex - ux * a + uy * b, ey - uy * a - ux * b],
                ]
                  .map(([px, py]) => `${r2(px as number)},${r2(py as number)}`)
                  .join(' '),
                fill: color,
              });
            }
          }
          if (!moving) labels.push({ x: cxm, y: y0 + dir * height, w: row.weight });

          // 결과 두 칸 — 토큰에서 제 띠로
          const width = row.result.length;
          const cw = chipCell(width);
          const topEnd = CHIP_TOP[h] as number;
          const top = lerp(TOK_Y - CHIP_H / 2, topEnd, p);
          row.result.forEach((v, k) => {
            const x1 = cx(i) - (cw * width) / 2 + cw * k;
            el('rect', { x: x1, y: top, width: cw, height: CHIP_H, fill: c.bg, stroke: color, 'stroke-width': 1.5 });
            put(x1 + cw / 2, top + CHIP_H / 2 + 4, fmt(v), {
              'font-size': xs,
              'font-variant-numeric': 'tabular-nums',
              'text-anchor': 'middle',
              fill: c.text,
            });
          });
        });

        // 가장 큰 무게 — 활 꼭대기에
        for (const lb of labels) {
          const bw = 30;
          el('rect', { x: lb.x - bw / 2, y: lb.y - 8, width: bw, height: 15, rx: 3, fill: c.bg, stroke: color, 'stroke-width': 1 });
          put(lb.x, lb.y + 3.5, fmt(lb.w), { 'font-size': xs, 'font-variant-numeric': 'tabular-nums', 'text-anchor': 'middle', fill: c.text });
        }

        // 첫 머리와 짝이 갈린 줄 — 토큰에 고리
        if (run.split !== null && !moving) {
          run.split.forEach((differs, i) => {
            if (!differs) return;
            el('circle', { cx: cx(i), cy: TOK_Y, r: TOK_R + 4, fill: 'none', stroke: c.accent, 'stroke-width': 3 });
          });
        }
      });

      // 이은 것 — 머리 결과가 맨 아래 한 줄로 모인다
      const joined = s.joined;
      if (joined !== null) {
        const moving = anim !== null && anim.kind === 'concat' && anim.p < 1;
        const p = moving ? ease(anim.p) : 1;
        const total = (joined.rows[0] as number[]).length;
        const oc = Math.min(33, (colW - 4) / total);
        put(8, OUT_TOP + CHIP_H / 2 + 4, t('label.output', 'Joined'), { 'font-size': xs, fill: c.textMuted });
        joined.rows.forEach((vals, i) => {
          let k = 0;
          joined.widths.forEach((width, h) => {
            const cw = chipCell(width);
            for (let m = 0; m < width; m += 1, k += 1) {
              const fromX = cx(i) - (cw * width) / 2 + cw * m;
              const toX = cx(i) - (oc * total) / 2 + oc * k;
              const x1 = lerp(fromX, toX, p);
              const w1 = lerp(cw, oc, p);
              const y1 = lerp(CHIP_TOP[h] as number, OUT_TOP, p);
              el('rect', { x: x1, y: y1, width: w1, height: CHIP_H, fill: c.bg, stroke: hc[h] as string, 'stroke-width': 1.5 });
              put(x1 + w1 / 2, y1 + CHIP_H / 2 + 4, fmt(vals[k] as number), {
                'font-size': xs,
                'font-variant-numeric': 'tabular-nums',
                'text-anchor': 'middle',
                fill: c.text,
              });
            }
          });
        });
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
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

    async function run(s: SeveralViewsScene, make: (p: number) => Anim, mine: number): Promise<void> {
      const start = performance.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (performance.now() - start) / MOVE_MS);
        if (p >= 1) return;
        drawScene(s, make(p));
        await wait(16);
      }
    }

    return {
      async render(next: SeveralViewsScene, prev: SeveralViewsScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        const flows = opts.animate && prev !== null && step.kind !== 'start';
        if (flows) {
          if (step.kind === 'head') {
            const index = step.index;
            await run(next, (p) => ({ kind: 'head', index, p }), mine);
          } else {
            await run(next, (p) => ({ kind: 'concat', p }), mine);
          }
          if (mine !== gen || destroyed) return;
        }
        drawScene(next, null);
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
