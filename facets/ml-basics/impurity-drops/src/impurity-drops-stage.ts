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
 * 정확히 같은 높이가 된다 — 띠가 거기 그어진다.
 *
 * ── 어휘를 두 축으로 가른다
 *
 *   **채움** = 값의 형편 (어느 이름표가 얼마나 담겼나 · 그래서 막대가 어느 높이에
 *              서나). 갈릴 때마다 덮인다.
 *   **테두리** = 짚음의 표식 (더 물을 것이 없다고 판정된 통). 한 번 서면 남는다.
 *
 * 둘을 갈라 두어야 "순수해졌다" 가 "이만큼 담겼다" 를 덮지 않는다.
 *
 * ── 지나온 층은 지우지 않는다
 *
 * 잰 층마다 유령선이 하나씩 쌓이고 화살이 그 사이를 잇는다. 이 조각의 주장이
 * **두 수의 견줌**이라 앞 층이 화면에 남아 있어야 "떨어졌다" 가 읽힌다.
 *
 * 화면은 걸음마다 **통째로** 다시 세워진다 (`render`). 좌표는 전부 여기서 셈한다 —
 * 장면이 쥔 것은 점 · 이름표 · 통의 개수 · 잰 층의 값 같은 **구조**뿐이다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { ImpurityBox } from './algorithm.js';
import {
  bucketsOf,
  classCountOf,
  countOf,
  currentLevelOf,
  dropOf,
  giniOf,
  lastCutsOf,
  previousBucketsOf,
  previousLevelOf,
  pureClassOf,
  totalOf,
  type ImpurityBucket,
  type ImpurityCutMark,
  type ImpurityDropsScene,
} from './scene.js';

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
/** 띠의 두께. 절반이 곧 선의 중심에서 위아래로 뻗는 몫이다. */
const BAND_H = 3;

const CAP_Y1 = 262;
const CAP_Y2 = 279;
const CAP_W = W - PLOT_X * 2;

const DUR_POUR = 380;
const DUR_CUT = 340;
const DUR_DROP = 520;
const DUR_LEVEL = 380;
const DUR_TINT = 420;

/** 화면 좌표의 칸 하나. */
type Rect = { x: number; y: number; w: number; h: number };

/** 자 위에서 통 하나가 차지하는 가로 구간. */
type Place = { x: number; w: number };

/** 막대 하나를 이루는 노드들. 걸음마다 새로 지어지므로 손잡이만 담는다. */
type BarNodes = {
  counts: readonly number[];
  n: number;
  segs: SVGRectElement[];
  segLabels: SVGTextElement[];
  bounds: SVGLineElement[];
  tick: SVGLineElement;
  label: SVGTextElement;
  outline: SVGRectElement;
};

/** 정적 그리기가 세운 것들. 운동은 여기 담긴 노드만 만진다. */
type Drawn = {
  bars: { node: BarNodes; bucket: ImpurityBucket; place: Place; cy: number }[];
  cuts: { line: SVGLineElement; cut: ImpurityCutMark; rect: Rect }[];
  band: SVGRectElement | null;
  arrow: { line: SVGLineElement; head: SVGPolygonElement } | null;
  tints: { rect: SVGRectElement; box: Rect }[];
};

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

/** 섞임 값은 네 자리로 읽는다 — 0.4082 와 0.3200 이 갈리는 자리가 거기다. */
function level(v: number): string {
  return v.toFixed(4);
}

/** 기준값은 꼬리 0 을 떼고 읽는다 — 3 과 3.5 를 있는 그대로. */
function threshold(v: number): string {
  return String(Number(v.toFixed(3)));
}

export const impurityDropsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ImpurityDropsScene> {
    // 컨테이너는 건드리지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const canvas = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 쌓는 차례가 곧 가리는 차례다.
    const root = el('g');
    canvas.appendChild(root);
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
    const layers = [gHead, gPlot, gRegions, gCuts, gPoints, gFrame, gLadder, gLevel, gBars, gCaption];
    for (const layer of layers) root.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /**
     * 보간 한 마디.
     *
     * CSS transition 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition 은
     * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(
      durMs: number,
      mine: number,
      ease: (p: number) => number,
      draw: (e: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
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
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = durMs <= 0 ? 1 : Math.min(1, (now() - started) / durMs);
          draw(ease(raw));
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
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
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
      const node = el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
      node.textContent = s;
      return node;
    }

    /** 범례의 낱개 모양. 점의 모양과 색이 곧 막대의 색이라 산점도와 자가 이어진다. */
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

    /** 낙차 화살의 머리. 자리에서 곧바로 만들어 끝자리가 흘러 남지 않게 한다. */
    function headPoints(y: number): string {
      return `${ARROW_X},${y} ${ARROW_X - 3.4},${y - 6} ${ARROW_X + 3.4},${y - 6}`;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────
    //
    // 그리기 전에 한 번에 셈한다. 그리면서 이웃의 지금 좌표를 읽으면 순회 순서가
    // 곧 숨은 상태가 된다 (프로토콜 4 절).

    /** 데이터 좌표 → 화면 좌표. 점 전부에서 한 번에 정해진다. */
    type Scales = {
      sx: (v: number) => number;
      sy: (v: number) => number;
      levelY: (g: number) => number;
      classColors: readonly string[];
    };

    function scalesOf(scene: ImpurityDropsScene): Scales {
      const span = (v: number[]): [number, number] => {
        if (v.length === 0) return [0, 1];
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const pad = hi - lo < 1e-9 ? 1 : (hi - lo) * 0.13;
        return [lo - pad, hi + pad];
      };
      const [xLo, xHi] = span(scene.points.map((p) => p.x));
      const [yLo, yHi] = span(scene.points.map((p) => p.y));
      // 이름표의 수는 바탕 자료에서 한 번에 센다 — 드러난 수로 정하면 무리가
      // 늘 때 hue 간격이 통째로 갈린다 (프로토콜 4 절).
      const classCount = classCountOf(scene);
      const gMax = 1 - 1 / classCount;
      return {
        sx: (v) => PLOT_X + ((v - xLo) / (xHi - xLo)) * PLOT_W,
        sy: (v) => PLOT_Y + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H,
        levelY: (g) => {
          const p = Math.max(0, Math.min(1, gMax <= 0 ? 0 : g / gMax));
          return LADDER_BOT - p * (LADDER_BOT - LADDER_TOP);
        },
        classColors: categorical(classCount, 'vivid'),
      };
    }

    function boxRect(s: Scales, b: ImpurityBox): Rect {
      const x0 = b.xLo === null ? PLOT_X : s.sx(b.xLo);
      const x1 = b.xHi === null ? PLOT_X + PLOT_W : s.sx(b.xHi);
      const y0 = b.yHi === null ? PLOT_Y : s.sy(b.yHi);
      const y1 = b.yLo === null ? PLOT_Y + PLOT_H : s.sy(b.yLo);
      return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    }

    /** 통들이 자의 전 폭을 개수 비율로 나눠 갖는다. 왼쪽부터 차례로. */
    function placesOf(buckets: readonly ImpurityBucket[], total: number): Place[] {
      const u = total > 0 ? BARS_W / total : BARS_W;
      const out: Place[] = [];
      let acc = 0;
      for (const b of buckets) {
        const n = countOf(b.counts);
        out.push({ x: BARS_X + acc * u + BAR_GAP / 2, w: Math.max(1, n * u - BAR_GAP) });
        acc += n;
      }
      return out;
    }

    /** 막대 하나를 그 자리에 세운다. 운동은 이 함수만 되풀이해 부른다. */
    function layoutBar(bar: BarNodes, x: number, w: number, cy: number): void {
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

    /**
     * 막대 하나를 짓는다.
     *
     * 채움은 값의 형편(이름표별 몫), 테두리는 짚음의 표식(더 물을 것이 없다)이다 —
     * 두 축을 갈라 두어야 서로를 덮지 않는다.
     */
    function makeBar(s: Scales, b: ImpurityBucket, settled: boolean): BarNodes {
      const g = el('g');
      const n = countOf(b.counts);
      const segs: SVGRectElement[] = [];
      const segLabels: SVGTextElement[] = [];
      const bounds: SVGLineElement[] = [];
      const segCount = Math.max(b.counts.length, 1);
      for (let k = 0; k < segCount; k += 1) {
        segs.push(
          el('rect', { x: 0, y: 0, width: 0, height: BAR_H, fill: s.classColors[k] ?? c.itemDefault }),
        );
        segLabels.push(
          textNode(0, 0, String(b.counts[k] ?? 0), fontSizes.xs, c.stateInk, 'middle', fonts.mono),
        );
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
      const outline = el('rect', {
        x: 0,
        y: 0,
        width: 0,
        height: BAR_H,
        fill: 'none',
        stroke: settled ? c.itemSorted : 'none',
        'stroke-width': settled ? 1.4 : 0,
      });
      const label = textNode(0, 0, level(giniOf(b.counts)), fontSizes.xs, c.text, 'middle', fonts.mono);
      for (const seg of segs) g.appendChild(seg);
      g.appendChild(outline);
      for (const bd of bounds) g.appendChild(bd);
      g.appendChild(tick);
      for (const lab of segLabels) g.appendChild(lab);
      g.appendChild(label);
      gBars.appendChild(g);
      return { counts: b.counts, n, segs, segLabels, bounds, tick, label, outline };
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 이 걸음이 하는 말.
     *
     * 수는 전부 장면이 제 막대에서 센 것이다 — 발신이 실어 온 것을 옮겨 적지
     * 않으므로 캡션과 그림이 갈릴 자리가 없다.
     */
    function captionFor(scene: ImpurityDropsScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'sample': {
          const rootBucket = bucketsOf(scene)[0];
          return t(
            'caption.start',
            'All of them sit in one bucket. The colour boundary lands right on the half-and-half mark. Impurity: {g}',
            { g: level(rootBucket ? giniOf(rootBucket.counts) : 0) },
          );
        }
        case 'cut': {
          const cuts = lastCutsOf(scene);
          const at = cuts.map((cut) => threshold(cut.at)).join(', ');
          // 첫 층인지는 그은 층의 수가 말한다 — 걸음이 깊이를 실어 오지 않는다.
          if (scene.cutLayers.length <= 1) {
            return t('caption.cutRoot', 'One question for the whole bucket. Cut position: {t}', {
              t: at,
            });
          }
          return t('caption.cutAgain', 'Now each bucket gets its own question. Cut positions: {ts}', {
            ts: at,
          });
        }
        case 'split':
          return t(
            'caption.split',
            'Each piece drops to its own impurity — set by where the colour boundary sits, not by how wide the piece is.',
          );
        case 'level':
          return t(
            'caption.level',
            'Impurity of the layer, weighted by bucket size: {to}. It fell by {drop}',
            { to: level(currentLevelOf(scene) ?? 0), drop: level(dropOf(scene) ?? 0) },
          );
        case 'settle':
          return t(
            'caption.settled',
            'Every bucket now carries a single label. Nothing left to ask, so the tree stops.',
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: ImpurityDropsScene): Drawn {
      rewind();
      const s = scalesOf(scene);
      const drawn: Drawn = { bars: [], cuts: [], band: null, arrow: null, tints: [] };

      // ── 머리글. 범례와 섞임 자의 이름·셈법.
      let lx = PLOT_X;
      for (let k = 0; k < scene.classes.length; k += 1) {
        gHead.appendChild(glyph(lx + 5, HEAD_Y - 4, 4.4, k, s.classColors[k] ?? c.itemDefault));
        gHead.appendChild(
          textNode(lx + 14, HEAD_Y, scene.classes[k] ?? '', fontSizes.sm, c.text, 'start'),
        );
        lx += 34;
      }
      gHead.appendChild(
        textNode(AXIS_X, HEAD_Y, t('label.impurity', 'impurity'), fontSizes.sm, c.text, 'start'),
      );
      gHead.appendChild(
        textNode(
          AXIS_X,
          FORMULA_Y,
          t('label.formula', 'impurity = 1 − p(A)² − p(B)²'),
          fontSizes.xs,
          c.textMuted,
          'start',
        ),
      );

      // ── 산점도 틀과 점.
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
      gFrame.appendChild(
        textNode(PLOT_X + 6, PLOT_Y + 14, 'y', fontSizes.xs, c.textMuted, 'start', fonts.mono),
      );
      for (const p of scene.points) {
        const k = Math.max(0, scene.classes.indexOf(p.label));
        gPoints.appendChild(glyph(s.sx(p.x), s.sy(p.y), DOT_R, k, s.classColors[k] ?? c.text));
      }

      // ── 섞임 자 — 세로축과 눈금, 그리고 바닥선.
      const gMax = 1 - 1 / classCountOf(scene);
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
      for (const g of [gMax, gMax / 2, 0]) {
        const y = s.levelY(g);
        gLadder.appendChild(
          el('line', { x1: AXIS_X - 4, y1: y, x2: AXIS_X, y2: y, stroke: c.border, 'stroke-width': 1 }),
        );
        gLadder.appendChild(
          textNode(TICK_X, y + 3.5, g.toFixed(2), fontSizes.xs, c.textMuted, 'end', fonts.mono),
        );
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

      // ── 물든 칸. 통마다 이름표가 하나뿐일 때만 선다.
      if (scene.settled) {
        for (const b of bucketsOf(scene)) {
          const pure = pureClassOf(b.counts);
          if (pure < 0) continue;
          const box = boxRect(s, b.box);
          const rect = el('rect', {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            fill: hexToRgba(s.classColors[pure] ?? c.itemDefault, 0.16),
          });
          gRegions.appendChild(rect);
          drawn.tints.push({ rect, box });
        }
      }

      // ── 그은 가름선. 지나온 층의 것도 남는다 — 질문의 자취다.
      for (let i = 0; i < scene.cutLayers.length; i += 1) {
        const layer = scene.cutLayers[i] ?? [];
        const last = i === scene.cutLayers.length - 1;
        for (const cut of layer) {
          const rect = boxRect(s, cut.box);
          const line = el('line', { stroke: c.text, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
          if (cut.axis === 'x') {
            const x = s.sx(cut.at);
            line.setAttribute('x1', String(x));
            line.setAttribute('x2', String(x));
            line.setAttribute('y1', String(rect.y));
            line.setAttribute('y2', String(rect.y + rect.h));
          } else {
            const y = s.sy(cut.at);
            line.setAttribute('y1', String(y));
            line.setAttribute('y2', String(y));
            line.setAttribute('x1', String(rect.x));
            line.setAttribute('x2', String(rect.x + rect.w));
          }
          gCuts.appendChild(line);
          if (last) drawn.cuts.push({ line, cut, rect });
        }
      }

      // ── 층의 섞임. 지나온 층은 유령선으로 남고 화살이 그 사이를 잇는다.
      for (let i = 0; i + 1 < scene.levels.length; i += 1) {
        const y = s.levelY(scene.levels[i] ?? 0);
        gLevel.appendChild(
          el('line', {
            x1: AXIS_X,
            y1: y,
            x2: BARS_X + BARS_W,
            y2: y,
            stroke: c.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
        const yTo = s.levelY(scene.levels[i + 1] ?? 0);
        // 눈에 띄지 않을 만큼 얕은 낙차에는 화살을 세우지 않는다 — 길이 0 짜리
        // 선을 숨겨 두면 둥근 끝이 점으로 남는다 (프로토콜 4 절).
        if (yTo - y <= 2) continue;
        const line = el('line', {
          x1: ARROW_X,
          y1: y,
          x2: ARROW_X,
          y2: yTo,
          stroke: c.text,
          'stroke-width': 1.4,
        });
        const head = el('polygon', { fill: c.text, points: headPoints(yTo) });
        gLevel.appendChild(line);
        gLevel.appendChild(head);
        drawn.arrow = { line, head };
      }
      const here = currentLevelOf(scene);
      if (here !== null) {
        const y = s.levelY(here);
        const band = el('rect', {
          x: AXIS_X,
          y: y - BAND_H / 2,
          width: BARS_X + BARS_W - AXIS_X,
          height: BAND_H,
          fill: c.accent,
        });
        gLevel.appendChild(band);
        drawn.band = band;
      }

      // ── 막대. 자리를 먼저 한 번에 셈하고 그 다음에 그린다.
      const buckets = bucketsOf(scene);
      const places = placesOf(buckets, totalOf(scene));
      for (let i = 0; i < buckets.length; i += 1) {
        const b = buckets[i];
        const place = places[i];
        if (!b || !place) continue;
        const node = makeBar(s, b, scene.settled);
        const cy = s.levelY(giniOf(b.counts));
        layoutBar(node, place.x, place.w, cy);
        drawn.bars.push({ node, bucket: b, place, cy });
      }

      // ── 캡션. 고정 자리의 두 줄이지만 걸음마다 새로 짓는다 — 재건 밖에 두면
      //    앞 걸음의 글자가 남는다 (프로토콜 4 절).
      const [line1, line2] = wrapTwo(captionFor(scene), CAP_W / 14);
      gCaption.appendChild(textNode(PLOT_X, CAP_Y1, line1, fontSizes.md, c.text, 'start'));
      gCaption.appendChild(textNode(PLOT_X, CAP_Y2, line2, fontSizes.md, c.text, 'start'));

      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 아직 못 온
    // 만큼을 뒤로 물리는 꼴이 된다.

    /** 통 하나가 자의 꼭대기에 부어진다 — 폭이 가운데에서 좌우로 벌어진다. */
    function flowSample(drawn: Drawn, mine: number): Promise<void> {
      const first = drawn.bars[0];
      if (!first) return Promise.resolve();
      const cx = first.place.x + first.place.w / 2;
      return tween(DUR_POUR, mine, easeOut, (e) => {
        layoutBar(first.node, cx - (first.place.w * e) / 2, first.place.w * e, first.cy);
      });
    }

    /** 가름선이 제 칸 안에서 좌우(또는 위아래)로 뻗어 나간다. */
    function flowCut(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.cuts.length === 0) return Promise.resolve();
      return tween(DUR_CUT, mine, easeOut, (e) => {
        for (const { line, cut, rect } of drawn.cuts) {
          if (cut.axis === 'x') {
            const cy = rect.y + rect.h / 2;
            line.setAttribute('y1', String(cy - (rect.h / 2) * e));
            line.setAttribute('y2', String(cy + (rect.h / 2) * e));
          } else {
            const cx = rect.x + rect.w / 2;
            line.setAttribute('x1', String(cx - (rect.w / 2) * e));
            line.setAttribute('x2', String(cx + (rect.w / 2) * e));
          }
        }
      });
    }

    /**
     * 막대가 제자리에서 쪼개지고 조각들이 저마다 제 섞임 높이로 내려간다.
     *
     * 출발 높이는 **바로 앞 층의 통**에서 셈한다. `prev` 를 들추지도, 화면의 지금
     * 높이를 되읽지도 않으므로 어느 걸음에서 와도 같은 데서 떨어진다 (S-scene).
     */
    function flowSplit(scene: ImpurityDropsScene, drawn: Drawn, mine: number): Promise<void> {
      const s = scalesOf(scene);
      const before = previousBucketsOf(scene);
      const heightOf = (id: string): number | null => {
        const same = before.find((b) => b.id === id);
        if (same) return s.levelY(giniOf(same.counts));
        const parentId = id.slice(0, id.lastIndexOf('/'));
        const parent = parentId === '' ? undefined : before.find((b) => b.id === parentId);
        return parent ? s.levelY(giniOf(parent.counts)) : null;
      };
      const moves = drawn.bars.map((bar) => ({
        bar,
        from: heightOf(bar.bucket.id) ?? bar.cy,
      }));
      if (moves.every((m) => m.from === m.bar.cy)) return Promise.resolve();
      // 한 뜻으로 묶인 운동이라 시계를 나누지 않는다 — 조각들이 나란히 내려간다.
      return tween(DUR_DROP, mine, easeInOut, (e) => {
        for (const m of moves) {
          layoutBar(m.bar.node, m.bar.place.x, m.bar.place.w, m.from + (m.bar.cy - m.from) * e);
        }
      });
    }

    /** 띠가 앞 층의 높이에서 무게중심까지 내려오고 화살이 그만큼 자란다. */
    function flowLevel(scene: ImpurityDropsScene, drawn: Drawn, mine: number): Promise<void> {
      const band = drawn.band;
      const from = previousLevelOf(scene);
      const to = currentLevelOf(scene);
      if (!band || from === null || to === null) return Promise.resolve();
      const s = scalesOf(scene);
      const yFrom = s.levelY(from);
      const yTo = s.levelY(to);
      const arrow = drawn.arrow;
      return tween(DUR_LEVEL, mine, easeInOut, (e) => {
        const y = yFrom + (yTo - yFrom) * e;
        band.setAttribute('y', String(y - BAND_H / 2));
        if (arrow) {
          arrow.line.setAttribute('y2', String(y));
          arrow.head.setAttribute('points', headPoints(y));
        }
      });
    }

    /** 이름표가 하나뿐인 칸이 그 이름표의 색으로 번진다 — 가운데에서 바깥으로. */
    function flowSettle(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.tints.length === 0) return Promise.resolve();
      return tween(DUR_TINT, mine, easeOut, (e) => {
        for (const { rect, box } of drawn.tints) {
          rect.setAttribute('x', String(box.x + (box.w / 2) * (1 - e)));
          rect.setAttribute('y', String(box.y + (box.h / 2) * (1 - e)));
          rect.setAttribute('width', String(box.w * e));
          rect.setAttribute('height', String(box.h * e));
        }
      });
    }

    function flowFor(scene: ImpurityDropsScene, drawn: Drawn, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'sample':
          return flowSample(drawn, mine);
        case 'cut':
          return flowCut(drawn, mine);
        case 'split':
          return flowSplit(scene, drawn, mine);
        case 'level':
          return flowLevel(scene, drawn, mine);
        case 'settle':
          return flowSettle(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ImpurityDropsScene,
      _prev: ImpurityDropsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
