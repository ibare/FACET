/**
 * impurity-drops-stage — 섞임이 수 하나로 재어지고, 가를 때마다 그 수가 떨어진다.
 *
 * ── 화면을 왜 이렇게 짰는가
 *
 * 산점도는 무대이지 주인공이 아니다. 왼쪽 작은 칸에서 가름선이 평면을 나누는
 * 것만 보이고, 화면의 대부분은 오른쪽 **섞임 자(尺)** 가 쓴다.
 *
 * 자 위의 통은 가로 막대 하나다. 그 막대에서
 *   - **폭**은 담긴 개수다 (열둘이 자의 전 폭을 나눠 갖는다),
 *   - **색 경계의 자리**는 비율이다 (한가운데 눈금에서 얼마나 벗어났는가),
 *   - **높이**는 섞임이다.
 * 그리고 높이를 정하는 것은 폭이 아니라 경계의 자리다. 지니가 정확히 그렇게
 * 생겼기 때문이다 — `gini = 0.5 − 2·(p − 0.5)²`. 개수만 보이는 화면으로는 이
 * 조각이 할 말을 못 하므로, 두 가지를 한 막대에 같이 새겨 서로 무관하다는 것을
 * 보게 한다. 실제로 첫 층에서 **더 넓은 통이 더 높이 남는다**.
 *
 * 갈릴 때 막대는 제자리에서 쪼개지고 조각들이 저마다 제 높이로 **내려간다**.
 * 두 조각의 폭 합은 부모의 폭과 같으므로, 층의 가중 평균은 두 조각의 무게중심과
 * 정확히 같은 높이가 된다 — 노란 띠가 거기 그어진다.
 *
 * 좌표는 전부 여기서 셈한다. 선언(`initialData`)에 있는 것은 점 · 이름표 ·
 * 가름선의 기준값뿐이다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 296;

// 머리글 줄 — 왼쪽은 이름표 범례, 오른쪽은 섞임 자의 이름과 셈법.
const HEAD_Y = 20;
const FORMULA_Y = 36;

// 산점도 (무대)
const PLOT_X = 16;
const PLOT_Y = 48;
const PLOT_W = 186;
const PLOT_H = 186;

// 섞임 자 (주인공)
const AXIS_X = 248;
const TICK_X = 242;
const ARROW_X = 262;
const BARS_X = 276;
const BARS_W = 328;
const LADDER_TOP = 62;
const LADDER_BOT = 224;

const BAR_H = 18;
const BAR_GAP = 3;
const DOT_R = 4.4;

const CAP_Y1 = 262;
const CAP_Y2 = 279;
const CAP_W = W - PLOT_X * 2;

const DUR_POUR = 380;
const DUR_CUT = 340;
const DUR_DROP = 520;
const DUR_LEVEL = 380;
const DUR_TINT = 420;

/** 통이 차지한 평면의 칸. null 은 열린 쪽 — 그림이 제 가장자리까지 늘린다. */
export type StageBox = {
  xLo: number | null;
  xHi: number | null;
  yLo: number | null;
  yHi: number | null;
};

export type StageBucket = {
  id: string;
  box: StageBox;
  counts: number[];
  n: number;
  gini: number;
  pureClass: number;
};

export type StageCut = {
  bucketId: string;
  axis: 'x' | 'y';
  at: number;
  box: StageBox;
};

/** 마운트 때 한 번 읽는 무대 재료. 사건 payload 와 달리 이것은 선언에서 온다. */
export type ImpurityScene = {
  points: { x: number; y: number; label: string }[];
  classes: string[];
};

/**
 * `initialData` 를 무대 재료로 좁힌다.
 *
 * mount 가 유일한 소비자다 — projector 는 사건 payload 만 좁히므로 좁히는 규칙이
 * 두 벌로 갈리지 않는다 (C9 / S-piece).
 */
export function readImpurityScene(initialData: unknown): ImpurityScene {
  const d = initialData as
    | { points?: unknown; classes?: unknown }
    | undefined;
  const points: { x: number; y: number; label: string }[] = [];
  if (Array.isArray(d?.points)) {
    for (const raw of d.points) {
      const p = raw as { x?: unknown; y?: unknown; label?: unknown };
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') continue;
      points.push({ x: p.x, y: p.y, label: typeof p.label === 'string' ? p.label : '' });
    }
  }
  const classes: string[] = [];
  if (Array.isArray(d?.classes)) {
    for (const c of d.classes) if (typeof c === 'string') classes.push(c);
  }
  return { points, classes };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/** 색 리터럴이 아니라 순수 변환이다 — 입력 hex 는 토큰에서 온다 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 한글은 한 칸, 라틴은 반 칸으로 어림한 글자 폭. 줄바꿈 자리를 정하는 데만 쓴다. */
function runWidth(s: string): number {
  let u = 0;
  for (const ch of s) u += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 1 : 0.52;
  return u;
}

function wrapTwo(text: string, maxUnits: number): [string, string] {
  const words = text.split(' ');
  let first = '';
  let rest = '';
  for (const word of words) {
    const joined = first === '' ? word : `${first} ${word}`;
    // 첫 낱말은 넘쳐도 첫 줄에 둔다 — 그러지 않으면 첫 줄이 통째로 빈다.
    if (rest === '' && (first === '' || runWidth(joined) <= maxUnits)) {
      first = joined;
      continue;
    }
    rest = rest === '' ? word : `${rest} ${word}`;
  }
  return [first, rest];
}

type Bar = {
  id: string;
  n: number;
  counts: number[];
  gini: number;
  g: SVGGElement;
  segs: SVGRectElement[];
  segLabels: SVGTextElement[];
  bounds: SVGLineElement[];
  tick: SVGLineElement;
  label: SVGTextElement;
  outline: SVGRectElement;
  x: number;
  w: number;
  cy: number;
};

export const impurityDropsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너는 건드리지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const canvas = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readImpurityScene(params.initialData);

    const classCount = Math.max(2, scene.classes.length);
    const classColors = categorical(classCount, 'vivid');
    const GMAX = 1 - 1 / classCount;

    // ── 데이터 좌표 → 화면 좌표
    const xs = scene.points.map((p) => p.x);
    const ys = scene.points.map((p) => p.y);
    const span = (v: number[]): [number, number] => {
      if (v.length === 0) return [0, 1];
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      const pad = hi - lo < 1e-9 ? 1 : (hi - lo) * 0.13;
      return [lo - pad, hi + pad];
    };
    const [xLo, xHi] = span(xs);
    const [yLo, yHi] = span(ys);
    const sx = (v: number): number => PLOT_X + ((v - xLo) / (xHi - xLo)) * PLOT_W;
    const sy = (v: number): number => PLOT_Y + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H;
    const levelY = (g: number): number => {
      const t = Math.max(0, Math.min(1, GMAX <= 0 ? 0 : g / GMAX));
      return LADDER_BOT - t * (LADDER_BOT - LADDER_TOP);
    };
    const boxRect = (b: StageBox): { x: number; y: number; w: number; h: number } => {
      const x0 = b.xLo === null ? PLOT_X : sx(b.xLo);
      const x1 = b.xHi === null ? PLOT_X + PLOT_W : sx(b.xHi);
      const y0 = b.yHi === null ? PLOT_Y : sy(b.yHi);
      const y1 = b.yLo === null ? PLOT_Y + PLOT_H : sy(b.yLo);
      return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    };

    // ── 애니메이션 자원. destroy 가 이 둘을 통째로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function animate(durMs: number, ease: (t: number) => number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return; // destroy 가 waiters 를 깨운다
          const raw = Math.min(1, (now() - started) / durMs);
          step(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        const first = requestAnimationFrame(() => {
          frames.delete(first);
          tick();
        });
        frames.add(first);
      });
    }

    // ── 정적 뼈대
    const root = el('g');
    canvas.appendChild(root);

    // 쌓는 차례가 곧 가리는 차례다. 바탕 → 물든 칸 → 가름선 → 점 → 테두리.
    const gHead = el('g');
    const gPlot = el('g');
    const gRegions = el('g');
    const gCuts = el('g');
    const gPoints = el('g');
    const gFrame = el('g');
    const gLadder = el('g');
    const gLevel = el('g');
    const gBars = el('g');
    const gCaption = el('g');
    for (const layer of [gHead, gPlot, gRegions, gCuts, gPoints, gFrame, gLadder, gLevel, gBars, gCaption]) {
      root.appendChild(layer);
    }

    function textNode(
      x: number,
      y: number,
      s: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      family: string = fonts.body,
    ): SVGTextElement {
      const t = el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
      t.textContent = s;
      return t;
    }

    // 범례 — 점의 모양과 색이 곧 막대의 색이다. 그것이 산점도와 자를 잇는다.
    function glyph(cx: number, cy: number, r: number, idx: number, fill: string): SVGElement {
      if (idx % 3 === 1) {
        return el('rect', { x: cx - r * 0.9, y: cy - r * 0.9, width: r * 1.8, height: r * 1.8, fill });
      }
      if (idx % 3 === 2) {
        return el('polygon', {
          points: `${cx},${cy - r * 1.1} ${cx + r * 1.1},${cy} ${cx},${cy + r * 1.1} ${cx - r * 1.1},${cy}`,
          fill,
        });
      }
      return el('circle', { cx, cy, r, fill });
    }

    {
      let lx = PLOT_X;
      for (let k = 0; k < scene.classes.length; k += 1) {
        gHead.appendChild(glyph(lx + 5, HEAD_Y - 4, 4.4, k, classColors[k] ?? c.itemDefault));
        gHead.appendChild(
          textNode(lx + 14, HEAD_Y, scene.classes[k] ?? '', fontSizes.sm, c.text, 'start'),
        );
        lx += 34;
      }
      gHead.appendChild(
        textNode(AXIS_X, HEAD_Y, tr('label.impurity', 'impurity'), fontSizes.sm, c.text, 'start'),
      );
      gHead.appendChild(
        textNode(
          AXIS_X,
          FORMULA_Y,
          tr('label.formula', 'impurity = 1 − p(A)² − p(B)²'),
          fontSizes.xs,
          c.textMuted,
          'start',
        ),
      );
    }

    // 산점도 틀
    gPlot.appendChild(
      el('rect', { x: PLOT_X, y: PLOT_Y, width: PLOT_W, height: PLOT_H, fill: c.bgSubtle }),
    );
    gFrame.appendChild(
      el('rect', {
        x: PLOT_X,
        y: PLOT_Y,
        width: PLOT_W,
        height: PLOT_H,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    gFrame.appendChild(
      textNode(PLOT_X + PLOT_W - 6, PLOT_Y + PLOT_H - 6, 'x', fontSizes.xs, c.textMuted, 'end', fonts.mono),
    );
    gFrame.appendChild(textNode(PLOT_X + 6, PLOT_Y + 14, 'y', fontSizes.xs, c.textMuted, 'start', fonts.mono));

    for (const p of scene.points) {
      const k = scene.classes.indexOf(p.label);
      gPoints.appendChild(glyph(sx(p.x), sy(p.y), DOT_R, Math.max(0, k), classColors[Math.max(0, k)] ?? c.text));
    }

    // 섞임 자 — 세로축과 눈금, 그리고 바닥선
    gLadder.appendChild(
      el('line', {
        x1: AXIS_X,
        y1: LADDER_TOP - 12,
        x2: AXIS_X,
        y2: LADDER_BOT + 12,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    for (const g of [GMAX, GMAX / 2, 0]) {
      const y = levelY(g);
      gLadder.appendChild(
        el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border, 'stroke-width': 1 }),
      );
      gLadder.appendChild(textNode(TICK_X, y + 3.5, g.toFixed(2), fontSizes.xs, c.textMuted, 'end', fonts.mono));
    }
    gLadder.appendChild(
      el('line', {
        x1: AXIS_X,
        y1: LADDER_BOT,
        x2: BARS_X + BARS_W,
        y2: LADDER_BOT,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );

    const capLine1 = textNode(PLOT_X, CAP_Y1, '', fontSizes.md, c.text, 'start');
    const capLine2 = textNode(PLOT_X, CAP_Y2, '', fontSizes.md, c.text, 'start');
    gCaption.appendChild(capLine1);
    gCaption.appendChild(capLine2);

    // ── 막대
    const bars = new Map<string, Bar>();
    let totalN = 0;
    let levelBand: SVGRectElement | null = null;
    let ghostLine: SVGLineElement | null = null;

    function unitPx(): number {
      return totalN > 0 ? BARS_W / totalN : BARS_W;
    }

    function layoutBar(bar: Bar, x: number, w: number, cy: number): void {
      bar.x = x;
      bar.w = w;
      bar.cy = cy;
      const top = cy - BAR_H / 2;
      let acc = 0;
      for (let k = 0; k < bar.segs.length; k += 1) {
        const frac = bar.n > 0 ? (bar.counts[k] ?? 0) / bar.n : 0;
        const sw = Math.max(0, frac * w);
        const seg = bar.segs[k];
        if (seg) {
          seg.setAttribute('x', String(x + acc));
          seg.setAttribute('y', String(top));
          seg.setAttribute('width', String(sw));
          seg.setAttribute('height', String(BAR_H));
        }
        const lab = bar.segLabels[k];
        if (lab) {
          if (sw >= 15) {
            lab.removeAttribute('display');
            lab.setAttribute('x', String(x + acc + sw / 2));
            lab.setAttribute('y', String(top + BAR_H / 2 + 3.6));
          } else {
            lab.setAttribute('display', 'none');
          }
        }
        acc += sw;
        const bound = bar.bounds[k];
        if (bound) {
          bound.setAttribute('x1', String(x + acc));
          bound.setAttribute('x2', String(x + acc));
          bound.setAttribute('y1', String(top - 3));
          bound.setAttribute('y2', String(top + BAR_H + 3));
        }
      }
      bar.tick.setAttribute('x1', String(x + w / 2));
      bar.tick.setAttribute('x2', String(x + w / 2));
      bar.tick.setAttribute('y1', String(top - 6));
      bar.tick.setAttribute('y2', String(top + BAR_H + 6));
      bar.label.setAttribute('x', String(x + w / 2));
      bar.label.setAttribute('y', String(top - 6));
      bar.outline.setAttribute('x', String(x));
      bar.outline.setAttribute('y', String(top));
      bar.outline.setAttribute('width', String(Math.max(0, w)));
      bar.outline.setAttribute('height', String(BAR_H));
    }

    function makeBar(b: StageBucket): Bar {
      const g = el('g');
      const segs: SVGRectElement[] = [];
      const segLabels: SVGTextElement[] = [];
      const bounds: SVGLineElement[] = [];
      const segCount = Math.max(b.counts.length, 1);
      for (let k = 0; k < segCount; k += 1) {
        segs.push(el('rect', { x: 0, y: 0, width: 0, height: BAR_H, fill: classColors[k] ?? c.itemDefault }));
        segLabels.push(textNode(0, 0, String(b.counts[k] ?? 0), fontSizes.xs, c.stateInk, 'middle', fonts.mono));
        if (k < segCount - 1) {
          bounds.push(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: c.text, 'stroke-width': 1.6 }));
        }
      }
      // 반반 눈금 — 색 경계가 여기서 얼마나 벗어났는지가 곧 섞임이다.
      const tick = el('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '2 2',
      });
      const outline = el('rect', { x: 0, y: 0, width: 0, height: BAR_H, fill: 'none', stroke: 'none' });
      const label = textNode(0, 0, b.gini.toFixed(4), fontSizes.xs, c.text, 'middle', fonts.mono);
      for (const seg of segs) g.appendChild(seg);
      g.appendChild(outline);
      for (const bd of bounds) g.appendChild(bd);
      g.appendChild(tick);
      for (const lab of segLabels) g.appendChild(lab);
      g.appendChild(label);
      gBars.appendChild(g);
      return {
        id: b.id,
        n: b.n,
        counts: b.counts.slice(),
        gini: b.gini,
        g,
        segs,
        segLabels,
        bounds,
        tick,
        label,
        outline,
        x: BARS_X,
        w: 0,
        cy: levelY(b.gini),
      };
    }

    /** 통들이 자의 전 폭을 개수 비율로 나눠 갖는다. 왼쪽부터 차례로. */
    function spans(list: StageBucket[]): { x: number; w: number }[] {
      const u = unitPx();
      const out: { x: number; w: number }[] = [];
      let acc = 0;
      for (const b of list) {
        out.push({ x: BARS_X + acc * u + BAR_GAP / 2, w: Math.max(1, b.n * u - BAR_GAP) });
        acc += b.n;
      }
      return out;
    }

    function clear(node: SVGGElement): void {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    function setCaption(text: string): void {
      const [a, b] = wrapTwo(text, CAP_W / 14);
      capLine1.textContent = a;
      capLine2.textContent = b;
    }

    /** 그림만 비운다. 캡션은 남긴다 — 걸음이 캡션을 먼저 세우고 그림을 그린다. */
    function clearFigure(): void {
      clear(gBars);
      clear(gCuts);
      clear(gRegions);
      clear(gLevel);
      bars.clear();
      levelBand = null;
      ghostLine = null;
      totalN = 0;
    }

    function reset(): void {
      clearFigure();
      capLine1.textContent = '';
      capLine2.textContent = '';
    }

    // ── projector 가 부르는 것들

    /** 뿌리 통 하나가 자의 꼭대기에 부어진다. 폭이 가운데에서 좌우로 벌어진다. */
    async function showSample(v: { buckets: StageBucket[] }): Promise<void> {
      clearFigure();
      totalN = v.buckets.reduce((a, b) => a + b.n, 0);
      const place = spans(v.buckets);
      const made = v.buckets.map((b) => {
        const bar = makeBar(b);
        bars.set(b.id, bar);
        return bar;
      });
      await animate(DUR_POUR, easeOut, (t) => {
        for (let i = 0; i < made.length; i += 1) {
          const bar = made[i];
          const p = place[i];
          if (!bar || !p) continue;
          const cx = p.x + p.w / 2;
          layoutBar(bar, cx - (p.w * t) / 2, p.w * t, levelY(bar.gini));
        }
      });
    }

    /** 가름선이 제 칸 안에서 좌우(또는 위아래)로 뻗어 나간다. */
    async function drawCuts(v: { cuts: StageCut[] }): Promise<void> {
      const lines = v.cuts.map((cut) => {
        const r = boxRect(cut.box);
        const line = el('line', { stroke: c.text, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
        gCuts.appendChild(line);
        return { line, cut, r };
      });
      await animate(DUR_CUT, easeOut, (t) => {
        for (const { line, cut, r } of lines) {
          if (cut.axis === 'x') {
            const x = sx(cut.at);
            const cy = r.y + r.h / 2;
            line.setAttribute('x1', String(x));
            line.setAttribute('x2', String(x));
            line.setAttribute('y1', String(cy - (r.h / 2) * t));
            line.setAttribute('y2', String(cy + (r.h / 2) * t));
          } else {
            const y = sy(cut.at);
            const cx = r.x + r.w / 2;
            line.setAttribute('y1', String(y));
            line.setAttribute('y2', String(y));
            line.setAttribute('x1', String(cx - (r.w / 2) * t));
            line.setAttribute('x2', String(cx + (r.w / 2) * t));
          }
        }
      });
    }

    /** 막대가 제자리에서 쪼개지고, 조각들이 저마다 제 섞임 높이로 내려간다. */
    async function splitBuckets(v: { buckets: StageBucket[] }): Promise<void> {
      const place = spans(v.buckets);
      const moves: { bar: Bar; x: number; w: number; from: number; to: number }[] = [];
      const kept = new Set<string>();

      for (let i = 0; i < v.buckets.length; i += 1) {
        const b = v.buckets[i];
        const p = place[i];
        if (!b || !p) continue;
        kept.add(b.id);
        const existing = bars.get(b.id);
        if (existing) {
          moves.push({ bar: existing, x: p.x, w: p.w, from: existing.cy, to: levelY(b.gini) });
          continue;
        }
        // 새 조각은 부모가 있던 높이에서 태어난다 — 거기서부터 내려가야 한다.
        const parentId = b.id.slice(0, b.id.lastIndexOf('/'));
        const parent = bars.get(parentId);
        const from = parent ? parent.cy : levelY(b.gini);
        const bar = makeBar(b);
        bars.set(b.id, bar);
        layoutBar(bar, p.x, p.w, from);
        moves.push({ bar, x: p.x, w: p.w, from, to: levelY(b.gini) });
      }

      // 부모 막대는 조각이 제자리를 물려받는 순간 물러난다.
      for (const [id, bar] of [...bars]) {
        if (kept.has(id)) continue;
        bar.g.remove();
        bars.delete(id);
      }

      await animate(DUR_DROP, easeInOut, (t) => {
        for (const m of moves) layoutBar(m.bar, m.x, m.w, m.from + (m.to - m.from) * t);
      });
    }

    /** 층 전체의 섞임 — 조각들의 무게중심 높이. 띠가 거기까지 내려온다. */
    async function markLevel(v: { from: number; to: number }): Promise<void> {
      const yFrom = levelY(v.from);
      const yTo = levelY(v.to);

      if (ghostLine) ghostLine.remove();
      ghostLine = el('line', {
        x1: AXIS_X,
        y1: yFrom,
        x2: BARS_X + BARS_W,
        y2: yFrom,
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      gLevel.appendChild(ghostLine);

      if (!levelBand) {
        levelBand = el('rect', {
          x: AXIS_X,
          y: yFrom - 1.5,
          width: BARS_X + BARS_W - AXIS_X,
          height: 3,
          fill: c.accent,
        });
        gLevel.appendChild(levelBand);
      }
      const band = levelBand;

      const arrow = el('line', {
        x1: ARROW_X,
        y1: yFrom,
        x2: ARROW_X,
        y2: yFrom,
        stroke: c.text,
        'stroke-width': 1.4,
      });
      const head = el('polygon', { fill: c.text, points: '0,0 0,0 0,0' });
      if (yTo - yFrom > 2) {
        gLevel.appendChild(arrow);
        gLevel.appendChild(head);
      }

      await animate(DUR_LEVEL, easeInOut, (t) => {
        const y = yFrom + (yTo - yFrom) * t;
        band.setAttribute('y', String(y - 1.5));
        arrow.setAttribute('y2', String(y));
        head.setAttribute(
          'points',
          `${ARROW_X},${y} ${ARROW_X - 3.4},${y - 6} ${ARROW_X + 3.4},${y - 6}`,
        );
      });
    }

    /** 통마다 한 이름표만 남았으면 그 칸이 그 이름표의 색으로 물든다. */
    async function settle(v: { buckets: StageBucket[] }): Promise<void> {
      const tints: { rect: SVGRectElement; r: { x: number; y: number; w: number; h: number } }[] = [];
      for (const b of v.buckets) {
        const bar = bars.get(b.id);
        if (bar) {
          bar.outline.setAttribute('stroke', c.itemSorted);
          bar.outline.setAttribute('stroke-width', '1.4');
        }
        if (b.pureClass < 0) continue;
        const fill = classColors[b.pureClass] ?? c.itemDefault;
        const r = boxRect(b.box);
        const rect = el('rect', { x: r.x + r.w / 2, y: r.y + r.h / 2, width: 0, height: 0, fill: hexToRgba(fill, 0.16) });
        gRegions.appendChild(rect);
        tints.push({ rect, r });
      }
      await animate(DUR_TINT, easeOut, (t) => {
        for (const { rect, r } of tints) {
          rect.setAttribute('x', String(r.x + (r.w / 2) * (1 - t)));
          rect.setAttribute('y', String(r.y + (r.h / 2) * (1 - t)));
          rect.setAttribute('width', String(r.w * t));
          rect.setAttribute('height', String(r.h * t));
        }
      });
    }

    return {
      showSample,
      drawCuts,
      splitBuckets,
      markLevel,
      settle,
      setCaption,
      reset,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
